/**
 * Per-day economy ledger — "why is my food low?" transparency. Lives on WorldState so it works in
 * both sim modes; the daily layer rolls the day so the raw field is never a day behind.
 */
import type { WorldState, DailyEconomyLedger } from './gameTypes';
import { getAbsoluteCalendarDay } from './dayCycleClock';
import { Human } from './gameConstants';
import { deductResource } from './resourceUtils';

export const ECONOMY_SOURCE_LABELS: Record<string, string> = {
  farms: 'Farms',
  hunting: 'Hunting',
  fishing: 'Fishing',
  foraging: 'Blueberry foraging',
  greenhouse: 'Greenhouses',
  silos: 'Silos',
  challenges: 'Challenges',
  chronicle: 'Chronicles',
  meals: 'Meals',
  medicine: 'Medicine',
  spoilage: 'Spoilage',
  // Deliberate spends, each with a named sink so the ledger and the larder cannot disagree.
  trade: 'Trade routes',
  tribute: 'Tribute',
  gift: 'Gifts',
  treaty: 'Treaties',
  raid: 'Raids',
  refugees: 'Refugees',
  recruitment: 'Recruitment',
  taming: 'Taming',
  shelter: "Children's shelter",
  festival: 'Festivals',
  petition: 'Petitions',
  hospitality: 'Hospitality',
  wedding: 'Weddings',
  disaster: 'Disasters',
};

/** How many finished days of food history the insight UI keeps. */
export const FOOD_HISTORY_MAX_DAYS = 30;

/** Food a colony of `settlers` needs per day at the standard ration. */
export function dailyFoodNeedForSettlers(settlers: number): number {
  return Math.max(0, settlers) * Human.DAILY_FOOD_CONSUMPTION;
}

/** Archive a finished day's ledger into the rolling (transient) food history. */
function pushCompletedDayToHistory(state: WorldState, prev: DailyEconomyLedger): void {
  const history = state.foodHistory ?? [];
  history.push({
    day: prev.day,
    produced: { ...prev.produced },
    consumed: { ...prev.consumed },
  });
  if (history.length > FOOD_HISTORY_MAX_DAYS) {
    history.splice(0, history.length - FOOD_HISTORY_MAX_DAYS);
  }
  state.foodHistory = history;
}

/**
 * Roll the ledger onto the current calendar day, archiving the finished day. Idempotent, so the
 * daily layer and the record functions can both call it.
 */
export function rollEconomyLedgerForDay(state: WorldState): DailyEconomyLedger {
  const day = getAbsoluteCalendarDay(state.tick);
  const prev = state.economyLedger;
  if (prev && prev.day === day) return prev;
  if (prev && prev.day < day) pushCompletedDayToHistory(state, prev);
  const next: DailyEconomyLedger = { day, produced: {}, consumed: {}, producedTotal: 0, consumedTotal: 0 };
  state.economyLedger = next;
  return next;
}

/** Record food that actually entered storage (amount > 0 only). */
export function recordFoodProduced(state: WorldState, source: string, amount: number): void {
  if (amount <= 0) return;
  const ledger = rollEconomyLedgerForDay(state);
  ledger.produced[source] = (ledger.produced[source] ?? 0) + amount;
  // Totals are maintained here, where the entries are, so a reader never adds the map up.
  ledger.producedTotal = (ledger.producedTotal ?? 0) + amount;
}

/** Record food eaten by settlers/visitors. */
export function recordFoodConsumed(state: WorldState, source: string, amount: number): void {
  if (amount <= 0) return;
  const ledger = rollEconomyLedgerForDay(state);
  ledger.consumed[source] = (ledger.consumed[source] ?? 0) + amount;
  ledger.consumedTotal = (ledger.consumedTotal ?? 0) + amount;
}

/**
 * Recompute the day's totals from its entries and store them; the daily economy tick owns the
 * day's balance and heals saves restored mid-day.
 */
export function refreshFoodLedgerTotals(state: WorldState): DailyEconomyLedger | null {
  const ledger = state.economyLedger;
  if (!ledger) return null;
  ledger.producedTotal = Object.values(ledger.produced).reduce((sum, amount) => sum + amount, 0);
  ledger.consumedTotal = Object.values(ledger.consumed).reduce((sum, amount) => sum + amount, 0);
  return ledger;
}

/** Completed-day food flow. 'all' includes every food expense for reporting; 'meals' measures recurring demand for growth decisions. */
export function getRecentFoodFlow(
  state: Pick<WorldState, 'foodHistory' | 'tick'>,
  maxDays = 7,
  consumption: 'all' | 'meals' = 'all',
): { days: number; producedPerDay: number; consumedPerDay: number; netPerDay: number } | null {
  const samples = state.foodHistory ?? [];
  let expectedDay = getAbsoluteCalendarDay(state.tick) - 1;
  let days = 0;
  let produced = 0;
  let consumed = 0;
  for (let i = samples.length - 1; i >= 0 && days < maxDays; i--) {
    const sample = samples[i];
    if (sample.day !== expectedDay) break;
    const dailyProduced = Object.values(sample.produced).reduce((sum, amount) => sum + amount, 0);
    const dailyConsumed = consumption === 'meals'
      ? (sample.consumed.meals ?? 0)
      : Object.values(sample.consumed).reduce((sum, amount) => sum + amount, 0);
    if (!Number.isFinite(dailyProduced) || !Number.isFinite(dailyConsumed)) return null;
    produced += dailyProduced;
    consumed += dailyConsumed;
    days++;
    expectedDay--;
  }
  // A single harvest/meal day cannot establish a sustainable production trend.
  if (days < 3) return null;
  return {
    days,
    producedPerDay: produced / days,
    consumedPerDay: consumed / days,
    netPerDay: (produced - consumed) / days,
  };
}

/** Verified recurring meal deficit, with monthly persistence. One-time recruitment/trade costs affect stores, not meal demand. */
export function isMeasuredFoodDeficit(state: Pick<WorldState, 'foodHistory' | 'tick'>, toleranceRatio: number): boolean {
  const recent = getRecentFoodFlow(state, 7, 'meals');
  if (!recent) return false;
  if (recent.consumedPerDay > 0 && recent.netPerDay < -recent.consumedPerDay * toleranceRatio) return true;
  const month = getRecentFoodFlow(state, 30, 'meals');
  return month != null && month.days >= 14 && month.consumedPerDay > 0
    && month.netPerDay < -month.consumedPerDay * toleranceRatio;
}

/**
 * Seven-day production outlook from real harvested/stored food and observed meal consumption plus
 * its recent upward slope; sparse history stays unknown rather than inferring from building counts.
 */
export function getProjectedFoodSupply(
  state: Pick<WorldState, 'foodHistory' | 'tick'>,
  currentDailyNeed: number,
  horizonDays = 7,
): { producedPerDay: number; projectedNeedPerDay: number; days: number } | null {
  const flow = getRecentFoodFlow(state, 7, 'meals');
  if (!flow || !Number.isFinite(currentDailyNeed) || currentDailyNeed < 0) return null;
  const samples = (state.foodHistory ?? []).slice(-flow.days);
  const size = Math.floor(flow.days / 2);
  let slope = 0;
  if (size >= 2) {
    const dailyConsumption = (sample: typeof samples[number]): number => sample.consumed.meals ?? 0;
    const first = samples.slice(0, size).reduce((sum, entry) => sum + dailyConsumption(entry), 0) / size;
    const last = samples.slice(-size).reduce((sum, entry) => sum + dailyConsumption(entry), 0) / size;
    slope = Math.max(0, (last - first) / Math.max(1, flow.days - size));
  }
  return {
    producedPerDay: flow.producedPerDay,
    // Current population-plus-newcomers demand and measured consumption trend are alternative
    // forecasts, not additive costs. Adding both would count population growth twice.
    projectedNeedPerDay: Math.max(currentDailyNeed,
      flow.consumedPerDay + slope * Math.max(0, horizonDays)),
    days: flow.days,
  };
}

/** Whether staffed production is forecast to fall below near-future demand. */
export function isProjectedFoodShortfall(
  state: Pick<WorldState, 'foodHistory' | 'tick'>,
  currentDailyNeed: number,
  toleranceRatio: number,
): boolean {
  const outlook = getProjectedFoodSupply(state, currentDailyNeed);
  return outlook != null && outlook.producedPerDay
    < outlook.projectedNeedPerDay * (1 + toleranceRatio);
}

/** The current day's ledger, or null when nothing has happened yet today. */
export function getEconomyLedger(state: WorldState): DailyEconomyLedger | null {
  const ledger = state.economyLedger;
  if (!ledger || ledger.day !== getAbsoluteCalendarDay(state.tick)) return null;
  return ledger;
}

/** One line of a day's food balance, already summed. */
export interface FoodLedgerRow {
  source: string;
  amount: number;
}

export interface FoodLedgerToday {
  produced: FoodLedgerRow[];
  consumed: FoodLedgerRow[];
  producedTotal: number;
  consumedTotal: number;
  /** `producedTotal − consumedTotal` for the day so far. */
  net: number;
}

/** A source's share of its own side of the balance, as a whole percentage (0 when nothing moved). */
export function foodSharePct(amount: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((amount / total) * 100)) : 0;
}

/** The named sinks the player or the world can spend food on. */
export type FoodSink =
  | 'meals'
  | 'medicine'
  | 'trade'
  | 'tribute'
  | 'gift'
  | 'treaty'
  | 'raid'
  | 'refugees'
  | 'recruitment'
  | 'taming'
  | 'shelter'
  | 'festival'
  | 'petition'
  | 'hospitality'
  | 'wedding'
  | 'disaster';

/**
 * Spend food from the colony store and record it against a named sink in one call, so a spend
 * cannot reach the store without reaching the ledger; `deductResource` returns what was taken.
 */
export function spendFood(state: WorldState, source: FoodSink, amount: number): number {
  const spent = deductResource(state, 'food', amount);
  if (spent > 0) recordFoodConsumed(state, source, spent);
  return spent;
}

/**
 * The current day's food balance, read from the ledger's own maintained totals. The `?? sum`
 * fallbacks cover only a save loaded mid-day before the next daily tick refreshes them.
 */
export function summarizeFoodLedger(state: WorldState): FoodLedgerToday {
  const ledger = getEconomyLedger(state);
  const rows = (record: Record<string, number> | undefined): FoodLedgerRow[] =>
    Object.entries(record ?? {})
      .filter(([, amount]) => amount > 0)
      .map(([source, amount]) => ({ source, amount }))
      .sort((a, b) => b.amount - a.amount);

  const produced = rows(ledger?.produced);
  const consumed = rows(ledger?.consumed);
  const sum = (list: FoodLedgerRow[]) => list.reduce((total, row) => total + row.amount, 0);
  const producedTotal = ledger?.producedTotal ?? sum(produced);
  const consumedTotal = ledger?.consumedTotal ?? sum(consumed);
  return { produced, consumed, producedTotal, consumedTotal, net: producedTotal - consumedTotal };
}
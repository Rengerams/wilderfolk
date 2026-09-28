/**
 * Per-day economy ledger — "why is my food low?" transparency.
 *
 * Lives on WorldState (economyLedger) so it works in both sim modes (worker
 * syncs the whole world via structuredClone). The day key resets the counters at
 * day rollover; the daily layer calls `rollEconomyLedgerForDay` so the raw
 * `state.economyLedger` field is never a day behind for readers that bypass
 * `getEconomyLedger`.
 */
import type { WorldState, DailyEconomyLedger } from './gameTypes';
import { getAbsoluteCalendarDay } from './dayCycle';
import { deductResource } from './resourceUtils';

export const ECONOMY_SOURCE_LABELS: Record<string, string> = {
  farms: 'Farms',
  hunting: 'Hunting',
  fishing: 'Fishing',
  greenhouse: 'Greenhouses',
  silos: 'Silos',
  challenges: 'Challenges',
  chronicle: 'Chronicles',
  meals: 'Meals',
  medicine: 'Medicine',
  spoilage: 'Spoilage',
  // Deliberate spends. These were 25 separate `resources.food -= …` lines that never told the ledger,
  // so the panel could show a positive `Net` while the larder fell
  // (`LIVE-FINDINGS-STATUS.md`, F2 sweep).
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

/** Archive a finished day's ledger into the rolling (transient) food history. */
function pushCompletedDayToHistory(state: WorldState, prev: DailyEconomyLedger): void {
  if (
    Object.keys(prev.produced).length === 0 &&
    Object.keys(prev.consumed).length === 0
  ) {
    return;
  }
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
 * Roll the ledger onto the current calendar day, archiving the finished day.
 *
 * Reading the ledger is not enough to keep `state.economyLedger` fresh: consumers that read
 * the raw field (dashboardData) would otherwise see yesterday's totals until the new day's
 * first record arrived. This is idempotent, so the daily layer can call it every day and the
 * record functions can keep calling it lazily.
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
 * Recompute the day's totals from its entries, and store them.
 *
 * Called by the daily economy tick (`tickDailyBuildingEconomy`), which is where the day's balance is
 * owned: it makes the stored totals authoritative after the day's production, and heals a save written
 * before the totals existed, or one restored mid-day. The record functions keep them live in between.
 */
export function refreshFoodLedgerTotals(state: WorldState): DailyEconomyLedger | null {
  const ledger = state.economyLedger;
  if (!ledger) return null;
  ledger.producedTotal = Object.values(ledger.produced).reduce((sum, amount) => sum + amount, 0);
  ledger.consumedTotal = Object.values(ledger.consumed).reduce((sum, amount) => sum + amount, 0);
  return ledger;
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
 * Spend food from the colony store and record it against a named sink — one call, so a spend cannot
 * reach the store without reaching the ledger.
 *
 * This replaces 25 scattered `state.resources.food -= …` lines. They deducted correctly (the store did
 * fall in real time) but told the ledger nothing, which is why the "why is my food low?" panel and the
 * dashboard's `Net food flow` could read positive while the larder dropped
 * (`LIVE-FINDINGS-STATUS.md`, F2 sweep — the owner's *"if you spend something it should go down"*).
 * `deductResource` floors at zero and returns what was actually taken, so the ledger records the real
 * spend even where a caller asks for more than is in store.
 */
export function spendFood(state: WorldState, source: FoodSink, amount: number): number {
  const spent = deductResource(state, 'food', amount);
  if (spent > 0) recordFoodConsumed(state, source, spent);
  return spent;
}

/**
 * The current day's food balance, for readers.
 *
 * The totals are the ledger's own fields — maintained as entries are recorded and recomputed by the
 * daily economy tick — so this function **reads** them rather than adding anything up. Both the
 * dashboard projection and the village panel's food card render it; each used to sum the entries
 * itself, which put a food calculation in the view *and* created a second definition of one balance
 * (`LIVE-FINDINGS-STATUS.md`, F2 — "food can't be calculated at the UX", owner: "it should be in
 * dailytick"). The `?? sum` fallbacks exist only for a save loaded mid-day before the next daily tick
 * has refreshed it, and are the single place the old behaviour can still happen.
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
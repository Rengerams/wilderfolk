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

export const ECONOMY_SOURCE_LABELS: Record<string, string> = {
  farms: 'Farms',
  hunting: 'Hunting',
  fishing: 'Fishing',
  greenhouse: 'Greenhouses',
  silos: 'Silos',
  challenges: 'Challenges',
  meals: 'Meals',
  medicine: 'Medicine',
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
  const next: DailyEconomyLedger = { day, produced: {}, consumed: {} };
  state.economyLedger = next;
  return next;
}

/** Record food that actually entered storage (amount > 0 only). */
export function recordFoodProduced(state: WorldState, source: string, amount: number): void {
  if (amount <= 0) return;
  const ledger = rollEconomyLedgerForDay(state);
  ledger.produced[source] = (ledger.produced[source] ?? 0) + amount;
}

/** Record food eaten by settlers/visitors. */
export function recordFoodConsumed(state: WorldState, source: string, amount: number): void {
  if (amount <= 0) return;
  const ledger = rollEconomyLedgerForDay(state);
  ledger.consumed[source] = (ledger.consumed[source] ?? 0) + amount;
}

/** The current day's ledger, or null when nothing has happened yet today. */
export function getEconomyLedger(state: WorldState): DailyEconomyLedger | null {
  const ledger = state.economyLedger;
  if (!ledger || ledger.day !== getAbsoluteCalendarDay(state.tick)) return null;
  return ledger;
}

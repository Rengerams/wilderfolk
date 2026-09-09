/**
 * Per-day economy ledger — "why is my food low?" transparency.
 *
 * Lives on WorldState (economyLedger) so it works in both sim modes (worker
 * syncs the whole world via structuredClone). The day key lazily resets the
 * counters at day rollover, so no separate day-boundary hook is needed.
 */
import type { WorldState, DailyEconomyLedger } from './gameTypes';
import { getAbsoluteCalendarDay } from './dayCycle';

export const ECONOMY_SOURCE_LABELS: Record<string, string> = {
  farms: 'Farms',
  hunting: 'Hunting',
  silos: 'Silos',
  challenges: 'Challenges',
  meals: 'Meals',
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

function ensureLedger(state: WorldState): DailyEconomyLedger {
  const day = getAbsoluteCalendarDay(state.tick);
  if (!state.economyLedger || state.economyLedger.day !== day) {
    const prev = state.economyLedger;
    if (prev && prev.day < day) pushCompletedDayToHistory(state, prev);
    state.economyLedger = { day, produced: {}, consumed: {} };
  }
  return state.economyLedger;
}

/** Record food that actually entered storage (amount > 0 only). */
export function recordFoodProduced(state: WorldState, source: string, amount: number): void {
  if (amount <= 0) return;
  const ledger = ensureLedger(state);
  ledger.produced[source] = (ledger.produced[source] ?? 0) + amount;
}

/** Record food eaten by settlers/visitors. */
export function recordFoodConsumed(state: WorldState, source: string, amount: number): void {
  if (amount <= 0) return;
  const ledger = ensureLedger(state);
  ledger.consumed[source] = (ledger.consumed[source] ?? 0) + amount;
}

/** The current day's ledger, or null when nothing has happened yet today. */
export function getEconomyLedger(state: WorldState): DailyEconomyLedger | null {
  const ledger = state.economyLedger;
  if (!ledger || ledger.day !== getAbsoluteCalendarDay(state.tick)) return null;
  return ledger;
}

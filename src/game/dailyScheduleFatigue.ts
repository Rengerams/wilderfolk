import type { Entity, WorldState } from './gameTypes';
import { logEvent } from './eventLog';
import { resolveDailyScheduleFatigue } from './scheduleFatigue';

const MEANINGFUL_FATIGUE_CHANGE = 8;

type FatigueResult = ReturnType<typeof resolveDailyScheduleFatigue>;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

/**
 * Resolves each eligible settler's schedule fatigue at the day boundary and
 * writes at most one meaningful village-level chronicle event. Individual
 * fatigue remains authoritative on the people; this module only aggregates
 * their player-facing explanation.
 */
export function resolveDailyVillageScheduleFatigue(
  state: WorldState,
  humans: readonly Entity[],
): void {
  const results: FatigueResult[] = [];

  for (const human of humans) {
    if (!human.alive || human.isJuvenile) continue;
    const result = resolveDailyScheduleFatigue(human, state);
    if (Math.abs(result.fatigueAfter - result.fatigueBefore) >= MEANINGFUL_FATIGUE_CHANGE) {
      results.push(result);
    }
  }

  const fatigueRises = results.filter(
    (result) => result.workedHours > 0 && result.fatigueAfter > result.fatigueBefore,
  );
  if (fatigueRises.length > 0) {
    const before = average(fatigueRises.map((result) => result.fatigueBefore));
    const after = average(fatigueRises.map((result) => result.fatigueAfter));
    const hours = average(fatigueRises.map((result) => result.workedHours));
    logEvent(
      state,
      'event',
      `Work schedule raised fatigue for ${fatigueRises.length} settler${fatigueRises.length === 1 ? '' : 's'} (${Math.round(before)}% → ${Math.round(after)}% after ${formatHours(hours)} shifts).`,
    );
  }

  // Off-shift recovery remains part of the simulation but is ordinary rest, not
  // a chronicle event. Only describe recovery that followed an actual short shift.
  const workedRecoveries = results.filter(
    (result) => result.workedHours > 0 && result.fatigueAfter < result.fatigueBefore,
  );
  if (workedRecoveries.length > 0) {
    const before = average(workedRecoveries.map((result) => result.fatigueBefore));
    const after = average(workedRecoveries.map((result) => result.fatigueAfter));
    const hours = average(workedRecoveries.map((result) => result.workedHours));
    logEvent(
      state,
      'event',
      `Short shifts eased fatigue for ${workedRecoveries.length} settler${workedRecoveries.length === 1 ? '' : 's'} (${Math.round(before)}% → ${Math.round(after)}% after ${formatHours(hours)} of work).`,
    );
  }
}

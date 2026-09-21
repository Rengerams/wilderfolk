import type { Entity, WorldState } from './gameTypes';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './playerHuman';
import { getScheduleTargetHours, resolveDailyScheduleFatigue } from './scheduleFatigue';

const MEANINGFUL_FATIGUE_CHANGE = 8;

/** The bands the HUD names a village's average fatigue by, worst first. */
export const FATIGUE_BANDS = { high: 60, building: 25 } as const;

export interface VillageFatigueReading {
  /** Mean `scheduleFatigue` over the living adult settlers. */
  average: number;
  label: 'low' | 'building' | 'high';
}

/**
 * The village-level fatigue reading the work-schedule panel shows: the mean over living adult settlers
 * and the band its label comes from.
 *
 * Both halves lived in that view (`WorkSchedulePanel` averaged `scheduleFatigue` and banded it at 60/25
 * itself), so the thresholds a designer tunes sat in a component, invisible to this module — which
 * already aggregates the same quantity for the chronicle and owns its wording (2026-09-20 audit, O-8).
 */
export function readVillageFatigue(state: WorldState): VillageFatigueReading {
  const values: number[] = [];
  for (const entity of state.entities) {
    if (!entity.alive || entity.isJuvenile || !isPlayerHuman(entity)) continue;
    values.push(entity.scheduleFatigue ?? 0);
  }
  const mean = average(values);
  return {
    average: mean,
    label: mean >= FATIGUE_BANDS.high ? 'high' : mean >= FATIGUE_BANDS.building ? 'building' : 'low',
  };
}

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
  // The standard work window is the same for every settler in this pass — `state.workSchedule` is
  // written only at the worker boundary (`simPrep`/`simDelta`) and nothing in this loop touches it —
  // so it is derived once instead of twice per settler.
  const targetHours = getScheduleTargetHours(state);

  for (const human of humans) {
    if (!human.alive || human.isJuvenile) continue;
    const result = resolveDailyScheduleFatigue(human, state, targetHours);
    if (Math.abs(result.fatigueAfter - result.fatigueBefore) >= MEANINGFUL_FATIGUE_CHANGE) {
      results.push(result);
    }
  }

  // One pass partitions `results` into the two reporting halves and accumulates each half's sums.
  // The halves used to be built with two `.filter`s and then re-walked six times by `.map()` inside
  // `average()`; accumulating in the same index order keeps every sum bit-identical.
  let rises = 0;
  let riseBefore = 0;
  let riseAfter = 0;
  let riseHours = 0;
  let recoveries = 0;
  let recoveryBefore = 0;
  let recoveryAfter = 0;
  let recoveryHours = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.workedHours <= 0) continue;
    if (result.fatigueAfter > result.fatigueBefore) {
      rises++;
      riseBefore += result.fatigueBefore;
      riseAfter += result.fatigueAfter;
      riseHours += result.workedHours;
    } else if (result.fatigueAfter < result.fatigueBefore) {
      recoveries++;
      recoveryBefore += result.fatigueBefore;
      recoveryAfter += result.fatigueAfter;
      recoveryHours += result.workedHours;
    }
  }

  if (rises > 0) {
    logEvent(
      state,
      'event',
      `Work schedule raised fatigue for ${rises} settler${rises === 1 ? '' : 's'} (${Math.round(riseBefore / rises)}% → ${Math.round(riseAfter / rises)}% after ${formatHours(riseHours / rises)} shifts).`,
    );
  }

  // Off-shift recovery remains part of the simulation but is ordinary rest, not
  // a chronicle event. Only describe recovery that followed an actual short shift.
  if (recoveries > 0) {
    logEvent(
      state,
      'event',
      `Short shifts eased fatigue for ${recoveries} settler${recoveries === 1 ? '' : 's'} (${Math.round(recoveryBefore / recoveries)}% → ${Math.round(recoveryAfter / recoveries)}% after ${formatHours(recoveryHours / recoveries)} of work).`,
    );
  }
}
import type { Building, Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { logEvent } from './eventLog';
import { isPlayerHuman, isPlayerHumanShiftOwner } from './playerHuman';
import { getAbsoluteCalendarDay, isWorkDay, TICKS_PER_DAY } from './dayCycleClock';
import { recordCareerWork } from './careers/careerHistory';
import { advanceCareerProgression } from './careers/careerProgression';
import { getScheduleProductivityMultiplier, getScheduleTargetHours, resolveDailyScheduleFatigue } from './scheduleFatigue';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';

const MEANINGFUL_FATIGUE_CHANGE = 8;

/** The bands the HUD names a village's average fatigue by, worst first. */
export const FATIGUE_BANDS = { high: 60, building: 25 } as const;

export interface VillageFatigueReading {
  /** Mean `scheduleFatigue` over the living adult settlers. */
  average: number;
  label: 'low' | 'building' | 'high';
  /** The work-output share that mean implies — the one consequence the player can act on. */
  outputShare: number;
}

/**
 * The village-level fatigue reading the work-schedule panel shows: the mean over living adult settlers
 * and the band its label comes from, using this module's thresholds rather than a view's own copy.
 */
export function readVillageFatigue(state: WorldState): VillageFatigueReading {
  const values: number[] = [];
  for (const entity of state.entities) {
    if (!entity.alive || entity.age < HUMAN_ADULT_MIN_AGE || !isPlayerHuman(entity)) continue;
    values.push(entity.scheduleFatigue ?? 0);
  }
  const mean = average(values);
  return {
    average: mean,
    label: mean >= FATIGUE_BANDS.high ? 'high' : mean >= FATIGUE_BANDS.building ? 'building' : 'low',
    outputShare: getScheduleProductivityMultiplier({ scheduleFatigue: mean }),
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
 * Resolves each eligible settler's schedule fatigue at the day boundary and writes at most one
 * meaningful village-level chronicle event; individual fatigue stays authoritative on the people.
 */
export function resolveDailyVillageScheduleFatigue(
  state: WorldState,
  humans: readonly Entity[],
  buildingById: ReadonlyMap<number, Building>,
  moonHowlers: readonly Entity[] = [],
): void {
  const results: FatigueResult[] = [];
  // The standard work window is the same for every settler in this pass — `state.workSchedule` is
  // written only at the worker boundary — so it is derived once instead of twice per settler.
  const targetHours = getScheduleTargetHours(state);
  const completedDay = getAbsoluteCalendarDay(state.tick) - 1;
  const completedDayWasWorkday = isWorkDay(completedDay * TICKS_PER_DAY);

  // Settle a transformed settler's previous human shift at midnight.
  for (let i = 0; i < humans.length + moonHowlers.length; i++) {
    const inMoonForm = i >= humans.length;
    const human = inMoonForm ? moonHowlers[i - humans.length] : humans[i];
    if (!human.alive || human.age < HUMAN_ADULT_MIN_AGE) continue;
    if (inMoonForm && (human.type !== EntityType.Werewolf || !isPlayerHumanShiftOwner(human))) continue;
    const priorLastWorkedHours = human.scheduleLastWorkedHours ?? 0;
    const result = resolveDailyScheduleFatigue(human, state, targetHours);
    // Do not erase the last worked day when the completed day was a non-workday:
    // Monday production must read Friday's attendance, not Sunday's zero.
    if (!completedDayWasWorkday && result.workedHours <= 0 && priorLastWorkedHours > 0) {
      human.scheduleLastWorkedHours = priorLastWorkedHours;
    }
    // Credit the just-completed day's witnessed shift now, not at tomorrow's noon
    // production pass. Reuse this settlement loop and the tick context's building index.
    const site = human.scheduleLastWorkedSiteId == null
      ? undefined : buildingById.get(human.scheduleLastWorkedSiteId);
    const job = human.scheduleLastWorkedJob;
    if (site && job && recordCareerWork(human, site, job, completedDay, result.workedHours)) {
      advanceCareerProgression(human, job, completedDay, 'work');
    }
    if (Math.abs(result.fatigueAfter - result.fatigueBefore) >= MEANINGFUL_FATIGUE_CHANGE) {
      results.push(result);
    }
  }

  // One pass splits the day's workers into those over their hours and those under them.
  let rises = 0;
  let riseHours = 0;
  let recoveries = 0;
  let recoveryHours = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.workedHours <= 0) continue;
    if (result.fatigueAfter > result.fatigueBefore) {
      rises++;
      riseHours += result.workedHours;
    } else if (result.fatigueAfter < result.fatigueBefore) {
      recoveries++;
      recoveryHours += result.workedHours;
    }
  }

  if (rises > 0) {
    logEvent(
      state,
      'event',
      `Longer shifts reduced work output for ${rises} settler${rises === 1 ? '' : 's'} tomorrow (each worked ${formatHours(riseHours / rises)} on average).`,
    );
  }

  // Off-shift recovery remains part of the simulation but is ordinary rest, not
  // a chronicle event. Only describe recovery that followed an actual short shift.
  if (recoveries > 0) {
    logEvent(
      state,
      'event',
      `Short shifts spared ${recoveries} settler${recoveries === 1 ? '' : 's'} from that output cost (each worked ${formatHours(recoveryHours / recoveries)} on average).`,
    );
  }
}
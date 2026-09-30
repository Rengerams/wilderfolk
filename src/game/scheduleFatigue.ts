import type { Entity, WorldState } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycle';
import { getWorkSchedule } from './workSchedule';

export const MAX_SCHEDULE_FATIGUE = 100;
/** The worst output a fully fatigued crew can fall to — the floor of the penalty, not a % of energy. */
export const MIN_SCHEDULE_PRODUCTIVITY = 0.65;
/**
 * The normal work day, in hours (owner: "normal work day is 9 hrs").
 *
 * Everything about a shift is measured from this one number: a settler who works this many
 * hours is neutral — no fatigue gain, no recovery — and `getWorkHourProductionMultiplier`
 * in `workSchedule` treats the same 9 hours as 1.0 output (`STANDARD_PRODUCTION_WORK_HOURS`).
 * It was 8 here while production used 9, so the game's own normal day accrued
 * `FATIGUE_PER_EXCESS_HOUR` of overtime every day for a settler simply doing a standard shift.
 */
export const NEUTRAL_WORK_HOURS = 9;
export const FATIGUE_PER_EXCESS_HOUR = 10;
export const RECOVERY_PER_SHORT_HOUR = 3;
export const BASE_DAILY_RECOVERY = 4;

export function getScheduleFatigue(entity: Pick<Entity, 'scheduleFatigue'>): number {
  return Math.max(0, Math.min(MAX_SCHEDULE_FATIGUE, entity.scheduleFatigue ?? 0));
}

export function getScheduleProductivityMultiplier(entity: Pick<Entity, 'scheduleFatigue'>): number {
  return Math.max(MIN_SCHEDULE_PRODUCTIVITY, 1 - getScheduleFatigue(entity) * 0.0035);
}

export function recordScheduleWorkTick(entity: Entity): void {
  if (!entity.alive || entity.isJuvenile || entity.faction) return;
  entity.scheduleWorkedTicksToday = (entity.scheduleWorkedTicksToday ?? 0) + 1;
}

/**
 * Resolve a settler's fatigue for the day.
 *
 * Takes only the two fields it actually touches, matching its siblings `getScheduleFatigue` and
 * `getScheduleProductivityMultiplier` above. It deliberately does **not** narrow on `alive`, `isJuvenile`
 * or `faction` the way `recordScheduleWorkTick` does — this is the end-of-day settle, and it must run
 * for every settler who accrued hours, so a full `Entity` is not required to answer it (2026-09-20
 * audit: the narrower parameter is what lets the fixture call this without casting a partial entity).
 */
/**
 * The standard work window's length, capped at the neutral day — the loop-invariant half of
 * `resolveDailyScheduleFatigue` below.
 *
 * Exported so a pass that resolves many settlers can derive it once instead of paying
 * `getWorkSchedule` (which normalizes and allocates a fresh `{startHour, endHour}`) twice per
 * settler. `state.workSchedule` is written only at the worker boundary (`simPrep`, `simDelta`).
 */
export function getScheduleTargetHours(state: Pick<WorldState, 'workSchedule'>): number {
  const schedule = getWorkSchedule(state);
  return Math.min(NEUTRAL_WORK_HOURS, schedule.endHour - schedule.startHour);
}

export function resolveDailyScheduleFatigue(
  entity: Pick<Entity, 'scheduleFatigue' | 'scheduleWorkedTicksToday' | 'scheduleLastWorkedHours'>,
  state: Pick<WorldState, 'workSchedule'>,
  /** Pre-derived `getScheduleTargetHours(state)` for a caller resolving many settlers in one pass. */
  targetHoursForPass?: number,
): { workedHours: number; fatigueBefore: number; fatigueAfter: number } {
  const workedHours = (entity.scheduleWorkedTicksToday ?? 0) / TICKS_PER_HOUR;
  const targetHours = targetHoursForPass ?? getScheduleTargetHours(state);
  const fatigueBefore = getScheduleFatigue(entity);
  const excess = Math.max(0, workedHours - targetHours);
  const rest = Math.max(0, targetHours - workedHours);
  const recovery = BASE_DAILY_RECOVERY + rest * RECOVERY_PER_SHORT_HOUR;
  const fatigueAfter = Math.max(0, Math.min(MAX_SCHEDULE_FATIGUE, fatigueBefore + excess * FATIGUE_PER_EXCESS_HOUR - recovery));
  entity.scheduleFatigue = fatigueAfter;
  // Keep the day's attendance before zeroing the accumulator. The daily economy runs *after*
  // this pass and must pay for work a settler actually turned up for, so it reads this snapshot
  // (see `getScheduleLastWorkedHours`). Without it the only record of attendance was destroyed
  // here, and production fell back to counting assigned bodies parked at home or asleep.
  entity.scheduleLastWorkedHours = workedHours;
  entity.scheduleWorkedTicksToday = 0;
  return { workedHours, fatigueBefore, fatigueAfter };
}

/**
 * The hours a settler actually spent on shift across the last settled day.
 *
 * This is the attendance half of the daily production calculation: `buildingWorkerStats` in
 * `dailyBuildingEconomy` sums it per workplace so a settler who never showed up contributes
 * nothing, which is what the owner asked for ("the person who is working there should be
 * measured"). Kept as one reader so the field is not read directly from the economy.
 */
export function getScheduleLastWorkedHours(entity: Pick<Entity, 'scheduleLastWorkedHours'>): number {
  const hours = entity.scheduleLastWorkedHours ?? 0;
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/**
 * The share of a workplace's configured window its crew actually put in — the single rule both real
 * production (`dailyBuildingEconomy.tickBuildingProduction`) and the workshop estimate
 * (`workshopEconomy.estimateWorkshopGold`) apply, so a preview cannot drift from the output.
 *
 * `workedHours` is the mean hours one settler really worked; `assigned` is how many settlers the
 * building holds. A crew that works its whole window scores 1 and keeps exactly the output the
 * window alone used to give; a crew that does half scores 0.5; a crew with nobody present scores 0,
 * which is the owner's "the person who is working there should be measured".
 *
 * `hasAttendance` is `false` only while no settled day has been recorded yet — a fresh world or one
 * that has just loaded. It reports 1 rather than 0 there, because "not yet measured" must not read
 * as "nobody ever works": before the first day boundary every workplace would otherwise produce
 * nothing, and an inspector preview would show a standing workshop as idle.
 */
export function getWorkplacePresenceShare(
  workedHours: number,
  assigned: number,
  scheduleHours: number,
  hasAttendance: boolean,
): number {
  if (assigned <= 0 || scheduleHours <= 0) return 1;
  if (!hasAttendance) return 1;
  const share = workedHours / scheduleHours;
  if (!Number.isFinite(share) || share <= 0) return 0;
  return Math.min(1, share);
}
import type { Entity } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { STANDARD_WORK_DAY_HOURS } from './workSchedule';
import { isPlayerHuman } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { JobType } from './gameTypes';

const MAX_SCHEDULE_FATIGUE = 100;
/** The worst output a fully fatigued crew can fall to — the floor of the penalty, not a % of energy. */
export const MIN_SCHEDULE_PRODUCTIVITY = 0.65;
const FATIGUE_PER_EXCESS_HOUR = 10;
const RECOVERY_PER_SHORT_HOUR = 3;
const BASE_DAILY_RECOVERY = 4;

export function getScheduleFatigue(entity: Pick<Entity, 'scheduleFatigue'>): number {
  return Math.max(0, Math.min(MAX_SCHEDULE_FATIGUE, entity.scheduleFatigue ?? 0));
}

export function getScheduleProductivityMultiplier(entity: Pick<Entity, 'scheduleFatigue'>): number {
  return Math.max(MIN_SCHEDULE_PRODUCTIVITY, 1 - getScheduleFatigue(entity) * 0.0035);
}

/**
 * Credit `step` consecutive ticks of attendance — one call per evaluated tick, so a caller that
 * does not evaluate every tick can still record the ticks it covered (see `humanTick`).
 */
export function recordScheduleWorkTick(
  entity: Entity,
  step = 1,
  siteId = entity.workerBuildingId ?? -1,
  job: JobType | null = entity.job ?? null,
): void {
  if (!entity.alive || entity.age < HUMAN_ADULT_MIN_AGE || !isPlayerHuman(entity)) return;
  // A jailed settler keeps the reserved post but earns no attendance: a cell is not a shift.
  if (entity.prisonBuildingId != null) return;
  if (!Number.isFinite(step) || step <= 0) return;
  const priorTicks = entity.scheduleWorkedTicksToday ?? 0;
  if (priorTicks === 0) {
    entity.scheduleWorkedSiteIdToday = siteId;
    entity.scheduleWorkedJobToday = job;
  } else {
    if (entity.scheduleWorkedSiteIdToday !== siteId) entity.scheduleWorkedSiteIdToday = -1;
    if (entity.scheduleWorkedJobToday !== job) entity.scheduleWorkedJobToday = null;
  }
  entity.scheduleWorkedTicksToday = priorTicks + step;
}

/** Credit only a tick the settler actually spent at the post. */
export function recordPresentWorkTick(
  entity: Entity,
  step = 1,
  siteId = entity.workerBuildingId ?? -1,
): void {
  if (!entity.alive || entity.age < HUMAN_ADULT_MIN_AGE || !isPlayerHuman(entity)) return;
  if (entity.prisonBuildingId != null) return;
  if (!Number.isFinite(step) || step <= 0) return;
  const priorTicks = entity.schedulePresentTicksToday ?? 0;
  if (priorTicks === 0) entity.schedulePresentSiteIdToday = siteId;
  else if (entity.schedulePresentSiteIdToday !== siteId) entity.schedulePresentSiteIdToday = -1;
  entity.schedulePresentTicksToday = priorTicks + step;
}

/**
 * Resolve a settler's fatigue for the day. This is the end-of-day settle, so it does not narrow on
 * `alive`, age or `faction` the way the per-tick recorders do. All jobs use the same fixed
 * nine-hour baseline; the configured ordinary work window never changes recovery or overtime.
 */
export function resolveDailyScheduleFatigue(
  entity: Pick<Entity, 'scheduleFatigue' | 'scheduleWorkedTicksToday' | 'schedulePresentTicksToday'
    | 'schedulePresentSiteIdToday' | 'scheduleLastWorkedHours'
    | 'scheduleWorkedSiteIdToday' | 'scheduleLastWorkedSiteId'
    | 'scheduleWorkedJobToday' | 'scheduleLastWorkedJob'>,
): { workedHours: number; fatigueBefore: number; fatigueAfter: number } {
  const workedHours = (entity.scheduleWorkedTicksToday ?? 0) / TICKS_PER_HOUR;
  const fatigueBefore = getScheduleFatigue(entity);
  const excess = Math.max(0, workedHours - STANDARD_WORK_DAY_HOURS);
  const rest = Math.max(0, STANDARD_WORK_DAY_HOURS - workedHours);
  const recovery = BASE_DAILY_RECOVERY + rest * RECOVERY_PER_SHORT_HOUR;
  const fatigueAfter = Math.max(0, Math.min(MAX_SCHEDULE_FATIGUE, fatigueBefore + excess * FATIGUE_PER_EXCESS_HOUR - recovery));
  entity.scheduleFatigue = fatigueAfter;
  // Keep the schedule-only shift record for career history. Production reads the
  // independently verified present ticks above, so this snapshot cannot pay an absent worker.
  entity.scheduleLastWorkedHours = workedHours;
  entity.scheduleLastWorkedSiteId = workedHours > 0 ? (entity.scheduleWorkedSiteIdToday ?? -1) : undefined;
  entity.scheduleLastWorkedJob = workedHours > 0 ? (entity.scheduleWorkedJobToday ?? null) : undefined;
  entity.scheduleWorkedSiteIdToday = undefined;
  entity.scheduleWorkedJobToday = undefined;
  entity.scheduleWorkedTicksToday = 0;
  entity.schedulePresentSiteIdToday = undefined;
  entity.schedulePresentTicksToday = 0;
  return { workedHours, fatigueBefore, fatigueAfter };
}

/**
 * The schedule-only hours a settled day bills when it left no witnessed sample — the fallback
 * `getWorkdayAttendance` reads. Clamped so a corrupt save cannot bill negative or non-finite hours.
 */
function getScheduleLastWorkedHours(entity: Pick<Entity, 'scheduleLastWorkedHours'>): number {
  const hours = entity.scheduleLastWorkedHours ?? 0;
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/**
 * What a settled day earned one worker: the ticks a production pass may pay for, and the site they
 * belong to (`-1` when the settler changed sites mid-day, `undefined` when none was recorded).
 */
export interface WorkdayAttendance {
  ticks: number;
  siteId: number | undefined;
}

/**
 * The attendance a shift really earned today — the single rule a production pass reads.
 *
 * A positive rota tick means presence was sampled on it (`humanTick` credits both in the same
 * branch), so a scheduled crew is paid for its witnessed ticks even when that number is zero: a
 * settler who never reached the post earns nothing. Schedule hours only stand in for a shift no
 * fixed post can witness (a mobile hunter, whose work is the field) or for a day with no positive
 * rota/presence sample at all (a legacy save, a non-workday, or a shift that has not started yet).
 * A deployed person always earns zero local attendance, including with stale saved hours.
 */
export function getWorkdayAttendance(
  worker: Pick<Entity, 'schedulePresentTicksToday' | 'schedulePresentSiteIdToday'
    | 'scheduleWorkedTicksToday' | 'scheduleWorkedSiteIdToday'
    | 'scheduleLastWorkedSiteId' | 'scheduleLastWorkedHours' | 'raidDeploymentId'>,
  /** A mobile shift is never witnessed at a fixed post, so its schedule hours are its attendance. */
  mobileShift = false,
): WorkdayAttendance {
  // A deployed worker is physically away, even if a legacy save retained yesterday's hours.
  if (worker.raidDeploymentId != null) return { ticks: 0, siteId: undefined };
  const worked = worker.scheduleWorkedTicksToday;
  const present = worker.schedulePresentTicksToday;
  if (mobileShift) {
    if (worked != null) return { ticks: worked, siteId: worker.scheduleWorkedSiteIdToday };
    if (present != null) {
      return { ticks: present, siteId: present > 0 ? worker.schedulePresentSiteIdToday : undefined };
    }
  } else if ((worked ?? 0) > 0 || (present ?? 0) > 0) {
    const ticks = present ?? 0;
    return { ticks, siteId: ticks > 0 ? worker.schedulePresentSiteIdToday : undefined };
  }
  return {
    ticks: getScheduleLastWorkedHours(worker) * TICKS_PER_HOUR,
    siteId: worker.scheduleLastWorkedSiteId,
  };
}

/**
 * Return the practiced trade before midnight settlement clears today's attendance.
 * The previous day's hours must never protect an idle occupation from decay.
 */
export function getPracticedJobForCompletedDay(entity: Entity): JobType | undefined {
  const job = entity.scheduleWorkedJobToday;
  const siteId = entity.scheduleWorkedSiteIdToday;
  if (!job || job === JobType.Settler || siteId == null || siteId < 0
    || (entity.scheduleWorkedTicksToday ?? 0) <= 0) return undefined;
  const attendance = getWorkdayAttendance(entity, job === JobType.Hunter);
  return attendance.ticks > 0 && attendance.siteId === siteId ? job : undefined;
}

/**
 * The share of a workplace's configured window its crew actually put in — the single rule behind both
 * real production and the workshop estimate. No attendance credit means no production.
 */
export function getWorkplacePresenceShare(
  workedHours: number,
  assigned: number,
  scheduleHours: number,
  hasAttendance: boolean,
): number {
  if (assigned <= 0 || scheduleHours <= 0) return 0;
  // No recorded attendance means no production. Assignment alone never
  // proves that the worker physically attended a shift.
  if (!hasAttendance) return 0;
  const share = workedHours / scheduleHours;
  if (!Number.isFinite(share) || share <= 0) return 0;
  return Math.min(1, share);
}
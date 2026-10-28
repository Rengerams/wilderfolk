import type { Building, Entity } from '../gameTypes';
import { BUILDING_JOB_TYPES, EntityType, JobType } from '../gameTypes';
import { HUMAN_ADULT_MIN_AGE } from '../daycycleconstants';

/** Compact, genuine worked shifts. One credit per person, profession and settled day. */
export const MAX_CREDITED_DAYS = 65_535;
export const MAX_CAREER_DAY = 2_147_483_647;
export interface CareerJobHistory {
  days: number;
  lastDay: number;
}
export type CareerHistory = Partial<Record<JobType, CareerJobHistory>>;

/** A missing or corrupt legacy record represents no invented previous shifts. */
export function normalizeCareerHistory(raw: unknown): CareerHistory | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  if (Object.keys(raw).length > Object.values(JobType).length) return undefined;
  const out: CareerHistory = {};
  for (const job of Object.values(JobType)) {
    if (job === JobType.Settler || job === JobType.Guard) continue;
    const row = (raw as Record<string, unknown>)[job];
    if (row === undefined) continue;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const { days, lastDay } = row as Record<string, unknown>;
    if (!Number.isSafeInteger(days) || (days as number) < 1 || (days as number) > MAX_CREDITED_DAYS
      || !Number.isSafeInteger(lastDay) || (lastDay as number) < 0
      || (lastDay as number) > MAX_CAREER_DAY
      || (days as number) > (lastDay as number) + 1) continue;
    out[job] = { days: days as number, lastDay: lastDay as number };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Sole write path for attended career credits; economy supplies independently observed hours. */
export function recordCareerWork(
  worker: Entity, site: Building, job: JobType, day: number, observedHours: number,
): boolean {
  if (worker.type !== EntityType.Human || !worker.alive || worker.isJuvenile
    || worker.age < HUMAN_ADULT_MIN_AGE || worker.faction || worker.prisonBuildingId != null) return false;
  if (!Number.isSafeInteger(day) || day < 0 || day > MAX_CAREER_DAY
    || !Number.isFinite(observedHours) || observedHours <= 0) return false;
  // Last-settled shift provenance, not today's mutable job/roster, establishes where
  // this person actually worked. A full-moon transformation vacates the post at
  // 23:00; the seat can be filled before the person reverts at dawn.
  if (worker.scheduleLastWorkedSiteId !== site.id || worker.scheduleLastWorkedJob !== job
    || !site.completed || site.faction === 'rival' || BUILDING_JOB_TYPES[site.type] !== job) return false;
  const previous = worker.careerHistory?.[job];
  if (previous && (previous.lastDay >= day || previous.days >= MAX_CREDITED_DAYS)) return false;
  const history = worker.careerHistory ?? (worker.careerHistory = {});
  history[job] = { days: (previous?.days ?? 0) + 1, lastDay: day };
  return true;
}

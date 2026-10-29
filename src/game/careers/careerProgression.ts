import type { Entity } from '../gameTypes';
import { JobType } from '../gameTypes';
import { MAX_CAREER_DAY, type CareerHistory } from './careerHistory';

export type CareerTier = 'practiced' | 'experienced' | 'master';
export interface CareerMilestone {
  tier?: CareerTier;
  tierAtDay?: number;
  trainedAtDay?: number;
}
export type CareerMilestones = Partial<Record<JobType, CareerMilestone>>;

/** Work thresholds grant descriptive history, never a skill or staffing advantage. */
export const CAREER_TIER_DAYS = { practiced: 15, experienced: 60, master: 180 } as const;

/** Player-facing name of each descriptive tier above. */
export const CAREER_TIER_LABELS: Readonly<Record<CareerTier, string>> = {
  practiced: 'Practiced',
  experienced: 'Experienced',
  master: 'Master',
};

export function normalizeCareerMilestones(raw: unknown, history?: CareerHistory): CareerMilestones | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  if (Object.keys(raw).length > Object.values(JobType).length) return undefined;
  const out: CareerMilestones = {};
  for (const job of Object.values(JobType)) {
    if (job === JobType.Settler || job === JobType.Guard) continue;
    const row = (raw as Record<string, unknown>)[job];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    const trained = item.trainedAtDay;
    const tier = item.tier;
    const tierDay = item.tierAtDay;
    const validDay = (v: unknown): v is number =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_CAREER_DAY;
    const milestone: CareerMilestone = {};
    if (validDay(trained)) milestone.trainedAtDay = trained;
    if ((tier === 'practiced' || tier === 'experienced' || tier === 'master')
      && validDay(tierDay) && (history?.[job]?.days ?? 0) >= CAREER_TIER_DAYS[tier]) {
      milestone.tier = tier;
      milestone.tierAtDay = tierDay;
    }
    if (Object.keys(milestone).length) out[job] = milestone;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Only a genuine credited shift or actual apprenticeship completion may advance milestones. */
export function advanceCareerProgression(
  person: Entity, job: JobType, day: number, source: 'work' | 'training',
): boolean {
  if (!Number.isSafeInteger(day) || day < 0 || day > MAX_CAREER_DAY) return false;
  const previous = person.careerMilestones?.[job];
  if (source === 'training') {
    if (previous?.trainedAtDay !== undefined) return false;
    const milestones = person.careerMilestones ?? (person.careerMilestones = {});
    milestones[job] = { ...previous, trainedAtDay: day };
    return true;
  }
  const days = person.careerHistory?.[job]?.days ?? 0;
  const tier: CareerTier | undefined = days >= CAREER_TIER_DAYS.master ? 'master'
    : days >= CAREER_TIER_DAYS.experienced ? 'experienced'
    : days >= CAREER_TIER_DAYS.practiced ? 'practiced' : undefined;
  if (!tier || previous?.tier === tier) return false;
  const milestones = person.careerMilestones ?? (person.careerMilestones = {});
  milestones[job] = { ...previous, tier, tierAtDay: day };
  return true;
}

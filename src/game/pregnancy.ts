/**
 * The pregnancy-state owner: one term/due rule and one owner for starting, advancing and clearing pregnancies.
 * Kept as a leaf so both the entity factory (arriving pregnancies) and the lifecycle
 * (conception, delivery, hospital) can call it without a runtime import cycle.
 */
import { EntityType, type Entity } from './gameTypes';
import { PREGNANCY_TICKS } from './dayCycle';
import { seededRandomForRun } from './simRng';

/** One validity rule for a saved due date: a positive, finite tick count. */
export function isValidPregnancyDueProgress(due: number | undefined): due is number {
  return typeof due === 'number' && Number.isFinite(due) && due > 0;
}

/** Absent, zero and non-finite due dates read as one full term — never an instant birth. */
export function normalizePregnancyDueProgress(due: number | undefined): number {
  return isValidPregnancyDueProgress(due) ? due : PREGNANCY_TICKS;
}

/** The one term jitter: ±15 % around 24 days, keyed by settler and colony day. */
function rollPregnancyDueProgress(settlerId: number, startDay: number): number {
  return Math.round(PREGNANCY_TICKS * (0.85 + seededRandomForRun(`pregnancy-due:${settlerId}:${startDay}`) * 0.3));
}

/** Where a pregnancy came from; it controls the youth record, not civil status. */
type PregnancyOrigin = 'married' | 'youth' | 'affair' | 'existing';

export type PregnancyStartOptions = {
  pregnancyProgress?: number;
  /** Colony day that keys this pregnancy's term. */
  startDay: number;
} & (
  | { origin: 'existing'; fatherId: number }
  | { origin: Exclude<PregnancyOrigin, 'existing'>; father: Entity }
);

/**
 * The only pregnancy-start writer: conception paths and the entity factory both delegate here.
 * It owns the due roll, father recording and the youth-love record, not marital status.
 */
export function startPregnancy(entity: Entity, opts: PregnancyStartOptions): void {
  if (entity.type !== EntityType.Human || entity.gender !== 'female' || !entity.alive) {
    throw new Error('Pregnancy requires a living human mother');
  }
  if (entity.pregnant) throw new Error('Cannot restart an active pregnancy');
  const fatherId = opts.origin === 'existing' ? opts.fatherId : opts.father.id;
  if (!Number.isSafeInteger(fatherId) || fatherId < 0 || fatherId === entity.id) {
    throw new Error('Pregnancy requires a valid biological father ID');
  }
  if (opts.origin !== 'existing' && (!opts.father.alive || opts.father.type !== EntityType.Human || opts.father.gender !== 'male')) {
    throw new Error('Conception requires a living human father');
  }
  const progress = opts.pregnancyProgress ?? 0;
  if (!Number.isFinite(progress) || progress < 0) throw new Error('Invalid pregnancy progress');
  if (!Number.isSafeInteger(opts.startDay) || opts.startDay < 0) throw new Error('Invalid pregnancy start day');
  const due = rollPregnancyDueProgress(entity.id, opts.startDay);

  entity.pregnant = true;
  entity.pregnancyProgress = progress;
  entity.pregnancyDueProgress = due;
  entity.pregnantById = fatherId;
  entity.pregnancyFromYouthLove = opts.origin === 'youth' ? true : undefined;

  // Pregnancy is independent of marital status; neither parent changes marriage state here.
}

/** Legacy elapsed counters that are absent, negative or non-finite read as zero. */
function normalizePregnancyElapsedProgress(progress: number | undefined): number {
  return typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 ? progress : 0;
}

/** Advance one scheduled pregnancy tick; report whether delivery is due. */
export function advancePregnancy(mother: Entity): boolean {
  if (!mother.pregnant) return false;
  mother.pregnancyProgress = normalizePregnancyElapsedProgress(mother.pregnancyProgress) + 1;
  return mother.pregnancyProgress >= normalizePregnancyDueProgress(mother.pregnancyDueProgress);
}

/** Clear completed pregnancy state after the birth owner has captured its historical identity. */
export function clearPregnancy(mother: Entity): void {
  mother.pregnant = false;
  mother.pregnancyProgress = 0;
  mother.pregnancyDueProgress = undefined;
  mother.pregnantById = undefined;
  mother.pregnancyFromYouthLove = undefined;
}

/** Authoritative progress toward this mother's individual due date (±15% term variation). */
export function getPregnancyProgressFraction(
  mother: Pick<Entity, 'pregnancyProgress' | 'pregnancyDueProgress'>,
): number {
  const term = normalizePregnancyDueProgress(mother.pregnancyDueProgress);
  const progress = normalizePregnancyElapsedProgress(mother.pregnancyProgress);
  return Math.min(1, Math.max(0, progress / term));
}

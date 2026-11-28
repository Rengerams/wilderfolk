/**
 * The pregnancy-state owner: one term/due rule, one validity rule and one start writer.
 * Kept as a leaf so both the entity factory (arriving pregnancies) and the lifecycle
 * (conception, delivery, hospital) can call it without a runtime import cycle.
 */
import type { Entity } from './gameTypes';
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

export interface PregnancyStartOptions {
  origin: PregnancyOrigin;
  /** Biological father at conception, even when he is the current spouse. */
  fatherId: number;
  /** Optional partner context for legacy callers; pregnancy never changes their marital state. */
  partner?: Entity;
  pregnancyProgress?: number;
  /** Colony day that keys this pregnancy's term. */
  startDay: number;
}

/**
 * The only pregnancy-start writer: conception paths and the entity factory both delegate here.
 * It owns the due roll, father recording and the youth-love record, not marital status.
 */
export function startPregnancy(entity: Entity, opts: PregnancyStartOptions): void {
  if (!Number.isSafeInteger(opts.fatherId) || opts.fatherId < 0 || opts.fatherId === entity.id) {
    throw new Error('Pregnancy requires a valid biological father ID');
  }
  entity.pregnant = true;
  entity.pregnancyProgress = opts.pregnancyProgress ?? 0;
  entity.pregnancyDueProgress = rollPregnancyDueProgress(entity.id, opts.startDay);
  entity.pregnantById = opts.fatherId;
  entity.pregnancyFromYouthLove = opts.origin === 'youth' ? true : undefined;

  // Pregnancy is independent of marital status; neither parent changes marriage state here.
}

/** Authoritative progress toward this mother's individual due date (±15% term variation). */
export function getPregnancyProgressFraction(
  mother: Pick<Entity, 'pregnancyProgress' | 'pregnancyDueProgress'>,
): number {
  const term = normalizePregnancyDueProgress(mother.pregnancyDueProgress);
  const elapsed = mother.pregnancyProgress;
  const progress = typeof elapsed === 'number' && Number.isFinite(elapsed) ? elapsed : 0;
  return Math.min(1, Math.max(0, progress / term));
}

/**
 * The pregnancy-state owner: one term/due rule, one validity rule and one start writer.
 * Kept as a leaf so both the entity factory (arriving pregnancies) and the lifecycle
 * (conception, delivery, hospital) can call it without a runtime import cycle.
 */
import type { Entity } from './gameTypes';
import { PREGNANCY_TICKS } from './dayCycle';
import { seededRandomForRun } from './simRng';
import { isMarriedOrExpecting } from './relationships';

/** One validity rule for a saved due date: a positive, finite tick count. */
export function isValidPregnancyDueProgress(due: number | undefined): due is number {
  return typeof due === 'number' && Number.isFinite(due) && due > 0;
}

/** Absent, zero and non-finite due dates read as one full term — never an instant birth. */
export function normalizePregnancyDueProgress(due: number | undefined): number {
  return isValidPregnancyDueProgress(due) ? due : PREGNANCY_TICKS;
}

/** The one term jitter: ±15 % around 24 days, keyed by settler and colony day. */
export function rollPregnancyDueProgress(settlerId: number, startDay: number): number {
  return Math.round(PREGNANCY_TICKS * (0.85 + seededRandomForRun(`pregnancy-due:${settlerId}:${startDay}`) * 0.3));
}

/** Where a pregnancy came from; it only changes the visible pair status and the youth record. */
export type PregnancyOrigin = 'married' | 'youth' | 'affair' | 'existing';

export interface PregnancyStartOptions {
  origin: PregnancyOrigin;
  /** Biological father when known; recorded only when he is not the mother's current partner. */
  fatherId?: number;
  /** The partner a married conception marks as expecting; omitted by constructor spawns. */
  partner?: Entity;
  pregnancyProgress?: number;
  /** Colony day that keys this pregnancy's term. */
  startDay: number;
}

/**
 * The only pregnancy-start writer: conception paths and the entity factory both delegate here.
 * It owns the due roll, father recording, pair status and the youth-love record.
 */
export function startPregnancy(entity: Entity, opts: PregnancyStartOptions): void {
  entity.pregnant = true;
  entity.pregnancyProgress = opts.pregnancyProgress ?? 0;
  entity.pregnancyDueProgress = rollPregnancyDueProgress(entity.id, opts.startDay);
  entity.pregnantById = opts.fatherId != null && opts.fatherId !== entity.partnerId
    ? opts.fatherId
    : undefined;
  entity.pregnancyFromYouthLove = opts.origin === 'youth' ? true : undefined;

  if (opts.origin === 'married') {
    entity.relationshipStatus = 'expecting';
    if (opts.partner && (isMarriedOrExpecting(opts.partner) || opts.partner.partnerId === entity.id)) {
      opts.partner.relationshipStatus = 'expecting';
    }
  } else if (opts.origin !== 'youth') {
    // An affair stays hidden behind the marriage; a pre-existing pregnancy keeps its arrival status.
    entity.relationshipStatus = entity.partnerId != null ? 'married' : 'expecting';
  }
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

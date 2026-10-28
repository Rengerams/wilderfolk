import type { Entity, JobType } from '../gameTypes';
import { evaluateTraitInfluence } from '../personality/traitEvaluation';

/** Read-only advice: workforce still ranks commute and actual skill before this tie-break. */
export interface WorkerFit {
  readonly creditedDays: number;
  readonly traitFactor: number;
  readonly reasons?: readonly string[];
}
export function evaluateWorkerFit(
  person: Pick<Entity, 'traits' | 'skills' | 'careerHistory'>,
  job: JobType,
  includeReasons = false,
): WorkerFit {
  const influence = evaluateTraitInfluence(person, { kind: 'work', job, action: 'production' },
    includeReasons ? { includeReasons: true } : undefined);
  const creditedDays = person.careerHistory?.[job]?.days ?? 0;
  if (!includeReasons) return { creditedDays, traitFactor: influence.factor };
  return {
    creditedDays,
    traitFactor: influence.factor,
    reasons: influence.reasons,
  };
}

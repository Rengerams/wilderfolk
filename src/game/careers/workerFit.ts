import { JobType } from '../gameTypes';
import type { Entity } from '../gameTypes';
import { evaluateAptitudeInfluence, type AptitudeReason } from '../personality/traitEvaluation';

/** Read-only advice: workforce still ranks commute and actual skill before this tie-break. */
export interface WorkerFit {
  readonly skill: number;
  readonly creditedDays: number;
  readonly aptitudeFactor: number;
  readonly reasons?: readonly AptitudeReason[];
}

/** Production is routine work; a builder's trade is the construction activity. */
function activityForJob(job: JobType): 'routineWork' | 'construction' {
  return job === JobType.Builder ? 'construction' : 'routineWork';
}

export function evaluateWorkerFit(
  person: Pick<Entity, 'genomeV2' | 'skills' | 'careerHistory'>,
  job: JobType,
  includeReasons = false,
): WorkerFit {
  const influence = evaluateAptitudeInfluence(person, activityForJob(job),
    includeReasons ? { includeReasons: true } : undefined);
  const skill = person.skills?.[job] ?? 0;
  const creditedDays = person.careerHistory?.[job]?.days ?? 0;
  if (!includeReasons) return { skill, creditedDays, aptitudeFactor: influence.factor };
  return {
    skill,
    creditedDays,
    aptitudeFactor: influence.factor,
    reasons: influence.reasons,
  };
}

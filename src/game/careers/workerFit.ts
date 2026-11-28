import type { Entity, JobType } from '../gameTypes';
import { JOB_APTITUDE_ACTIVITIES } from '../personality/activityAptitudes';
import { evaluateAptitudeInfluence, type AptitudeReason } from '../personality/traitEvaluation';

/** One read-only vocational projection shared by workforce, skills, training and the inspector. */
export interface WorkerFit {
  readonly skill: number;
  readonly creditedDays: number;
  readonly aptitudeFactor: number;
  /** Skill-equivalent ranking, not a stored or earned skill. */
  readonly selectionScore: number;
  readonly reasons?: readonly AptitudeReason[];
}

export function evaluateWorkerFit(
  person: Pick<Entity, 'genomeV2' | 'skills' | 'careerHistory'>,
  job: JobType,
  includeReasons = false,
): WorkerFit {
  // Vocational aptitude derives solely from inherited DNA, not acquired marks.
  const influence = evaluateAptitudeInfluence({ genomeV2: person.genomeV2 }, JOB_APTITUDE_ACTIVITIES[job],
    includeReasons ? { includeReasons: true } : undefined);
  const skill = person.skills?.[job] ?? 0;
  const creditedDays = person.careerHistory?.[job]?.days ?? 0;
  const selectionScore = skill + (influence.factor - 1) * 100;
  if (!includeReasons) return { skill, creditedDays, aptitudeFactor: influence.factor, selectionScore };
  return {
    skill,
    creditedDays,
    aptitudeFactor: influence.factor,
    selectionScore,
    reasons: influence.reasons,
  };
}

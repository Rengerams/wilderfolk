import type { Entity, WorldState, Building } from './gameTypes';
import { BuildingType, BUILDING_JOB_TYPES, JOB_LABELS, JobType } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycleClock';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { evaluateWorkerFit } from './careers/workerFit';
import { PROFILE_REVISION, bumpRevision } from './entityRevision';
import { isPlayerHuman } from './playerHuman';

export function getOccupationForBuilding(type: BuildingType): string {
  const job = BUILDING_JOB_TYPES[type];
  return job ? JOB_LABELS[job] : 'Worker';
}

export function getJobForBuilding(type: BuildingType): JobType | undefined {
  return BUILDING_JOB_TYPES[type];
}

export function ensureEntitySkills(entity: { skills?: Partial<Record<JobType, number>> }): Partial<Record<JobType, number>> {
  if (!entity.skills || typeof entity.skills !== 'object') {
    entity.skills = {};
  }
  // Old saves may contain a score for unemployment; it is not a trade.
  delete entity.skills[JobType.Settler];
  return entity.skills;
}

/** Explicit mutable-map escape hatch (legacy/tests); prefer increaseEntitySkill. */
export function writableEntitySkills(entity: Entity): Partial<Record<JobType, number>> {
  bumpRevision(entity, PROFILE_REVISION);
  return ensureEntitySkills(entity);
}

export function readSkill(entity: { skills?: Partial<Record<JobType, number>> }, job: JobType): number {
  return job === JobType.Settler ? 0 : entity.skills?.[job] ?? 0;
}

/** Skill ceiling — a trade is scored 0..100. */
export const MAX_SKILL = 100;

/** Slow idle decay — skills fade when a job is not practiced (~0.5 pt / 30 days). */
export const SKILL_IDLE_DECAY_PER_DAY = 0.017;

/** Skill a settler earns for one full shift of work, at full attendance. */
export const WORK_SKILL_PER_SHIFT = 0.2;

/** How often the worked-shift credit is paid — the daily production cadence. */
export const SKILL_CREDIT_INTERVAL_TICKS = TICKS_PER_DAY;

/**
 * Every profession credited for the shift it works: each staffing post the game assigns a job to.
 * Derived from `BUILDING_JOB_TYPES`, so a new workplace teaches its trade without a second edit.
 */
export const WORK_SKILL_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>(
  Object.keys(BUILDING_JOB_TYPES) as BuildingType[],
);

/** Single skill writer: earned practice is priced once by the job's inherited aptitude.
 * Fixed completion awards are already final amounts, not practice. */
export function increaseEntitySkill(entity: Entity, job: JobType, amount: number, fixedAward = false): void {
  if (job === JobType.Settler || !isPlayerHuman(entity) || !entity.alive || entity.age < HUMAN_ADULT_MIN_AGE
    || !Number.isFinite(amount) || amount <= 0) return;
  const before = readSkill(entity, job);
  const credit = fixedAward ? amount : amount * evaluateWorkerFit(entity, job).aptitudeFactor;
  const after = Math.min(MAX_SKILL, before + credit);
  if (after === before) return;
  ensureEntitySkills(entity)[job] = after;
  bumpRevision(entity, PROFILE_REVISION);
}

export function gainSkill(
  state: WorldState,
  humanId: number,
  job: JobType,
  amount: number,
  entityById?: Map<number, Entity>,
): void {
  // A supplied index is authoritative: an id it lacks is a stale slot, not a cue to scan the world.
  const human = entityById ? entityById.get(humanId) : state.entities.find((e) => e.id === humanId);
  if (human) increaseEntitySkill(human, job, amount);
}

/** Apply a small decay to non-active job skills on calendar day rollover. */
export function decayIdleSkills(entity: Entity, activeJob?: JobType, amount = SKILL_IDLE_DECAY_PER_DAY): void {
  if (!isPlayerHuman(entity) || !entity.alive || entity.age < HUMAN_ADULT_MIN_AGE
    || !Number.isFinite(amount) || amount <= 0 || !entity.skills) return;
  let changed = Object.prototype.hasOwnProperty.call(entity.skills, JobType.Settler);
  if (changed) ensureEntitySkills(entity);
  for (const job of Object.values(JobType)) {
    if (job === JobType.Settler || job === activeJob) continue;
    const current = entity.skills[job] ?? 0;
    if (!Number.isFinite(current) || current <= 0) continue;
    const next = Math.max(0, current - amount);
    if (next === current) continue;
    entity.skills[job] = next;
    changed = true;
  }
  if (changed) bumpRevision(entity, PROFILE_REVISION);
}

/**
 * The one trade-XP loop behind both payers: credit only attested workers of `building` for its job.
 * Callers own attendance and base credit; increaseEntitySkill applies vocational aptitude once.
 */
function creditAttendedTradeSkill(
  state: WorldState,
  building: Building,
  amount: number,
  entityById?: Map<number, Entity>,
  workedIds?: ReadonlySet<number>,
): void {
  const job = getJobForBuilding(building.type);
  if (!job || amount <= 0) return;
  for (const id of building.occupants) {
    if (workedIds && !workedIds.has(id)) continue;
    gainSkill(state, id, job, amount, entityById);
  }
}

/** Pay a crew for the trade work it did. Callers own when and how much; a refused harvest never calls. */
export function rewardProductionSkills(
  state: WorldState,
  building: Building,
  amount = 0.2,
  entityById?: Map<number, Entity>,
  /** The workers who actually attended this shift; absent roster members earn nothing. */
  workedIds?: ReadonlySet<number>,
): void {
  creditAttendedTradeSkill(state, building, amount, entityById, workedIds);
}

/** Which of the work catalog's contexts this crew is working in. */
export type WorkAction = 'production' | 'construction';

/**
 * The crew's skill and the catalog's DNA factor for the work it is doing, as one multiplier: the
 * same job profile supplies training, selection and output; each factor is applied once.
 */
export function getWorkerSkillMultiplier(
  state: WorldState,
  building: Building,
  entityById?: Map<number, Entity>,
  action: WorkAction = 'production',
  /** The workers who actually attended this shift. Omitted means the whole roster (construction). */
  workedIds?: ReadonlySet<number>,
): number {
  const siteJob = getJobForBuilding(building.type);
  // A build crew is paid the site's own trade when it has one, else Builder: a house or wall has
  // no production job, yet the crew raising it still earns — and is priced by — Building.
  const skillJob = action === 'construction' ? siteJob ?? JobType.Builder : siteJob;
  if (!skillJob) return 1;
  let total = 0;
  let traitFactorSum = 0;
  let validWorkers = 0;
  const seen = new Set<number>();
  for (const id of building.occupants) {
    if (seen.has(id) || (workedIds && !workedIds.has(id))) continue;
    seen.add(id);
    // A supplied index is authoritative; stale, dead, underage and foreign occupants do not count.
    const h = entityById ? entityById.get(id) : state.entities.find((e) => e.id === id);
    if (!h || !isPlayerHuman(h) || !h.alive || h.age < HUMAN_ADULT_MIN_AGE
      || h.prisonBuildingId != null) continue;
    total += readSkill(h, skillJob);
    traitFactorSum += evaluateWorkerFit(h, skillJob).aptitudeFactor;
    validWorkers++;
  }
  if (validWorkers === 0) return 1;
  const avg = total / validWorkers;
  const traitMult = traitFactorSum / validWorkers;
  return (1 + avg * 0.02) * traitMult; // up to 3x at skill 100
}


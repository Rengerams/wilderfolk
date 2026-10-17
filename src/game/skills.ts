import type { Entity, WorldState, Building } from './gameTypes';
import { BuildingType, BUILDING_JOB_TYPES, EntityType, JOB_LABELS, JobType } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycleClock';

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
  return entity.skills;
}

export function readSkill(entity: { skills?: Partial<Record<JobType, number>> }, job: JobType): number {
  return ensureEntitySkills(entity)[job] ?? 0;
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
 *
 * Derived from `BUILDING_JOB_TYPES`, not a hand-kept list, so a workplace added there teaches its
 * trade without a second edit. A site with no job of its own (a construction crew) is paid separately.
 */
export const WORK_SKILL_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>(
  Object.keys(BUILDING_JOB_TYPES) as BuildingType[],
);

export function gainSkill(
  state: WorldState,
  humanId: number,
  job: JobType,
  amount: number,
  entityById?: Map<number, Entity>,
) {
  const human = entityById?.get(humanId) ?? state.entities.find((e) => e.id === humanId);
  if (!human || human.type !== EntityType.Human || human.isJuvenile || !human.alive) return;
  const skills = ensureEntitySkills(human);
  skills[job] = Math.min(MAX_SKILL, (skills[job] ?? 0) + amount);
}

/** Apply a small decay to non-active job skills on calendar day rollover. */
export function decayIdleSkills(entity: Entity, activeJob?: JobType, amount = SKILL_IDLE_DECAY_PER_DAY): void {
  if (entity.type !== EntityType.Human || !entity.alive || entity.isJuvenile) return;
  const skills = ensureEntitySkills(entity);
  for (const job of Object.values(JobType)) {
    if (job === activeJob) continue;
    const current = skills[job] ?? 0;
    if (current <= 0) continue;
    skills[job] = Math.max(0, current - amount);
  }
}

export function rewardProductionSkills(
  state: WorldState,
  building: Building,
  amount = 0.2,
  entityById?: Map<number, Entity>,
): void {
  const job = getJobForBuilding(building.type);
  if (!job) return;
  for (const id of building.occupants) gainSkill(state, id, job, amount, entityById);
}

/**
 * Credit a production crew for the shift it worked, on the building's production tick.
 *
 * Separate from `rewardProductionSkills` on purpose: that one is paid for *output* and so stops the
 * day stores fill, which strands every trade whose good has a full store (iron, gold, stone) at its
 * entry skill. This credit is paid for the shift, so a refused harvest still teaches the trade.
 */
export function rewardBuildingWork(
  state: WorldState,
  building: Building,
  presenceShare: number,
  amount: number,
  entityById?: Map<number, Entity>,
): void {
  const job = getJobForBuilding(building.type);
  if (!job || presenceShare <= 0) return;
  for (const id of building.occupants) gainSkill(state, id, job, amount * presenceShare, entityById);
}

export function getWorkerSkillMultiplier(
  state: WorldState,
  building: Building,
  entityById?: Map<number, Entity>,
): number {
  const job = getJobForBuilding(building.type);
  if (!job || building.occupants.length === 0) return 1;
  let total = 0;
  let resourceful = 0;
  for (const id of building.occupants) {
    const h = entityById?.get(id) ?? state.entities.find((e) => e.id === id);
    if (h) {
      total += readSkill(h, job);
      if (h.traits?.includes('resourceful')) resourceful++;
    }
  }
  const avg = total / building.occupants.length;
  // Resourceful builders get the site moving faster (+10% each, cap +30%).
  const resourcefulMult = 1 + Math.min(0.3, resourceful * 0.1);
  return (1 + avg * 0.02) * resourcefulMult; // up to 3x at skill 100
}


import type { WorldState, Building } from './gameTypes';
import { BuildingType, BUILDING_JOB_TYPES, EntityType, JOB_LABELS, JobType } from './gameTypes';

export function getOccupationForBuilding(type: BuildingType): string {
  const job = BUILDING_JOB_TYPES[type];
  return job ? JOB_LABELS[job] : 'Worker';
}

export function getJobForBuilding(type: BuildingType): JobType | undefined {
  return BUILDING_JOB_TYPES[type];
}

export function ensureEntitySkills(entity: { skills?: Partial<Record<JobType, number>> }): Record<JobType, number> {
  if (!entity.skills || typeof entity.skills !== 'object') {
    entity.skills = {};
  }
  return entity.skills as Record<JobType, number>;
}

export function readSkill(entity: { skills?: Partial<Record<JobType, number>> }, job: JobType): number {
  return ensureEntitySkills(entity)[job] ?? 0;
}

export function gainSkill(state: WorldState, humanId: number, job: JobType, amount: number) {
  const human = state.entities.find(e => e.id === humanId);
  if (!human || human.type !== EntityType.Human || human.isJuvenile || !human.alive) return;
  const skills = ensureEntitySkills(human);
  skills[job] = Math.min(100, (skills[job] ?? 0) + amount);
}

export function rewardProductionSkills(state: WorldState, building: Building, amount = 0.2): void {
  const job = getJobForBuilding(building.type);
  if (!job) return;
  for (const id of building.occupants) gainSkill(state, id, job, amount);
}

export function getWorkerSkillMultiplier(state: WorldState, building: Building): number {
  const job = getJobForBuilding(building.type);
  if (!job || building.occupants.length === 0) return 1;
  let total = 0;
  for (const id of building.occupants) {
    const h = state.entities.find(e => e.id === id);
    if (h) total += readSkill(h, job);
  }
  const avg = total / building.occupants.length;
  return 1 + avg * 0.02; // up to 3x at skill 100
}

/**
 * Sole read-only owner of construction-crew membership and assigned/idle adult counts.
 * Assignment transitions remain in workforce.ts; this module never writes simulation state.
 */
import type { Building, Entity } from './gameTypes';
import { BUILDING_JOB_TYPES } from './gameTypes';
import { getApprenticeTrainingSite } from './apprenticeshipEligibility';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { hasWorkAssignment, isImprisoned } from './housingModel';
import { isPlayerHuman } from './playerHuman';

/** One indexed snapshot of each settler's unfinished *player* construction site. */
export function buildConstructionCrewIndex(buildings: readonly Building[]): Map<number, Building> {
  const map = new Map<number, Building>();
  for (const building of buildings) {
    if (building.completed || building.occupants.length === 0) continue;
    for (const id of building.occupants) {
      if (!map.has(id)) map.set(id, building);
    }
  }
  return map;
}

export function findHumanWorkplace(
  entity: Entity,
  buildings: readonly Building[],
  opts?: {
    buildingById?: ReadonlyMap<number, Building>;
    constructionByWorkerId?: ReadonlyMap<number, Building>;
  },
): Building | undefined {
  const byId = opts?.buildingById;
  if (hasWorkAssignment(entity) && entity.workerBuildingId != null) {
    const jobSite = byId ? byId.get(entity.workerBuildingId) : buildings.find((b) => b.id === entity.workerBuildingId);
    if (jobSite?.completed && BUILDING_JOB_TYPES[jobSite.type]) {
      return jobSite;
    }
  }

  const construction = opts?.constructionByWorkerId?.get(entity.id);
  if (construction && !construction.completed) return construction;
  if (opts?.constructionByWorkerId) return undefined;

  return buildConstructionCrewIndex(buildings).get(entity.id);
}


export interface WorkplaceResolution {
  workplace: Building | undefined;
  trainingSite: Building | null;
}

interface WorkplaceIndexes {
  buildingById?: ReadonlyMap<number, Building>;
  constructionByWorkerId?: ReadonlyMap<number, Building>;
  entityById?: ReadonlyMap<number, Entity>;
}

/** Snapshot indexes shared by bulk read-only consumers; realtime already holds these indexes. */
export function buildWorkplaceIndexes(entities: readonly Entity[], buildings: readonly Building[]): Required<WorkplaceIndexes> {
  return {
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    buildingById: new Map(buildings.map((building) => [building.id, building])),
    constructionByWorkerId: buildConstructionCrewIndex(buildings),
  };
}

/** One effective workplace decision for regular staff, builders and apprentices. Never writes a roster. */
export function resolveHumanWorkplace(
  entity: Entity,
  buildings: readonly Building[],
  entities: readonly Entity[],
  indexes?: WorkplaceIndexes,
): WorkplaceResolution {
  const regular = findHumanWorkplace(entity, buildings, indexes);
  const trainingSite = regular || entity.apprenticeOfId == null ? null : getApprenticeTrainingSite(
    entity,
    indexes?.entityById ?? new Map(entities.map((person) => [person.id, person])),
    indexes?.buildingById ?? new Map(buildings.map((building) => [building.id, building])),
  );
  return { workplace: regular ?? trainingSite ?? undefined, trainingSite };
}

/** Assigned labour, not live on-shift attendance. Prisoners and minors are neither working nor idle. */
export function countWorkingAndIdleSettlers(
  humans: readonly Entity[],
  buildings: readonly Building[],
): { working: number; idle: number } {
  const indexes = buildWorkplaceIndexes(humans, buildings);
  let working = 0;
  let idle = 0;
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human) || human.age < HUMAN_ADULT_MIN_AGE || isImprisoned(human)) continue;
    if (resolveHumanWorkplace(human, buildings, humans, indexes).workplace) working++;
    else idle++;
  }
  return { working, idle };
}

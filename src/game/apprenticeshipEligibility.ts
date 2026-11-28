/** Read-only apprenticeship eligibility; pairing and skill transfer stay in apprenticeships.ts. */
import type { Building, Entity } from './gameTypes';
import { BuildingType, BUILDING_JOB_TYPES } from './gameTypes';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { readSkill } from './skills';
import { isPlayerHuman } from './playerHuman';

export const MASTER_SKILL = 40;

/** A trainee uses the mentor's real, staffed workplace, never a fabricated worker assignment. */
export function getApprenticeTrainingSite(
  apprentice: Entity,
  entityById: ReadonlyMap<number, Entity>,
  buildingById: ReadonlyMap<number, Building>,
): Building | null {
  if (!apprentice.alive || !isPlayerHuman(apprentice) || apprentice.age < HUMAN_ADULT_MIN_AGE || apprentice.prisonBuildingId != null
    || apprentice.raidDeploymentId || apprentice.apprenticeId != null || apprentice.apprenticeOfId == null) return null;
  const master = entityById.get(apprentice.apprenticeOfId);
  if (!master?.alive || !isPlayerHuman(master) || master.id === apprentice.id || master.age < HUMAN_ADULT_MIN_AGE
    || master.apprenticeOfId != null || master.apprenticeId !== apprentice.id || master.prisonBuildingId != null
    || master.raidDeploymentId || master.job == null || readSkill(master, master.job) < MASTER_SKILL) return null;
  const atSite = (building: Building | undefined): building is Building => !!building
    && building.completed && APPRENTICESHIP_BUILDING_TYPES.has(building.type)
    && BUILDING_JOB_TYPES[building.type] === master.job
    && (building.occupants ?? []).includes(master.id);
  const assigned = master.workerBuildingId == null ? undefined : buildingById.get(master.workerBuildingId);
  if (atSite(assigned)) return assigned;
  // Older saves can carry a valid building roster without a synchronized workerBuildingId.
  for (const building of buildingById.values()) if (atSite(building)) return building;
  return null;
}

export const APPRENTICESHIP_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>([
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Mine,
  BuildingType.Blacksmith,
  BuildingType.Workshop,
  BuildingType.Store,
  BuildingType.Market,
  BuildingType.HuntingSpot,
  BuildingType.FishingSpot,
]);


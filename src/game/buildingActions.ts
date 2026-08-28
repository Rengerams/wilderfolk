import type { Building, WorldState } from './gameTypes';
import { getWorkshopRecipe } from './gameTypes';
import { getWorkerSkillMultiplier } from './skills';
import { getMultiplier } from './simHelpers';
import {
  assignIdleWorkerToBuilding as assignStaffingWorkerToBuilding,
  removeWorkerFromBuilding as removeStaffingWorkerFromBuilding,
} from './buildingStaffingActions';
import {
  assignResidentToBuilding as assignResidentToResidence,
  removeResidentFromBuilding as removeResidentFromResidence,
} from './buildingResidencyActions';
import { ensureAdjacencyIndex, getAdjacencyMultiplierFromIndex } from './adjacencyIndex';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import { isResidenceBuilding, isResidenceBuildingType } from './residency';

export {
  UNBUILDABLE_TERRAIN,
  buildStripPreview,
  canPlaceBuilding,
  getPlaceBuildingFailureReason,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  placeStripChain,
  startBuilding,
} from './buildingPlacementActions';

export {
  assignBuilderToBuilding,
  autoStaffAllWorkers,
  canAssignWorkerToBuilding,
  fillBuildingWorkers,
  isOnConstructionCrew,
  listAssignableWorkersForBuilding,
  pickAdultSettler,
} from './buildingStaffingActions';

/**
 * Preserve the legacy generic command: housing continues through its dedicated
 * residency action, while construction and jobs delegate to staffing actions.
 */
export function assignIdleWorkerToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (building?.completed && isResidenceBuildingType(building.type)) {
    return assignResidentToResidence(originalState, buildingId);
  }
  return assignStaffingWorkerToBuilding(originalState, buildingId, preferredHumanId);
}

/** Preserve the legacy generic removal command while keeping residence removal separate. */
export function removeWorkerFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (building?.completed && isResidenceBuilding(building)) {
    return removeResidentFromResidence(originalState, buildingId, humanId);
  }
  return removeStaffingWorkerFromBuilding(originalState, buildingId, humanId);
}

export {
  assignResidentToBuilding,
  moveOutOfFamilyHome,
  removeResidentFromBuilding,
} from './buildingResidencyActions';

export {
  demolishBuilding,
  getBuildingUpgradeCost,
  repairBuilding,
  upgradeBuilding,
} from './buildingMaintenanceActions';

export {
  setBuildingStaffingMode,
  setHuntingSpotPrey,
  setMineMode,
  setWorkshopRecipe,
} from './buildingConfigurationActions';

export {
  getTameFoodCost,
  recruitSettler,
  spawnMoonHowlerDebug,
  tameEntity,
} from './settlerInteractionActions';


export function estimateWorkshopGold(state: WorldState, building: Building): number {
  const recipe = getWorkshopRecipe(building.workshopRecipeId);
  const workers = building.occupants.length;
  if (workers === 0) return recipe.baseGold;
  const levelMult = building.level || 1;
  const terrainMult = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMult = getAdjacencyMultiplierFromIndex(ensureAdjacencyIndex(state), building);
  const skillMult = getWorkerSkillMultiplier(state, building);
  const festivalMult = state.festival?.active ? 1.5 : 1;
  const goldMult = getMultiplier(state, 'gold_production');
  const globalEff = getMultiplier(state, 'global_efficiency');
  const outputMult = (1 + workers * 0.5) * levelMult * terrainMult * adjacencyMult * festivalMult * skillMult * goldMult * globalEff;
  return Math.max(1, Math.floor(recipe.baseGold * outputMult));
}

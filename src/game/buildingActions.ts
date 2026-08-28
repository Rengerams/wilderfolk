/**
 * Legacy public compatibility façade for building-related commands.
 *
 * New code should import the focused owner for its domain. The two generic
 * worker commands remain here only as documented compatibility routes.
 */
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

export {
  assignIdleWorkerToBuilding,
  removeWorkerFromBuilding,
} from './buildingActionRouting';

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

export { estimateWorkshopGold } from './workshopEconomy';

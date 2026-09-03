/**
 * Legacy public compatibility façade for building-related commands.
 *
 * New code should import the focused owner for its domain. The two generic
 * worker commands remain here only as documented compatibility routes.
 */

// ---------------------------------------------------------------------------
// Placement & Footprinting
// ---------------------------------------------------------------------------
export {
  buildStripPreview,
  canPlaceBuilding,
  getPlaceBuildingFailureReason,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  placeStripChain,
  startBuilding,
  UNBUILDABLE_TERRAIN,
} from './buildingPlacementActions';

// ---------------------------------------------------------------------------
// Staffing & Workforce
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Residency & Housing
// ---------------------------------------------------------------------------
export {
  assignResidentToBuilding,
  moveOutOfFamilyHome,
  removeResidentFromBuilding,
} from './buildingResidencyActions';

// ---------------------------------------------------------------------------
// Maintenance & Upgrades
// ---------------------------------------------------------------------------
export {
  demolishBuilding,
  getBuildingUpgradeCost,
  repairBuilding,
  upgradeBuilding,
} from './buildingMaintenanceActions';

// ---------------------------------------------------------------------------
// Configuration & Modes
// ---------------------------------------------------------------------------
export {
  setBuildingStaffingMode,
  setHuntingSpotPrey,
  setMineMode,
  setWorkshopRecipe,
} from './buildingConfigurationActions';

// ---------------------------------------------------------------------------
// Economy & Workshop Output
// ---------------------------------------------------------------------------
export {
  estimateWorkshopGold,
} from './workshopEconomy';

// ---------------------------------------------------------------------------
// Settler Interaction & Debug
// ---------------------------------------------------------------------------
export {
  getTameFoodCost,
  recruitSettler,
  spawnMoonHowlerDebug,
  tameEntity,
} from './settlerInteractionActions';
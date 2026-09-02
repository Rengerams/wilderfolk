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
  
  
  
  placeStripChain,
  startBuilding,
  
} from './buildingPlacementActions';

// ---------------------------------------------------------------------------
// Staffing & Workforce
// ---------------------------------------------------------------------------
export {
  
  autoStaffAllWorkers,
  canAssignWorkerToBuilding,
  fillBuildingWorkers,
  
  listAssignableWorkersForBuilding,
  
} from './buildingStaffingActions';

export {
  assignIdleWorkerToBuilding,
  removeWorkerFromBuilding,
} from './buildingActionRouting';

// ---------------------------------------------------------------------------
// Residency & Housing
// ---------------------------------------------------------------------------
export {
  
  moveOutOfFamilyHome,
  
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
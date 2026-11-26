// ---- Domain types / static data (gameTypes) ----
export type {
  WorldState,
  Entity,
  Building,
  Camera,
  GameState,
} from './gameTypes';

export {
  EntityType,
  BuildingType,
  BUILDING_CONFIGS,
  GRID_SIZE,
  snapToGrid,
  BUILDING_JOB_TYPES,
  WORKSHOP_RECIPES,
  getWorkshopRecipe,
  formatRecipeInputs,
} from './gameTypes';

// ---- Split-out sim core ----
export { SPECIES_CONFIG } from './speciesConfig';
export {
  type SimulationFocus,
  computeSimulationFocus,
  createSimFocus,
} from './simFocus';
export {
  hasTech,
} from './simHelpers';

export {
  getTerrainEfficiencyMultiplier,
  getAdjacencyMultiplier,
} from './terrainSystems';

export { gameTick } from './gameTick';

// ---- Feature modules (previous re-export surface) ----

export { isPlayerHuman } from './playerHuman';

export {
  getCombatPreview,
  formatRaidDeadline,
  formatRaidLootSummary,
  raidEventLoot,
  /** The raid card's own gate — the view asks the owner instead of restating it. */
  getRaidChoiceEligibility,
} from './frontierCombat';
export { getGrazingPressureReport } from './ecosystemPressure';
export { getEcosystemBreakdown } from './ecoBreakdown';

export {
  getArmamentSteps,
  getHumanArmamentLabel,
} from './combat';
export {
  isVillageLeader,
} from './villageLeadership';

export {
  saveGame,
  saveGameToSlot,
  saveImportedFileToSlot,
  loadImportedGameOutcome,
  hasImportedSave,
  describeFileSaveReason,
  loadGameOutcome,
  describeSaveLoadOutcome,
  hasSave,
  // `hasSaveSlot` answers "is there a save in the slot"; `hasSave` answers "can this build load it".
  hasSaveSlot,
  deleteSave,
  loadGameFromFileTextOutcome,
} from './saveLoad';
export { canPlaceBuilding } from './placementUtils';
export { startBuilding } from './buildingPlacementActions';

export { recruitSettler } from './settlerInteractionActions';

export { isStripBuildType, inferStripRotation } from './stripBuild';
export {
  initTradeRoutes,
  ensureFullTradeRoutes,
} from './economy';

export {
  initGame,
} from './worldGen';
export {
  getAgeInYears,
} from './dayCycle';

export {
  GAME_VERSION,
  GAME_PHASE,
  GAME_TITLE,
  GAME_SUBTITLE,
} from './version';

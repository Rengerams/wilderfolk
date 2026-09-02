/**
 * gameEngine — compatibility barrel (not a god module).
 *
 * Domain logic lives in focused modules:
 *   speciesConfig, simFocus, simHelpers, simEffects, terrainSystems,
 *   workforce, gameTick, + existing feature modules.
 *
 * Prefer importing from those modules directly in new code.
 * This file re-exports the previous public surface so existing imports keep working.
 */

// ---- Domain types / static data (gameTypes) ----
export type {
  WorldState, Entity,  Building, 
     
  GameState,
} from './gameTypes';
export {
  EntityType, BuildingType,    BUILDING_CONFIGS,
      
  BUILDING_JOB_TYPES, 
  WORKSHOP_RECIPES,  getWorkshopRecipe, formatRecipeInputs,
} from './gameTypes';

// ---- Split-out sim core ----
export { SPECIES_CONFIG } from './speciesConfig';
;
export {
  type SimulationFocus,
  
  
  
  
  
  
  computeSimulationFocus,
  
  
} from './simFocus';
;
;
;
;
export {
  getTerrainEfficiencyMultiplier,
  getAdjacencyMultiplier,
  
  
} from './terrainSystems';
;
;
;
export { gameTick } from './gameTick';

// ---- Feature modules (previous re-export surface) ----
;
;
;
;
export {
    
  
   getDiplomacyChoiceEligibility,  
   getVisitorLeaderTalkMeta, getVisitorTradePriceMult, getVisitorTradeRewardMult,
  hitTestCamp,
} from './groupEvents';
export { isRivalAtPeace } from './rivalPeace';
;
;
;
export {
    
    
   getRivalRaidStrength,  getCombatPreview,
   getOutgoingRaidFoodCostForRival, formatCampDistance, getCampDistancePixels,
    canLaunchRaidOnRival, 
  getOutgoingRaidActionLabel, formatRaidDeadline, formatRaidLootSummary, raidEventLoot,
} from './frontierCombat';
;
export { getGrazingPressureReport } from './ecosystemPressure';
;
export { getEcosystemBreakdown } from './ecoBreakdown';
;
;
;
;
;
export { formatRivalPopulationLabel, formatRivalRelationshipLabel } from './rivalDisplay';
export {
  getArmamentSteps, getHumanArmamentLabel,
  hasIronSpears, hasStoneSpears,
    
   
} from './combat';
export {
  
  
  isVillageLeader,
  
  
  
  
} from './villageLeadership';
;
;

;
;
;
;
;
;
;

;
export {
  saveGame,
  loadGame,
  hasSave,
  deleteSave,
  downloadSaveFile,
  loadGameFromFileText,
  
} from './saveLoad';
;
export { isStripBuildType, inferStripRotation } from './stripBuild';
export {
  
  
  
  
  initTradeRoutes,
  ensureFullTradeRoutes,
} from './economy';
;
;
export {
  
  
  
  
  
  initGame,
  
  
} from './worldGen';
export { getAgeInYears } from './dayCycle';
;
;
;
export {
  GAME_VERSION, GAME_PHASE, GAME_TITLE, GAME_SUBTITLE,  
} from './version';
;
;
;

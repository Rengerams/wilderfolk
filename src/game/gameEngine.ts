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
  WorldState, Entity, EntityByType, Building, DeathParticle,
  FloatingText, GameEvent, Camera, WorkshopRecipe,
  VictoryPath, VictoryProgress, GameState,
} from './gameTypes';
export {
  EntityType, BuildingType, Season, WeatherType, ResearchType, BUILDING_CONFIGS,
  GRID_SIZE, TERRAIN_TILE_SIZE, GRID_SNAP, snapToGrid, TerrainType,
  BUILDING_JOB_TYPES, JobType,
  WORKSHOP_RECIPES, DEFAULT_WORKSHOP_RECIPE_ID, getWorkshopRecipe, formatRecipeInputs,
} from './gameTypes';

// ---- Split-out sim core ----
export { SPECIES_CONFIG } from './speciesConfig';
export type { SpeciesConfig } from './speciesConfig';
export {
  type SimulationFocus,
  OFFSCREEN_HUMAN_THROTTLE,
  OFFSCREEN_WILDLIFE_THROTTLE,
  OFFSCREEN_GRASS_THROTTLE,
  WILDLIFE_LAYER_INTERVAL,
  buildEntityByType,
  buildEntityDrawBuckets,
  computeSimulationFocus,
  isInFocus,
  createSimFocus,
} from './simFocus';
export {
  getSeason,
  getReproductionMultiplier,
  hasTech,
  getMultiplier,
  addReputation,
} from './simHelpers';
export { getGrassGrowthMultiplier, getWinterEnergyPenalty } from './grassEcology';
export {
  impulseScreenShake,
  createDeathParticles,
  addFloatingText,
  addNotification,
  syncBigNewsIdFromState,
  addBigNews,
} from './simEffects';
export { pushTransientParticle } from './juiceEffects';
export {
  getTerrainEfficiencyMultiplier,
  getAdjacencyMultiplier,
  findHumanSpawnNear,
  isValidHumanSpawnPosition,
} from './terrainSystems';
export {
  AdjacencyIndex,
  buildAdjacencyIndex,
  buildingUsesAdjacency,
  ensureAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
  syncAdjacency,
  unindexAdjacency,
} from './adjacencyIndex';
export {
  ensureEntityByIdMap,
  indexEntity,
  indexLivingEntity,
  rebuildEntityByIdMap,
  unindexEntity,
  unindexEntityFromState,
} from './entityIndex';
export {
  isManualStaffBuilding,
  jobBuildingPriority,
  countWorkersAtBuilding,
  countStaffedWorkersAtType,
  getSmithBonus,
  getChurchStrength,
  hasStaffedSchool,
  completedJobBuildings,
  assignMissingWorkers,
  assignAllWorkers,
  findHumanWorkplace,
  releasePrisoners,
} from './workforce';
export { gameTick } from './gameTick';

// ---- Feature modules (previous re-export surface) ----
export { generateWorldMap } from './terrainGen';
export { recordYearlyStats, updateLifetimeStats, drawBarChart, drawLineChart } from './stats';
export type { YearlyStats, LifetimeStats } from './stats';
export { createInitialVictories, computeVictoryProgress, VICTORY_DEFINITIONS } from './victory';
export { logEvent } from './eventLog';
export {
  sendRivalGift, establishRivalTradePact, showStrengthToRival,
  signPeaceTreaty,
  respondToDiplomacyEvent, getDiplomacyChoiceEligibility, tradeWithVisitors, negotiateRefugees,
  talkToVisitorLeader, getVisitorLeaderTalkMeta,
  hitTestCamp,
} from './groupEvents';
export { isRivalAtPeace } from './rivalPeace';
export { isPlayerHuman, playerHumanCount } from './playerHuman';
export { createEntity, finalizeSettlerAge } from './entityFactory';
export type { VisitorLeaderTalkMeta } from './groupEvents';
export {
  respondToRaidEvent, respondToOutgoingRaidEvent, launchRaidOnRival,
  rollRivalOutgoingRaidResponse, rollRivalPayoffOffer, cancelPendingOutgoingRaidsForRival,
  getMilitiaStrength, getRivalRaidStrength, countArmedMilitia, getCombatPreview,
  getBarricadeStrength, getOutgoingRaidFoodCostForRival, formatCampDistance, getCampDistancePixels,
  getRivalDefenseStrength, resolveCounterRaidRatio, canLaunchRaidOnRival, isCounterRaidOnRival,
  getOutgoingRaidActionLabel, formatRaidDeadline, formatRaidLootSummary, raidEventLoot,
} from './frontierCombat';
export type { CombatPreview, RaidOutcomeTier, CounterRaidTier } from './frontierCombat';
export { getGrazingPressureReport } from './ecosystemPressure';
export type { GrazingPressureReport, GrazingPressureLevel } from './ecosystemPressure';
export { getEcosystemBreakdown } from './ecoBreakdown';
export type { EcosystemBreakdown, EcosystemBreakdownLine } from './ecoBreakdown';
export {
  computeValleyEcologySnapshot,
  tickValleyEcologyStage,
  getValleyHuntYieldMultiplier,
  getValleyFarmYieldMultiplier,
  valleyStageLabel,
  valleyStageEmoji,
} from './ecologyStage';
export type { ValleyStage, ValleyEcologySnapshot, EcologyDriverId } from './ecologyStage';
export { getPopulationGrowthReport } from './populationGrowth';
export type { PopulationGrowthReport, PopulationGrowthTone } from './populationGrowth';
export { formatRivalPopulationLabel, formatRivalRelationshipLabel } from './rivalDisplay';
export {
  getArmamentSteps, getHumanArmamentLabel,
  hasIronSpears, hasStoneSpears,
  hasIronSwords, hasScaleMail, hasTowerBallistae,
  hasIronShields, hasWoodenShields,
} from './combat';
export {
  ELECTION_INTERVAL_YEARS,
  getVillageLeader,
  isVillageLeader,
  getYearsUntilElection,
  rankLeadershipCandidates,
  formatSettlerName,
  getLeadershipScoreBreakdown,
} from './villageLeadership';
export {
  computePopulationCounts,
  computeWildlifeCounts,
  wildlifeCountsFromPopulation,
  formatPopulationBrief,
} from './entityCounts';
export type { PopulationCounts } from './entityCounts';
export {
  saveGame,
  loadGame,
  hasSave,
  deleteSave,
  downloadSaveFile,
  loadGameFromFileText,
  parseSaveJson,
} from './saveLoad';
export {
  UNBUILDABLE_TERRAIN,
  isFootprintOnBuildableTerrain,
  canPlaceBuilding,
  getPlaceBuildingFailureReason,
  startBuilding,
  isOnConstructionCrew,
  pickAdultSettler,
  assignBuilderToBuilding,
  assignResidentToBuilding,
  moveOutOfFamilyHome,
  removeResidentFromBuilding,
  assignIdleWorkerToBuilding,
  removeWorkerFromBuilding,
  listAssignableWorkersForBuilding,
  canAssignWorkerToBuilding,
  repairBuilding,
  getBuildingUpgradeCost,
  upgradeBuilding,
  recruitSettler,
  estimateWorkshopGold,
  setWorkshopRecipe,
  demolishBuilding,
  spawnMoonHowlerDebug,
  getTameFoodCost,
  tameEntity,
  buildStripPreview,
  placeStripChain,
} from './buildingActions';
export { isStripBuildType, inferStripRotation } from './stripBuild';
export {
  addResource,
  applyFoodSpoilage,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
  initTradeRoutes,
  ensureFullTradeRoutes,
} from './economy';
export {
  syncResearchUnlocks,
  notifyBuildingLocked,
  startResearch,
  updateResearch,
} from './research';
export {
  createBuilding,
  spawnGrassPatch,
  spawnWildlifeRing,
  replenishDepletedWildlife,
  createImmigrantSettler,
  initGame,
  setEntityBirthDate,
  type InitGameOptions,
} from './worldGen';
export { getAgeInYears } from './dayCycle';
export { tickHumans, tickWildlife, tickGrassDaily } from './lifeSimulation';
export { updateWeather, updateDisasters } from './worldEvents';
export {
  GAME_VERSION, GAME_PHASE, GAME_TITLE, GAME_SUBTITLE, GAME_VERSION_TAGLINE, ECOLOGICAL_FACTS,
} from './version';
export {
  getOccupationForBuilding, getJobForBuilding, ensureEntitySkills, readSkill,
  gainSkill, rewardProductionSkills, decayIdleSkills, getWorkerSkillMultiplier,
} from './skills';
export {
  FORGE_ORDERS, getForgeOrder, formatForgeInputs, getForgeBlockReason,
  queueForgeOrder, createInitialForgeState,
} from './forge';
export type { ForgeOrder, ForgeOrderId, VillageForgeState } from './gameTypes';

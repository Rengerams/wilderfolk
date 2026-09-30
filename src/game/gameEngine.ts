// ---- Domain types / static data (gameTypes) ----
export type {
  WorldState,
  Entity,
  EntityByType,
  Building,
  DeathParticle,
  FloatingText,
  GameEvent,
  Camera,
  WorkshopRecipe,
  GameState,
  ForgeOrder,
  ForgeOrderId,
  VillageForgeState,
} from './gameTypes';

export {
  EntityType,
  BuildingType,
  Season,
  WeatherType,
  ResearchType,
  BUILDING_CONFIGS,
  GRID_SIZE,
  TERRAIN_TILE_SIZE,
  GRID_SNAP,
  snapToGrid,
  TerrainType,
  BUILDING_JOB_TYPES,
  JobType,
  WORKSHOP_RECIPES,
  DEFAULT_WORKSHOP_RECIPE_ID,
  getWorkshopRecipe,
  formatRecipeInputs,
} from './gameTypes';

// ---- Split-out sim core ----
export { SPECIES_CONFIG, type SpeciesConfig } from './speciesConfig';
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
  findHumanWorkplace,
  releasePrisoners,
} from './workforce';
export { gameTick } from './gameTick';

// ---- Feature modules (previous re-export surface) ----
export { generateWorldMap } from './terrainGen';
export { recordYearlyStats, updateLifetimeStats, drawBarChart, drawLineChart } from './stats';
export type { YearlyStats, LifetimeStats } from './stats';
export { logEvent } from './eventLog';
export {
  sendRivalGift,
  establishRivalTradePact,
  showStrengthToRival,
  signPeaceTreaty,
  respondToDiplomacyEvent,
  getDiplomacyChoiceEligibility,
  tradeWithVisitors,
  negotiateRefugees,
  talkToVisitorLeader,
  getVisitorLeaderTalkMeta,
  getVisitorTradePriceMult,
  getVisitorTradeRewardMult,
  hitTestCamp,
  type VisitorLeaderTalkMeta,
} from './groupEvents';
export { isRivalAtPeace } from './rivalPeace';
export { isPlayerHuman, playerHumanCount } from './playerHuman';
export { createEntity, finalizeSettlerAge } from './entityFactory';
export {
  respondToRaidEvent,
  respondToOutgoingRaidEvent,
  launchRaidOnRival,
  rollRivalOutgoingRaidResponse,
  rollRivalPayoffOffer,
  cancelPendingOutgoingRaidsForRival,
  getMilitiaStrength,
  getRivalRaidStrength,
  countArmedMilitia,
  getCombatPreview,
  getBarricadeStrength,
  getOutgoingRaidFoodCostForRival,
  formatCampDistance,
  getCampDistancePixels,
  getRivalDefenseStrength,
  resolveCounterRaidRatio,
  canLaunchRaidOnRival,
  isCounterRaidOnRival,
  getOutgoingRaidActionLabel,
  formatRaidDeadline,
  formatRaidLootSummary,
  raidEventLoot,
  /** The raid card's own gate — the view asks the owner instead of restating it (roadmap U2/O2). */
  getRaidChoiceEligibility,
  type CombatPreview,
  type RaidOutcomeTier,
  type CounterRaidTier,
} from './frontierCombat';
export { getGrazingPressureReport, type GrazingPressureReport, type GrazingPressureLevel } from './ecosystemPressure';
export { getEcosystemBreakdown, type EcosystemBreakdown, type EcosystemBreakdownLine } from './ecoBreakdown';
export {
  computeValleyEcologySnapshot,
  tickValleyEcologyStage,
  getValleyHuntYieldMultiplier,
  getValleyFarmYieldMultiplier,
  valleyStageLabel,
  valleyStageEmoji,
  type ValleyStage,
  type ValleyEcologySnapshot,
  type EcologyDriverId,
} from './ecologyStage';
export {
  getPopulationGrowthReport,
  snapshotPopulation,
  invalidatePopulationSnapshotCache,
  getTotalBeds,
  getLivePlayerPopulation,
  getOpenBeds,
  getOpenBedsFromPop,
  type PopulationGrowthReport,
  type PopulationGrowthTone,
  type PopulationSnapshot,
} from './populationGrowth';
export { formatRivalPopulationLabel, formatRivalRelationshipLabel } from './rivalDisplay';
export {
  getArmamentSteps,
  getHumanArmamentLabel,
  hasIronSpears,
  hasStoneSpears,
  hasIronSwords,
  hasScaleMail,
  hasTowerBallistae,
  hasIronShields,
  hasWoodenShields,
} from './combat';
export {
  ELECTION_INTERVAL_YEARS,
  getVillageLeader,
  isVillageLeader,
  getYearsUntilElection,
  rankLeadershipCandidates,
  formatSettlerName,
  getLeadershipScoreBreakdown,
  appointFoundingLeader,
} from './villageLeadership';
export {
  computePopulationCounts,
  computeWildlifeCounts,
  wildlifeCountsFromPopulation,
  formatPopulationBrief,
  type PopulationCounts,
} from './entityCounts';
export type { ViewState } from './viewState';

export {
  EntityCatalog,
  resolveAliveByType,
  resolveAliveHumans,
} from './entityCatalog';
export { computeVillageStats, type VillageStatsSummary } from './uiSimSummary';
export { getPriorityAlerts, type PriorityAlert } from './priorityAlerts';
export { getFocusHints, type FocusHintAction } from './focusHints';

export {
  saveGame,
  loadGameOutcome,
  describeSaveLoadOutcome,
  loadGameFromParsed,
  hasSave,
  // Re-exported beside `hasSave` because the shell must be able to tell the two questions apart —
  // "is there a save in the slot" (`hasSaveSlot`) versus "can this build load it" (`hasSave`). The
  // player-visible Load affordance depends on the first and the refusal message on the second
 //. Same owner (`saveLoad`), so this is a façade export, not a second
  // definition.
  hasSaveSlot,
  deleteSave,
  downloadSaveFile,
  loadGameFromFileText,
  parseSaveJson,
  readSavePayload,
  describeSaveReadFailure,
} from './saveLoad';
export {
  isFootprintOnBuildableTerrain,
  canPlaceBuilding,
  getPlaceBuildingFailureReason,
  startBuilding,
  isOnConstructionCrew,
  pickAdultSettler,
  assignBuilderToBuilding,
  assignResidentToBuilding,
  removeResidentFromBuilding,
  assignIdleWorkerToBuilding,
  fillBuildingWorkers,
  autoStaffAllWorkers,
  removeWorkerFromBuilding,
  listAssignableWorkersForBuilding,
  canAssignWorkerToBuilding,
  repairBuilding,
  getBuildingUpgradeCost,
  upgradeBuilding,
  recruitSettler,
  estimateWorkshopGold,
  setWorkshopRecipe,
  setHuntingSpotPrey,
  setMineMode,
  setBuildingStaffingMode,
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
export { establishTradeRoute, hasCompletedMarket } from './tradeCaravans';
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
  isPassableWildlifePosition,
  type InitGameOptions,
} from './worldGen';
export {
  getAgeInYears,
  getColonyDay,
  getAbsoluteCalendarDay,
  getResidenceCapacity,
  isResidenceBuilding,
  isNearResidence,
  shareResidence,
  isNightHour,
  TICKS_PER_HOUR,
  TICKS_PER_DAY,
  DAYS_PER_YEAR,
  HUMAN_ADULT_MIN_AGE,
} from './dayCycle';

export {
  getWorkSchedule,
  setWorkSchedule,
  isWorkScheduleHour,
  type WorkSchedule,
} from './workSchedule';
export {
  getVenueSchedule,
  setVenueSchedule,
  type VenueScheduleKind,
} from './venueSchedule';

// ---- Relationships, Courtship & Marriage ----
export {
  MARRIAGE_ANNUAL_AMICABLE_DIVORCE_RATE,
  MARRIAGE_DAILY_AMICABLE_DIVORCE_CHANCE,
  tryDailyAmicableDivorce,
  exposeAffair,
  isEligibleToCourt,
  findCourtshipPartner,
  tryCompleteCourtshipMarriage,
  hasAffairPartner,
  isSpouseNearby,
} from './simulation/humanRelationships';

export { tickWildlife } from './tickLayerSystems';
export { updateWeather, updateDisasters } from './worldEvents';
export {
  GAME_VERSION,
  GAME_PHASE,
  GAME_TITLE,
  GAME_SUBTITLE,
  GAME_VERSION_TAGLINE,
  ECOLOGICAL_FACTS,
} from './version';
export {
  getOccupationForBuilding,
  getJobForBuilding,
  ensureEntitySkills,
  readSkill,
  gainSkill,
  rewardProductionSkills,
  decayIdleSkills,
  getWorkerSkillMultiplier,
} from './skills';
export {
  FORGE_ORDERS,
  getForgeOrder,
  formatForgeInputs,
  getForgeBlockReason,
  queueForgeOrder,
  createInitialForgeState,
} from './forge';

// ---- Name Loading & Fixing ----
export {
  loadNames,
  ensureNamesLoaded,
  fixDefaultNames,
  getRandomName,
  getRandomMaleName,
  getRandomFemaleName,
  getRandomSurname,
  areNamesLoaded,
  getNamePoolInfo,
  syncMarriageSurnames,
  grantDivorce,
  dissolveMarriage,
  formatCaughtCheaterDivorceDetail,
  resolveChildSurname,
} from './nameLoader';

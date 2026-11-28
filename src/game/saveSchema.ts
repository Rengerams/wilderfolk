import type { Entity, WorldState } from './gameTypes';

/**
 * Version of the serialized save *layout*, independent of the game's release version.
 * Increment this only when a breaking layout change cannot be migrated by the load owner.
 * All new saves carry `_saveFormatVersion`; `_version` remains the originating GAME_VERSION
 * for diagnostics and display only.
 */
export const SAVE_FORMAT_VERSION = 1;

/**
 * Shipped saves from before `_saveFormatVersion` existed. These have been audited against
 * the current loader/migrations. This list must NOT depend on the running GAME_VERSION:
 * otherwise bumping the application version silently changes the set of loadable saves.
 */
export const LEGACY_SAVE_GAME_VERSIONS: readonly string[] = [
  '0.6.5.0',
  '0.6.5.1',
  '0.6.5.2',
];

/**
 * Allow-list of WorldState keys — prevents view/UI fields from leaking into simulation state.
 * Absence is a durability decision: a field missing here will not survive a reload.
 */
export const WORLD_STATE_SAVE_KEYS = [
  'entities', 'genealogyRegistry', 'buildings', 'tick', 'season', 'year', 'dayInYear', 'populationHistory',
  'width', 'height', 'nextEntityId', 'nextBuildingId', 'nextFloatingTextId',
  'paused', 'speed', 'activeEvent', 'lastEventYear', 'bountifulHarvest',
  'humanPopulation', 'maxHumanPopulation', 'wildlifeCounts', 'villageName', 'workSchedule', 'tavernSchedule', 'hotelSchedule', 'villageReputation',
  'resources', 'storageMax', 'foodSpoilageRate', 'ecosystemHealth', 'biodiversityIndex',
  'pollutionLevel', 'valleyStage', 'valleyStageSinceDay', 'valleyRawStressStreakDays',
  // Queued story adjustments to the two derived ecology fields; written and cleared within one
  // daily tick, so they matter only if the save lands mid-tick.
  'settledEcology', 'ecologySettlementPending',
  'pendingEcosystemHealthDelta', 'pendingPollutionDelta',
  'valleyRawCalmStreakDays', 'valleyLastStageNotifyDay',
  'challenges', 'autoSave', 'weather', 'weatherTimer', 'researchNodes',
  'unlockedTechs', 'activeResearch', 'researchProgress',
  'tradeRoutes', 'totalBuildingsCompleted', 'productionDeferred', 'productionValleyStage', 'lastProcessedCalendarDay', 'yearlyStats',
  'lifetimeStats', 'eventLog', 'chronicleChapters', 'festival', 'townHallFestivalCooldownUntilTick',
  'rivalSettlements', 'pendingDiplomacyEvents', 'pendingRaidEvents', 'pendingOutgoingRaidEvents', 'pendingRaidVictories', 'raidBattleReports', 'raidRecovery', 'scoredRaidIds', 'graveRecords',
  'renffrOmen', 'renffrChatterUntilTick',
  'activeMigration', 'migrationNextHerdSize',
  'ecoHealthYearsAbove80', 'villageLeaderId', 'pendingLeaderHouseResidentIds', 'leaderSinceYear',
  'lastElectionYear', 'pendingElectionYear', 'electionBuildupNotifiedYear', 'electionCeremony', 'spotlightLore', 'spotlightLoreLastDay', 'nextElectionId', 'lastElectionResult', 'electionPromiseRecords',
  'villageForge', 'tutorialSeen', 'dismissedBigNewsIds', 'dismissedActiveEventIds',
  // Live Big News cards: the dismissal ledger beside them already persists, so a load kept the
  // ledger of a card it had thrown away, and `syncBigNewsIdFromState` read a list that was always [].
  'bigNews',
  'dismissedNotificationIds', 'lastWildlifeReplenishLogDay', 'eventsThisYear',
  'appliedSaveMigrations',
  'storyFlags', 'pendingStoryEvents', 'inventionFair', 'guidedCampaign',
  // The current year's death tally (the yearly record's `deaths`).
  'deathsThisYear',
  // Moon Howler lifecycle state written every full moon: the church-rite cooldown and the
  // priest-fear window.
  'lastMoonHowlerExorcismTick', 'moonHowlerPriestsFleeUntil',
  // Village happiness is derived daily by `beautyGrid` but rendered by the Population panel.
  'villageHappiness',
  // Whether today's heating was paid for, cached once per day by `tickWinterHeating`; the rest of
  // the day's simulation reads it for the unheated-winter penalty and freeze flash.
  'villageCanHeat',
  // Workforce policy preset: the auto-staffing priority order the player picked.
  'workforcePolicy', 'workforceFocus',
  // Food accounting: `economyLedger` is today's row, `foodHistory` the rolling archive. Nothing
  // rebuilds them, so both must round-trip; both are plain JSON.
  'economyLedger', 'foodHistory',
] as const satisfies readonly (keyof WorldState)[];

/**
 * Entity fields nested under `entities` that must survive save/load and worker catalog sync.
 * (Not top-level WORLD_STATE_SAVE_KEYS — those are world-level only.)
 */
export const ENTITY_PERSISTED_FIELDS = [
  'genomeV2',
  'marks',
  'skills', 'needs', 'careerHistory', 'careerMilestones', 'dialogueRecentScenes', 'dialogueRecentLines',
  'childPlaymateDay', 'childPlaymateId', 'childPlayGroupIds', 'childPlaySite', 'childPlaySiteAttempt',
  'childLeisureActivity', 'childLeisureTargetId', 'socialErrands', 'civicPetitionResolvedDay',
  'formerSpouseId', 'affairCandidateId', 'affairCandidates', 'factionWander',
  'scheduleWorkedTicksToday', 'schedulePresentTicksToday', 'schedulePresentSiteIdToday', 'scheduleLastWorkedHours',
  'scheduleWorkedSiteIdToday', 'scheduleLastWorkedSiteId',
  'scheduleWorkedJobToday', 'scheduleLastWorkedJob',
  'battleLeadershipMerit',
  'raidDeploymentId', 'departedAlive', 'battleLeadershipAwards',
  'promiseLeadershipMerit',
  'moonHowlerSaved',
  'moonHowlerCursed',
  'pregnantById',
  'pregnancyFromYouthLove',
  'pregnancyProgress',
  'pregnancyDueProgress',
  'tamedBy',
  'migrationTag',
  'forageKind',
  'blueberryYield',
  'blueberryNextRegrowthDay',
] as const satisfies readonly (keyof Entity)[];

export function pickWorldFieldsForSave(world: WorldState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WORLD_STATE_SAVE_KEYS) {
    if (key in world) out[key] = world[key as keyof WorldState];
  }
  return out;
}
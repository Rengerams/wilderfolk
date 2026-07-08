import type { Entity, WorldState } from './gameTypes';

/** Allow-list of WorldState keys — prevents view/UI fields from leaking into simulation state. */
export const WORLD_STATE_SAVE_KEYS = [
  'entities', 'buildings', 'tick', 'season', 'year', 'dayInYear', 'populationHistory',
  'width', 'height', 'nextEntityId', 'nextBuildingId', 'nextFloatingTextId',
  'paused', 'speed', 'activeEvent', 'lastEventYear', 'bountifulHarvest',
  'humanPopulation', 'maxHumanPopulation', 'wildlifeCounts', 'villageName', 'villageReputation',
  'resources', 'storageMax', 'foodSpoilageRate', 'ecosystemHealth', 'biodiversityIndex',
  'pollutionLevel', 'challenges', 'autoSave', 'weather', 'weatherTimer', 'researchNodes',
  'unlockedTechs', 'activeResearch', 'researchProgress', 'soundEnabled', 'musicEnabled',
  'tradeRoutes', 'totalBuildingsCompleted', 'lastProcessedCalendarDay', 'yearlyStats',
  'lifetimeStats', 'eventLog', 'festival', 'townHallFestivalCooldownUntilTick',
  'visitorGroups', 'rivalSettlements', 'pendingDiplomacyEvents', 'pendingRaidEvents', 'pendingOutgoingRaidEvents',
  'renffrOmen', 'renffrChatterUntilTick', 'victories', 'victoryAchieved',
  'ecoHealthYearsAbove80', 'firstWeekVisitorSpawned', 'villageLeaderId', 'leaderSinceYear',
  'lastElectionYear', 'pendingElectionYear', 'electionBuildupNotifiedYear', 'electionCeremony',
  'villageForge', 'tutorialSeen', 'lastWildlifeReplenishLogDay', 'eventsThisYear',
  'appliedSaveMigrations',
] as const satisfies readonly (keyof WorldState)[];

/**
 * Entity fields nested under `entities` that must survive save/load and worker catalog sync.
 * (Not top-level WORLD_STATE_SAVE_KEYS — those are world-level only.)
 */
export const ENTITY_PERSISTED_FIELDS = [
  'skills',
  'moonHowlerSaved',
  'moonHowlerCursed',
  'pregnantById',
  'pregnancyProgress',
  'tamedBy',
] as const satisfies readonly (keyof Entity)[];

export function pickWorldFieldsForSave(world: WorldState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WORLD_STATE_SAVE_KEYS) {
    if (key in world) out[key] = world[key as keyof WorldState];
  }
  return out;
}
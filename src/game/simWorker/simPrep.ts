import type { WorldState } from '../gameTypes';
import { normalizeForgeState } from '../forge';
import { getWorkSchedule } from '../workSchedule';
import { getVenueSchedule } from '../venueSchedule';

/**
 * Mutable sim slices backed up before each tick/command for instant failure recovery.
 */
type SimPrepKeys =
  | 'tick'
  | 'year'
  | 'dayInYear'
  | 'season'
  | 'weather'
  | 'weatherTimer'
  | 'paused'
  | 'speed'
  | 'entities'
  | 'buildings'
  | 'resources'
  | 'storageMax'
  | 'humanPopulation'
  | 'maxHumanPopulation'
  | 'wildlifeCounts'
  | 'ecosystemHealth'
  | 'pollutionLevel'
  | 'biodiversityIndex'
  | 'valleyStage'
  | 'valleyStageSinceDay'
  | 'valleyRawStressStreakDays'
  | 'valleyRawCalmStreakDays'
  | 'valleyLastStageNotifyDay'
  | 'researchNodes'
  | 'activeResearch'
  | 'researchProgress'
  | 'unlockedTechs'
  | 'visitorGroups'
  | 'activeVillageRequest'
  | 'villageRequestCooldownUntilDay'
  | 'villageRequestHistory'
  | 'rivalSettlements'
  | 'pendingRaidEvents'
  | 'pendingOutgoingRaidEvents'
  | 'pendingDiplomacyEvents'
  | 'tradeRoutes'
  | 'disasters'
  | 'villageForge'
  | 'challenges'
  | 'festival'
  | 'townHallFestivalCooldownUntilTick'
  | 'villageLeaderId'
  | 'leaderSinceYear'
  | 'lastElectionYear'
  | 'pendingElectionYear'
  | 'electionBuildupNotifiedYear'
  | 'electionCeremony'
  | 'eventLog'
  | 'eventsThisYear'
  | 'lastEventYear'
  | 'bountifulHarvest'
  | 'firstWeekVisitorSpawned'
  | 'nextEntityId'
  | 'nextBuildingId'
  | 'nextFloatingTextId'
  | 'totalBuildingsCompleted'
  | 'ecoHealthYearsAbove80'
  | 'villageReputation'
  | 'renffrOmen'
  | 'renffrChatterUntilTick'
  | 'lastProcessedCalendarDay'
  | 'lastWildlifeReplenishLogDay'
  | 'storyFlags'
  | 'pendingStoryEvents'
  | 'guidedCampaign'
  | 'workSchedule'
  | 'tavernSchedule'
  | 'hotelSchedule';

export type SimPrepPayload = Pick<WorldState, SimPrepKeys>;

export function extractSimPrep(state: WorldState): SimPrepPayload {
  return {
    tick: state.tick,
    year: state.year,
    dayInYear: state.dayInYear,
    season: state.season,
    weather: state.weather,
    weatherTimer: state.weatherTimer,
    paused: state.paused,
    speed: state.speed,
    entities: [...state.entities],
    buildings: [...state.buildings],
    resources: { ...state.resources },
    storageMax: { ...state.storageMax },
    humanPopulation: state.humanPopulation,
    maxHumanPopulation: state.maxHumanPopulation,
    wildlifeCounts: { ...state.wildlifeCounts },
    ecosystemHealth: state.ecosystemHealth,
    pollutionLevel: state.pollutionLevel,
    biodiversityIndex: state.biodiversityIndex,
    valleyStage: state.valleyStage,
    valleyStageSinceDay: state.valleyStageSinceDay,
    valleyRawStressStreakDays: state.valleyRawStressStreakDays,
    valleyRawCalmStreakDays: state.valleyRawCalmStreakDays,
    valleyLastStageNotifyDay: state.valleyLastStageNotifyDay,
    researchNodes: [...state.researchNodes],
    activeResearch: state.activeResearch,
    researchProgress: state.researchProgress,
    unlockedTechs: [...state.unlockedTechs],
    visitorGroups: [...state.visitorGroups],
    activeVillageRequest: state.activeVillageRequest ? structuredClone(state.activeVillageRequest) : undefined,
    villageRequestCooldownUntilDay: state.villageRequestCooldownUntilDay ?? 0,
    villageRequestHistory: structuredClone(state.villageRequestHistory ?? []),
    rivalSettlements: [...state.rivalSettlements],
    pendingRaidEvents: [...(state.pendingRaidEvents ?? [])],
    pendingOutgoingRaidEvents: [...(state.pendingOutgoingRaidEvents ?? [])],
    pendingDiplomacyEvents: [...(state.pendingDiplomacyEvents ?? [])],
    tradeRoutes: [...(state.tradeRoutes ?? [])],
    disasters: [...(state.disasters ?? [])],
    villageForge: normalizeForgeState(state.villageForge),
    challenges: [...(state.challenges ?? [])],
    festival: state.festival ? { ...state.festival } : null,
    townHallFestivalCooldownUntilTick: state.townHallFestivalCooldownUntilTick ?? 0,
    villageLeaderId: state.villageLeaderId,
    leaderSinceYear: state.leaderSinceYear,
    lastElectionYear: state.lastElectionYear,
    pendingElectionYear: state.pendingElectionYear,
    electionBuildupNotifiedYear: state.electionBuildupNotifiedYear ?? null,
    electionCeremony: state.electionCeremony ? { ...state.electionCeremony } : null,
    eventLog: [...state.eventLog],
    eventsThisYear: [...(state.eventsThisYear ?? [])],
    lastEventYear: state.lastEventYear,
    bountifulHarvest: state.bountifulHarvest,
    firstWeekVisitorSpawned: state.firstWeekVisitorSpawned,
    nextEntityId: state.nextEntityId,
    nextBuildingId: state.nextBuildingId,
    nextFloatingTextId: state.nextFloatingTextId,
    totalBuildingsCompleted: state.totalBuildingsCompleted,
    ecoHealthYearsAbove80: state.ecoHealthYearsAbove80 ?? 0,
    villageReputation: state.villageReputation ?? 0,
    renffrOmen: state.renffrOmen ? { ...state.renffrOmen } : null,
    renffrChatterUntilTick: state.renffrChatterUntilTick ?? 0,
    lastProcessedCalendarDay: state.lastProcessedCalendarDay ?? 0,
    lastWildlifeReplenishLogDay: state.lastWildlifeReplenishLogDay ?? 0,
    storyFlags: { ...(state.storyFlags ?? {}) },
    pendingStoryEvents: structuredClone(state.pendingStoryEvents ?? []),
    guidedCampaign: state.guidedCampaign ? structuredClone(state.guidedCampaign) : undefined,
    workSchedule: getWorkSchedule(state),
    tavernSchedule: getVenueSchedule(state, 'tavern'),
    hotelSchedule: getVenueSchedule(state, 'hotel'),
  };
}

export function applySimPrep(world: WorldState, prep: SimPrepPayload): void {
  world.tick = prep.tick;
  world.year = prep.year;
  world.dayInYear = prep.dayInYear;
  world.season = prep.season;
  world.weather = prep.weather;
  world.weatherTimer = prep.weatherTimer;
  world.paused = prep.paused;
  world.speed = prep.speed;

  world.entities = prep.entities;
  world.buildings = prep.buildings;

  world.resources = prep.resources;
  world.storageMax = prep.storageMax;
  world.humanPopulation = prep.humanPopulation;
  world.maxHumanPopulation = prep.maxHumanPopulation;
  world.wildlifeCounts = prep.wildlifeCounts;
  world.ecosystemHealth = prep.ecosystemHealth;
  world.pollutionLevel = prep.pollutionLevel;
  world.biodiversityIndex = prep.biodiversityIndex;
  world.valleyStage = prep.valleyStage;
  world.valleyStageSinceDay = prep.valleyStageSinceDay;
  world.valleyRawStressStreakDays = prep.valleyRawStressStreakDays;
  world.valleyRawCalmStreakDays = prep.valleyRawCalmStreakDays;
  world.valleyLastStageNotifyDay = prep.valleyLastStageNotifyDay;

  world.researchNodes = prep.researchNodes;
  world.activeResearch = prep.activeResearch;
  world.researchProgress = prep.researchProgress;
  world.unlockedTechs = prep.unlockedTechs;
  world.visitorGroups = prep.visitorGroups;
  world.activeVillageRequest = prep.activeVillageRequest;
  world.villageRequestCooldownUntilDay = prep.villageRequestCooldownUntilDay;
  world.villageRequestHistory = prep.villageRequestHistory;
  world.rivalSettlements = prep.rivalSettlements;
  world.pendingRaidEvents = prep.pendingRaidEvents;
  world.pendingOutgoingRaidEvents = prep.pendingOutgoingRaidEvents;
  world.pendingDiplomacyEvents = prep.pendingDiplomacyEvents;
  world.tradeRoutes = prep.tradeRoutes;
  world.disasters = prep.disasters;
  world.villageForge = prep.villageForge;
  world.challenges = prep.challenges;
  world.festival = prep.festival;
  world.townHallFestivalCooldownUntilTick = prep.townHallFestivalCooldownUntilTick;
  world.villageLeaderId = prep.villageLeaderId;
  world.leaderSinceYear = prep.leaderSinceYear;
  world.lastElectionYear = prep.lastElectionYear;
  world.pendingElectionYear = prep.pendingElectionYear;
  world.electionBuildupNotifiedYear = prep.electionBuildupNotifiedYear;
  world.electionCeremony = prep.electionCeremony;
  world.eventLog = prep.eventLog;
  world.eventsThisYear = prep.eventsThisYear;
  world.lastEventYear = prep.lastEventYear;
  world.bountifulHarvest = prep.bountifulHarvest;
  world.firstWeekVisitorSpawned = prep.firstWeekVisitorSpawned;
  world.nextEntityId = prep.nextEntityId;
  world.nextBuildingId = prep.nextBuildingId;
  world.nextFloatingTextId = prep.nextFloatingTextId;
  world.totalBuildingsCompleted = prep.totalBuildingsCompleted;
  world.ecoHealthYearsAbove80 = prep.ecoHealthYearsAbove80;
  world.villageReputation = prep.villageReputation;
  world.renffrOmen = prep.renffrOmen;
  world.renffrChatterUntilTick = prep.renffrChatterUntilTick;
  world.lastProcessedCalendarDay = prep.lastProcessedCalendarDay;
  world.lastWildlifeReplenishLogDay = prep.lastWildlifeReplenishLogDay;
  world.storyFlags = prep.storyFlags;
  world.pendingStoryEvents = prep.pendingStoryEvents;
  world.guidedCampaign = prep.guidedCampaign;
  world.workSchedule = prep.workSchedule;
  world.tavernSchedule = prep.tavernSchedule;
  world.hotelSchedule = prep.hotelSchedule;
}
import type { WorldState } from '../gameTypes';

/** Mutable sim slices updated before each headless worker tick (excludes worldMap). */
export type SimPrepPayload = Pick<
  WorldState,
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
  | 'researchNodes'
  | 'activeResearch'
  | 'researchProgress'
  | 'unlockedTechs'
  | 'visitorGroups'
  | 'rivalSettlements'
  | 'pendingRaidEvents'
  | 'pendingOutgoingRaidEvents'
  | 'pendingDiplomacyEvents'
  | 'tradeRoutes'
  | 'villageForge'
  | 'challenges'
  | 'victories'
  | 'festival'
  | 'townHallFestivalCooldownUntilTick'
  | 'villageLeaderId'
  | 'leaderSinceYear'
  | 'lastElectionYear'
  | 'pendingElectionYear'
  | 'electionBuildupNotifiedYear'
  | 'electionCeremony'
  | 'eventLog'
  | 'nextEntityId'
  | 'nextBuildingId'
  | 'nextFloatingTextId'
  | 'totalBuildingsCompleted'
>;

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
    entities: state.entities,
    buildings: state.buildings,
    resources: state.resources,
    storageMax: state.storageMax,
    humanPopulation: state.humanPopulation,
    maxHumanPopulation: state.maxHumanPopulation,
    wildlifeCounts: state.wildlifeCounts,
    researchNodes: state.researchNodes,
    activeResearch: state.activeResearch,
    researchProgress: state.researchProgress,
    unlockedTechs: state.unlockedTechs,
    visitorGroups: state.visitorGroups,
    rivalSettlements: state.rivalSettlements,
    pendingRaidEvents: state.pendingRaidEvents ?? [],
    pendingOutgoingRaidEvents: state.pendingOutgoingRaidEvents ?? [],
    pendingDiplomacyEvents: state.pendingDiplomacyEvents ?? [],
    tradeRoutes: state.tradeRoutes,
    villageForge: state.villageForge,
    challenges: state.challenges,
    victories: state.victories,
    festival: state.festival,
    townHallFestivalCooldownUntilTick: state.townHallFestivalCooldownUntilTick ?? 0,
    villageLeaderId: state.villageLeaderId,
    leaderSinceYear: state.leaderSinceYear,
    lastElectionYear: state.lastElectionYear,
    pendingElectionYear: state.pendingElectionYear,
    electionBuildupNotifiedYear: state.electionBuildupNotifiedYear ?? null,
    electionCeremony: state.electionCeremony,
    eventLog: state.eventLog,
    nextEntityId: state.nextEntityId,
    nextBuildingId: state.nextBuildingId,
    nextFloatingTextId: state.nextFloatingTextId,
    totalBuildingsCompleted: state.totalBuildingsCompleted,
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
  world.researchNodes = prep.researchNodes;
  world.activeResearch = prep.activeResearch;
  world.researchProgress = prep.researchProgress;
  world.unlockedTechs = prep.unlockedTechs;
  world.visitorGroups = prep.visitorGroups;
  world.rivalSettlements = prep.rivalSettlements;
  world.pendingRaidEvents = prep.pendingRaidEvents;
  world.pendingOutgoingRaidEvents = prep.pendingOutgoingRaidEvents;
  world.pendingDiplomacyEvents = prep.pendingDiplomacyEvents;
  world.tradeRoutes = prep.tradeRoutes;
  world.villageForge = prep.villageForge;
  world.challenges = prep.challenges;
  world.victories = prep.victories;
  world.festival = prep.festival;
  world.townHallFestivalCooldownUntilTick = prep.townHallFestivalCooldownUntilTick;
  world.villageLeaderId = prep.villageLeaderId;
  world.leaderSinceYear = prep.leaderSinceYear;
  world.lastElectionYear = prep.lastElectionYear;
  world.pendingElectionYear = prep.pendingElectionYear;
  world.electionBuildupNotifiedYear = prep.electionBuildupNotifiedYear;
  world.electionCeremony = prep.electionCeremony;
  world.eventLog = prep.eventLog;
  world.nextEntityId = prep.nextEntityId;
  world.nextBuildingId = prep.nextBuildingId;
  world.nextFloatingTextId = prep.nextFloatingTextId;
  world.totalBuildingsCompleted = prep.totalBuildingsCompleted;
}
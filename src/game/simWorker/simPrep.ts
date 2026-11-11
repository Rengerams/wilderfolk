import { profileEnd, profileStart } from '../performanceProfiler';

/** Timed section for the rollback snapshot; the profiler is opt-in, so production pays one call. */
function profileSection<T>(name: string, work: () => T): T {
  const start = profileStart();
  const value = work();
  profileEnd(name, start);
  return value;
}
import type { WorldState } from '../gameTypes';
import { normalizeForgeState } from '../forge';
import { getWorkSchedule } from '../workSchedule';
import { getVenueSchedule } from '../venueSchedule';
import { getWorkforcePolicy } from '../workforcePolicy';
import { rebuildWorldRuntimeCaches } from '../worldRuntimeCaches';
import { ScentGrid, isScentGridRuntime } from '../scentGrid';
import { restoreSimRng, snapshotSimRng } from '../simRng';

/**
 * Mutable sim slices backed up before each tick/command for rollback. `extractSimPrep` and
 * `applySimPrep` are the two halves; module-level id counters are outside this contract.
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
  | 'deathParticles'
  | 'floatingTexts'
  | 'screenShakeImpulse'
  | 'resources'
  | 'storageMax'
  | 'foodSpoilageRate'
  | 'economyLedger'
  | 'foodHistory'
  | 'humanPopulation'
  | 'maxHumanPopulation'
  | 'workingSettlers'
  | 'idleSettlers'
  | 'wildlifeCounts'
  | 'ecosystemHealth'
  | 'pollutionLevel'
  | 'pendingEcosystemHealthDelta'
  | 'pendingPollutionDelta'
  | 'biodiversityIndex'
  | 'valleyStage'
  | 'valleyStageSinceDay'
  | 'valleyRawStressStreakDays'
  | 'valleyRawCalmStreakDays'
  | 'valleyLastStageNotifyDay'
  | 'villageCanHeat'
  | 'villageHappiness'
  | 'activeMigration'
  | 'migrationNextHerdSize'
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
  | 'raidBattleReports'
  | 'pendingRaidVictories'
  | 'raidRecovery'
  | 'scoredRaidIds'
  | 'graveRecords'
  | 'raidPrisonerHistory'
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
  | 'spotlightLore'
  | 'spotlightLoreLastDay'
  | 'activeEvent'
  | 'eventLog'
  | 'genealogyRegistry'
  | 'eventsThisYear'
  | 'lastEventYear'
  | 'bountifulHarvest'
  | 'firstWeekVisitorSpawned'
  | 'nextEntityId'
  | 'nextBuildingId'
  | 'nextFloatingTextId'
  | 'totalBuildingsCompleted'
  | 'populationHistory'
  | 'yearlyStats'
  | 'lifetimeStats'
  | 'ecoHealthYearsAbove80'
  | 'villageReputation'
  | 'renffrOmen'
  | 'visitorQuest'
  | 'deathsThisYear'
  | 'lastMoonHowlerExorcismTick'
  | 'moonHowlerPriestsFleeUntil'
  | 'chronicleChapters'
  | 'electionPromiseRecords'
  | 'renffrChatterUntilTick'
  | 'lastProcessedCalendarDay'
  | 'lastWildlifeReplenishLogDay'
  | 'storyFlags'
  | 'inventionFair'
  | 'pendingStoryEvents'
  | 'guidedCampaign'
  | 'workSchedule'
  | 'tavernSchedule'
  | 'hotelSchedule'
  | 'workforcePolicy'
  | 'bigNews'
  | 'notifications'
  | 'huntVisuals'
  | 'simRng'
  // Simulation state that lives in a runtime-cache slot (see `restoreScentGridSnapshot`).
  | 'scentGrid';

export type SimPrepPayload = Pick<WorldState, SimPrepKeys>;

export function extractSimPrep(state: WorldState): SimPrepPayload {
  const start = profileStart();
  const prep: SimPrepPayload = {
    tick: state.tick,
    year: state.year,
    dayInYear: state.dayInYear,
    season: state.season,
    weather: state.weather,
    weatherTimer: state.weatherTimer,
    paused: state.paused,
    speed: state.speed,

    // Clone entity objects and isolate nested arrays/maps from in-place property mutations
    entities: profileSection('rollback.entities', () => (state.entities ?? []).map((e) => ({
      ...e,
      battleLeadershipAwards: e.battleLeadershipAwards ? { ...e.battleLeadershipAwards } : undefined,
      warCaptive: e.warCaptive ? { ...e.warCaptive } : undefined,
      skills: e.skills ? { ...e.skills } : e.skills,
      careerHistory: e.careerHistory
        ? Object.fromEntries(Object.entries(e.careerHistory).map(([job, row]) => [job, { ...row }]))
        : undefined,
      careerMilestones: e.careerMilestones
        ? Object.fromEntries(Object.entries(e.careerMilestones).map(([job, row]) => [job, { ...row }]))
        : undefined,
      genomeV2: e.genomeV2,
      marks: e.marks ? e.marks.map((mark) => ({ ...mark })) : e.marks,
      childrenIds: e.childrenIds ? [...e.childrenIds] : e.childrenIds,
      childhoodFriendsIds: e.childhoodFriendsIds ? [...e.childhoodFriendsIds] : e.childhoodFriendsIds,
      friendships: e.friendships,
      feuds: e.feuds,
      feudPeaks: e.feudPeaks,
      ...(e.needs !== undefined ? { needs: { ...e.needs } } : {}),
      ...(e.moonHowlerSaved !== undefined ? {
        moonHowlerSaved: {
          ...e.moonHowlerSaved,
          ...(e.moonHowlerSaved.needs !== undefined
            ? { needs: { ...e.moonHowlerSaved.needs } } : {}),
        },
      } : {}),
    }))),

    buildings: profileSection('rollback.buildings', () => (state.buildings ?? []).map((b) => ({
      ...b,
      occupants: [...(b.occupants ?? [])],
      hotelGuestIds: b.hotelGuestIds ? [...b.hotelGuestIds] : undefined,
    }))),

    // Copy the elements, not just the arrays: the realtime layer decays these in place, so a
    // shallow spread would let a rollback restore already-mutated values.
    deathParticles: (state.deathParticles ?? []).map((particle) => ({ ...particle })),
    floatingTexts: (state.floatingTexts ?? []).map((text) => ({ ...text })),
    screenShakeImpulse: state.screenShakeImpulse ?? 0,

    resources: { ...state.resources },
    storageMax: { ...state.storageMax },
    foodSpoilageRate: state.foodSpoilageRate,
    economyLedger: state.economyLedger
      ? {
          day: state.economyLedger.day,
          produced: { ...state.economyLedger.produced },
          consumed: { ...state.economyLedger.consumed },
          // The totals ride with the maps they summarize: the display world reads them instead of
          // adding up, so a rollback must restore them too.
          producedTotal: state.economyLedger.producedTotal,
          consumedTotal: state.economyLedger.consumedTotal,
        }
      : undefined,
    foodHistory: state.foodHistory
      ? state.foodHistory.map((s) => ({
          ...s,
          produced: { ...s.produced },
          consumed: { ...s.consumed },
        }))
      : undefined,
    humanPopulation: state.humanPopulation,
    maxHumanPopulation: state.maxHumanPopulation,
    workingSettlers: state.workingSettlers ?? 0,
    idleSettlers: state.idleSettlers ?? 0,
    wildlifeCounts: { ...state.wildlifeCounts },
    ecosystemHealth: state.ecosystemHealth,
    pollutionLevel: state.pollutionLevel,
    pendingEcosystemHealthDelta: state.pendingEcosystemHealthDelta,
    pendingPollutionDelta: state.pendingPollutionDelta,
    biodiversityIndex: state.biodiversityIndex,
    valleyStage: state.valleyStage,
    valleyStageSinceDay: state.valleyStageSinceDay,
    valleyRawStressStreakDays: state.valleyRawStressStreakDays,
    valleyRawCalmStreakDays: state.valleyRawCalmStreakDays,
    valleyLastStageNotifyDay: state.valleyLastStageNotifyDay,
    villageCanHeat: state.villageCanHeat,
    villageHappiness: state.villageHappiness,
    activeMigration: state.activeMigration ? { ...state.activeMigration } : undefined,
    migrationNextHerdSize: state.migrationNextHerdSize,

    researchNodes: (state.researchNodes ?? []).map((r) => ({ ...r })),
    activeResearch: state.activeResearch,
    researchProgress: state.researchProgress,
    unlockedTechs: [...(state.unlockedTechs ?? [])],
    visitorGroups: structuredClone(state.visitorGroups ?? []),
    activeVillageRequest: state.activeVillageRequest ? structuredClone(state.activeVillageRequest) : undefined,
    villageRequestCooldownUntilDay: state.villageRequestCooldownUntilDay ?? 0,
    villageRequestHistory: structuredClone(state.villageRequestHistory ?? []),
    rivalSettlements: structuredClone(state.rivalSettlements ?? []),
    pendingRaidEvents: structuredClone(state.pendingRaidEvents ?? []),
    pendingOutgoingRaidEvents: structuredClone(state.pendingOutgoingRaidEvents ?? []),
    pendingRaidVictories: state.pendingRaidVictories === undefined ? undefined : structuredClone(state.pendingRaidVictories),
    raidBattleReports: state.raidBattleReports === undefined ? undefined : structuredClone(state.raidBattleReports),
    raidRecovery: state.raidRecovery === undefined ? undefined : structuredClone(state.raidRecovery),
    scoredRaidIds: state.scoredRaidIds === undefined ? undefined : structuredClone(state.scoredRaidIds),
    graveRecords: profileSection('rollback.graves', () => (state.graveRecords === undefined ? undefined : structuredClone(state.graveRecords))),
    raidPrisonerHistory: state.raidPrisonerHistory === undefined ? undefined : structuredClone(state.raidPrisonerHistory),
    pendingDiplomacyEvents: [...(state.pendingDiplomacyEvents ?? [])],
    tradeRoutes: structuredClone(state.tradeRoutes ?? []),
    disasters: structuredClone(state.disasters ?? []),
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
    spotlightLore: state.spotlightLore ? structuredClone(state.spotlightLore) : null,
    spotlightLoreLastDay: state.spotlightLoreLastDay,
    // Written by the daily layer, so the tick must be able to roll it back.
    activeEvent: state.activeEvent ? structuredClone(state.activeEvent) : null,
    eventLog: [...(state.eventLog ?? [])],
    genealogyRegistry: profileSection('rollback.genealogy', () => (state.genealogyRegistry ? { people: Object.fromEntries(Object.entries(state.genealogyRegistry.people).map(([id, person]) => [id, { ...person, partners: [...person.partners], childrenIds: [...person.childrenIds] }])) } : undefined)),
    eventsThisYear: [...(state.eventsThisYear ?? [])],
    lastEventYear: state.lastEventYear,
    bountifulHarvest: state.bountifulHarvest,
    firstWeekVisitorSpawned: state.firstWeekVisitorSpawned,
    nextEntityId: state.nextEntityId,
    nextBuildingId: state.nextBuildingId,
    nextFloatingTextId: state.nextFloatingTextId,
    totalBuildingsCompleted: state.totalBuildingsCompleted,
    populationHistory: structuredClone(state.populationHistory ?? []),
    yearlyStats: structuredClone(state.yearlyStats ?? []),
    lifetimeStats: structuredClone(state.lifetimeStats),
    ecoHealthYearsAbove80: state.ecoHealthYearsAbove80 ?? 0,
    villageReputation: state.villageReputation ?? 0,
    renffrOmen: state.renffrOmen ? { ...state.renffrOmen } : null,
    visitorQuest: state.visitorQuest ? { ...state.visitorQuest } : undefined,
    deathsThisYear: state.deathsThisYear ? { ...state.deathsThisYear } : { humans: 0, animals: 0 },
    lastMoonHowlerExorcismTick: state.lastMoonHowlerExorcismTick,
    moonHowlerPriestsFleeUntil: state.moonHowlerPriestsFleeUntil,
    chronicleChapters: [...(state.chronicleChapters ?? [])],
    electionPromiseRecords: state.electionPromiseRecords === undefined
      ? undefined
      : structuredClone(state.electionPromiseRecords),
    renffrChatterUntilTick: state.renffrChatterUntilTick ?? 0,
    lastProcessedCalendarDay: state.lastProcessedCalendarDay ?? 0,
    lastWildlifeReplenishLogDay: state.lastWildlifeReplenishLogDay ?? 0,
    storyFlags: { ...(state.storyFlags ?? {}) },
    inventionFair: state.inventionFair ? structuredClone(state.inventionFair) : null,
    pendingStoryEvents: structuredClone(state.pendingStoryEvents ?? []),
    guidedCampaign: state.guidedCampaign ? structuredClone(state.guidedCampaign) : undefined,
    workSchedule: getWorkSchedule(state),
    tavernSchedule: getVenueSchedule(state, 'tavern'),
    hotelSchedule: getVenueSchedule(state, 'hotel'),
    workforcePolicy: getWorkforcePolicy(state),
    bigNews: [...(state.bigNews ?? [])],
    notifications: [...(state.notifications ?? [])],
    huntVisuals: [...(state.huntVisuals ?? [])],
    // A real copy, not a reference: the realtime layer decays the grid and deposits predator
    // odour into it in place before anything can throw.
    scentGrid: isScentGridRuntime(state.scentGrid)
      ? ScentGrid.fromRuntime(state.scentGrid)
      : undefined,
    simRng: snapshotSimRng(),
  };
  profileEnd('simulation.rollbackSnapshot', start);
  return prep;
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
  world.deathParticles = prep.deathParticles;
  world.floatingTexts = prep.floatingTexts;
  world.screenShakeImpulse = prep.screenShakeImpulse;

  world.resources = prep.resources;
  world.storageMax = prep.storageMax;
  world.foodSpoilageRate = prep.foodSpoilageRate;
  // Whole-object restore: the payload's clone already carries `producedTotal` / `consumedTotal`.
  world.economyLedger = prep.economyLedger;
  world.foodHistory = prep.foodHistory;
  world.humanPopulation = prep.humanPopulation;
  world.maxHumanPopulation = prep.maxHumanPopulation;
  world.workingSettlers = prep.workingSettlers;
  world.idleSettlers = prep.idleSettlers;
  world.wildlifeCounts = prep.wildlifeCounts;
  world.ecosystemHealth = prep.ecosystemHealth;
  world.pollutionLevel = prep.pollutionLevel;
  world.pendingEcosystemHealthDelta = prep.pendingEcosystemHealthDelta;
  world.pendingPollutionDelta = prep.pendingPollutionDelta;
  world.biodiversityIndex = prep.biodiversityIndex;
  world.valleyStage = prep.valleyStage;
  world.valleyStageSinceDay = prep.valleyStageSinceDay;
  world.valleyRawStressStreakDays = prep.valleyRawStressStreakDays;
  world.valleyRawCalmStreakDays = prep.valleyRawCalmStreakDays;
  world.valleyLastStageNotifyDay = prep.valleyLastStageNotifyDay;
  world.villageCanHeat = prep.villageCanHeat;
  world.villageHappiness = prep.villageHappiness;
  world.activeMigration = prep.activeMigration;
  world.migrationNextHerdSize = prep.migrationNextHerdSize;

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
  if (prep.pendingRaidVictories === undefined) delete world.pendingRaidVictories;
  else world.pendingRaidVictories = prep.pendingRaidVictories;
  if (prep.raidBattleReports === undefined) delete world.raidBattleReports;
  else world.raidBattleReports = prep.raidBattleReports;
  if (prep.raidRecovery === undefined) delete world.raidRecovery;
  else world.raidRecovery = prep.raidRecovery;
  if (prep.scoredRaidIds === undefined) delete world.scoredRaidIds;
  else world.scoredRaidIds = prep.scoredRaidIds;
  if (prep.graveRecords === undefined) delete world.graveRecords;
  else world.graveRecords = prep.graveRecords;
  if (prep.raidPrisonerHistory === undefined) delete world.raidPrisonerHistory;
  else world.raidPrisonerHistory = prep.raidPrisonerHistory;
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
  world.spotlightLore = prep.spotlightLore;
  world.spotlightLoreLastDay = prep.spotlightLoreLastDay;
  world.activeEvent = prep.activeEvent;
  world.eventLog = prep.eventLog;
  world.genealogyRegistry = prep.genealogyRegistry;
  world.eventsThisYear = prep.eventsThisYear;
  world.lastEventYear = prep.lastEventYear;
  world.bountifulHarvest = prep.bountifulHarvest;
  world.firstWeekVisitorSpawned = prep.firstWeekVisitorSpawned;
  world.nextEntityId = prep.nextEntityId;
  world.nextBuildingId = prep.nextBuildingId;
  world.nextFloatingTextId = prep.nextFloatingTextId;
  world.totalBuildingsCompleted = prep.totalBuildingsCompleted;
  world.populationHistory = prep.populationHistory;
  world.yearlyStats = prep.yearlyStats;
  world.lifetimeStats = prep.lifetimeStats;
  world.ecoHealthYearsAbove80 = prep.ecoHealthYearsAbove80;
  world.villageReputation = prep.villageReputation;
  world.renffrOmen = prep.renffrOmen;
  world.visitorQuest = prep.visitorQuest;
  world.deathsThisYear = prep.deathsThisYear;
  world.lastMoonHowlerExorcismTick = prep.lastMoonHowlerExorcismTick;
  world.moonHowlerPriestsFleeUntil = prep.moonHowlerPriestsFleeUntil;
  world.chronicleChapters = prep.chronicleChapters;
  if (prep.electionPromiseRecords === undefined) delete world.electionPromiseRecords;
  else world.electionPromiseRecords = prep.electionPromiseRecords;
  world.renffrChatterUntilTick = prep.renffrChatterUntilTick;
  world.lastProcessedCalendarDay = prep.lastProcessedCalendarDay;
  world.lastWildlifeReplenishLogDay = prep.lastWildlifeReplenishLogDay;
  world.storyFlags = prep.storyFlags;
  world.inventionFair = prep.inventionFair;
  world.pendingStoryEvents = prep.pendingStoryEvents;
  world.guidedCampaign = prep.guidedCampaign;
  world.workSchedule = prep.workSchedule;
  world.tavernSchedule = prep.tavernSchedule;
  world.hotelSchedule = prep.hotelSchedule;
  world.workforcePolicy = prep.workforcePolicy;
  world.bigNews = prep.bigNews;
  world.notifications = prep.notifications;
  world.huntVisuals = prep.huntVisuals;
  world.simRng = prep.simRng;
  restoreSimRng(prep.simRng);

  // Scent field: rollback restores its pre-tick value, then `rebuildWorldRuntimeCaches`
  // carries it across the runtime-cache slot. Order matters: restore first, rebuild second.
  restoreScentGridSnapshot(world, prep.scentGrid);
  rebuildWorldRuntimeCaches(world);
}

/**
 * Puts a prep snapshot of the scent field back onto `world`, copying into the live grid when its
 * geometry matches; the snapshot is never adopted, so it stays re-appliable.
 */
function restoreScentGridSnapshot(world: WorldState, snapshot: WorldState['scentGrid']): void {
  const live = world.scentGrid;
  if (!isScentGridRuntime(snapshot)) {
    world.scentGrid = undefined;
    return;
  }
  if (
    live &&
    live.cols === snapshot.cols &&
    live.rows === snapshot.rows &&
    live.cellSize === snapshot.cellSize
  ) {
    live.values.set(snapshot.values);
    return;
  }
  world.scentGrid = ScentGrid.fromRuntime(snapshot);
}
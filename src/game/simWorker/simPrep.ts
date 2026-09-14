import type { WorldState } from '../gameTypes';
import { normalizeForgeState } from '../forge';
import { getWorkSchedule } from '../workSchedule';
import { getVenueSchedule } from '../venueSchedule';
import { invalidateWorldRuntimeCaches } from '../worldRuntimeCaches';
import { restoreSimRng, snapshotSimRng } from '../simRng';

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
  | 'deathParticles'
  | 'floatingTexts'
  | 'screenShakeImpulse'
  | 'resources'
  | 'storageMax'
  // Ledger, rolling food samples and the spoilage rate are written by the daily
  // tick. A tick that is rolled back and then re-executed (or simply lost) would
  // otherwise keep the entries it wrote before failing, so the Food ledger and
  // dashboard would count food the colony never kept.
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
  // Year-rollover and stats fields written by `gameTick` (yearly snapshot at the
  // calendar boundary, lifetime counters, 10-tick population sample). They must
  // stay in this payload: a failed tick is rolled back and then re-executed on the
  // main thread, so an unbacked field is advanced twice for the same tick.
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
  | 'renffrChatterUntilTick'
  | 'lastProcessedCalendarDay'
  | 'lastWildlifeReplenishLogDay'
  | 'storyFlags'
  | 'pendingStoryEvents'
  | 'guidedCampaign'
  | 'workSchedule'
  | 'tavernSchedule'
  | 'hotelSchedule'
  // RNG stream positions: the pre-tick snapshot `extractSimPrep` takes them fresh (the world's
  // own field is only a transport container), and `applySimPrep` puts the streams back where
  // they were. Without it the rolled-back tick replays each owner's sequence from the start.
  | 'simRng';

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

    // Clone entity objects to decouple from in-place property mutations. The nested
    // maps/arrays below are written in place during a tick (`ensureEntitySkills`,
    // `parent.childrenIds.push`, friendship/feud entries, the Moon Howler snapshot), so
    // they must be copied too or a rollback would keep the failed attempt's changes.
    entities: (state.entities ?? []).map((e) => ({
      ...e,
      skills: e.skills ? { ...e.skills } : e.skills,
      childrenIds: e.childrenIds ? [...e.childrenIds] : e.childrenIds,
      childhoodFriendsIds: e.childhoodFriendsIds ? [...e.childhoodFriendsIds] : e.childhoodFriendsIds,
      friendships: e.friendships ? { ...e.friendships } : e.friendships,
      feuds: e.feuds ? { ...e.feuds } : e.feuds,
      moonHowlerSaved: e.moonHowlerSaved ? { ...e.moonHowlerSaved } : e.moonHowlerSaved,
    })),

    // Clone building objects and isolate their occupants array
    buildings: (state.buildings ?? []).map((b) => ({
      ...b,
      occupants: [...(b.occupants ?? [])],
      hotelGuestIds: b.hotelGuestIds ? [...b.hotelGuestIds] : undefined,
    })),

    deathParticles: [...(state.deathParticles ?? [])],
    floatingTexts: [...(state.floatingTexts ?? [])],
    screenShakeImpulse: state.screenShakeImpulse ?? 0,

    resources: { ...state.resources },
    storageMax: { ...state.storageMax },
    foodSpoilageRate: state.foodSpoilageRate,
    // Clone the ledger + rolling samples deeply: the daily tick and its writers
    // (`economyLedger.ts`) mutate `produced`/`consumed` in place, and a shallow copy
    // would still alias the live objects.
    economyLedger: state.economyLedger
      ? {
          day: state.economyLedger.day,
          produced: { ...state.economyLedger.produced },
          consumed: { ...state.economyLedger.consumed },
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

    // Clone research nodes shallowly to preserve researched/unlocked status
    researchNodes: (state.researchNodes ?? []).map((r) => ({ ...r })),
    activeResearch: state.activeResearch,
    researchProgress: state.researchProgress,
    unlockedTechs: [...(state.unlockedTechs ?? [])],
    // Object-valued arrays whose elements are mutated in place during a tick
    // (`route.caravanLeg`, `disaster.progress`, visitor/rival counters), so the backup
    // must own copies of the elements rather than of the outer array only.
    visitorGroups: structuredClone(state.visitorGroups ?? []),
    activeVillageRequest: state.activeVillageRequest ? structuredClone(state.activeVillageRequest) : undefined,
    villageRequestCooldownUntilDay: state.villageRequestCooldownUntilDay ?? 0,
    villageRequestHistory: structuredClone(state.villageRequestHistory ?? []),
    rivalSettlements: structuredClone(state.rivalSettlements ?? []),
    pendingRaidEvents: [...(state.pendingRaidEvents ?? [])],
    pendingOutgoingRaidEvents: [...(state.pendingOutgoingRaidEvents ?? [])],
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
    eventLog: [...(state.eventLog ?? [])],
    eventsThisYear: [...(state.eventsThisYear ?? [])],
    lastEventYear: state.lastEventYear,
    bountifulHarvest: state.bountifulHarvest,
    firstWeekVisitorSpawned: state.firstWeekVisitorSpawned,
    nextEntityId: state.nextEntityId,
    nextBuildingId: state.nextBuildingId,
    nextFloatingTextId: state.nextFloatingTextId,
    totalBuildingsCompleted: state.totalBuildingsCompleted,
    // Deep-cloned: gameTick pushes a year-rollover entry and increments nested
    // lifetime counters, so a shallow copy would still alias the live objects.
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
    renffrChatterUntilTick: state.renffrChatterUntilTick ?? 0,
    lastProcessedCalendarDay: state.lastProcessedCalendarDay ?? 0,
    lastWildlifeReplenishLogDay: state.lastWildlifeReplenishLogDay ?? 0,
    storyFlags: { ...(state.storyFlags ?? {}) },
    pendingStoryEvents: structuredClone(state.pendingStoryEvents ?? []),
    guidedCampaign: state.guidedCampaign ? structuredClone(state.guidedCampaign) : undefined,
    workSchedule: getWorkSchedule(state),
    tavernSchedule: getVenueSchedule(state, 'tavern'),
    hotelSchedule: getVenueSchedule(state, 'hotel'),
    simRng: snapshotSimRng(),
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
  world.deathParticles = prep.deathParticles;
  world.floatingTexts = prep.floatingTexts;
  world.screenShakeImpulse = prep.screenShakeImpulse;

  world.resources = prep.resources;
  world.storageMax = prep.storageMax;
  world.foodSpoilageRate = prep.foodSpoilageRate;
  world.economyLedger = prep.economyLedger;
  world.foodHistory = prep.foodHistory;
  world.humanPopulation = prep.humanPopulation;
  world.maxHumanPopulation = prep.maxHumanPopulation;
  world.workingSettlers = prep.workingSettlers;
  world.idleSettlers = prep.idleSettlers;
  world.wildlifeCounts = prep.wildlifeCounts;
  world.ecosystemHealth = prep.ecosystemHealth;
  world.pollutionLevel = prep.pollutionLevel;
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
  world.renffrChatterUntilTick = prep.renffrChatterUntilTick;
  world.lastProcessedCalendarDay = prep.lastProcessedCalendarDay;
  world.lastWildlifeReplenishLogDay = prep.lastWildlifeReplenishLogDay;
  world.storyFlags = prep.storyFlags;
  world.pendingStoryEvents = prep.pendingStoryEvents;
  world.guidedCampaign = prep.guidedCampaign;
  world.workSchedule = prep.workSchedule;
  world.tavernSchedule = prep.tavernSchedule;
  world.hotelSchedule = prep.hotelSchedule;
  world.simRng = prep.simRng;
  restoreSimRng(prep.simRng);

  // Crucial: Invalidate runtime caches so indices reflect restored entity states
  invalidateWorldRuntimeCaches(world);
}
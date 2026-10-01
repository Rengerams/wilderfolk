import type { WorldState } from '../gameTypes';
import { normalizeForgeState } from '../forge';
import { getWorkSchedule } from '../workSchedule';
import { getVenueSchedule } from '../venueSchedule';
import { getWorkforcePolicy } from '../workforcePolicy';
import { rebuildWorldRuntimeCaches } from '../worldRuntimeCaches';
import { ScentGrid, isScentGridRuntime } from '../scentGrid';
import { restoreSimRng, snapshotSimRng } from '../simRng';

/**
 * Mutable sim slices backed up before each tick/command for instant failure recovery.
 *
 * **What this payload is, and what it is not.** It is the `WorldState` half of the rollback: every key
 * here is snapshotted by `extractSimPrep` and written back by `applySimPrep`, and
 * `tests/workerBoundary.closure.test.ts` proves the rollback is complete for the world by comparing the
 * *union* of both worlds' own keys after a real tick — so a world field the tick advances and this list
 * omits is a failing difference, not an invisible one.
 *
 * The module-level counters are deliberately outside that contract, and this is the one place to say
 * so. `nextBigNewsId` (`simEffects.ts`) and `nextEventLogId` (`eventLog.ts`) are imported bindings, not
 * world fields, so a rollback cannot restore them — they stay ahead of the restored `bigNews` /
 * `eventLog` arrays. Both owners already defend against the only consequence that matters, by clamping
 * their next id against the ids the restored world actually carries (`simEffects.ts` `addBigNews`,
 * `eventLog.ts` `logEvent`), so ids stay unique and monotonic and no rule reads the value. The residual
 * is that the *sequence* of minted ids is not reproducible across a rollback. If a future counter
 * cannot be defended that way, move it onto `WorldState` and add it here rather than adding a second
 * rule about which module state a rollback covers.
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
  | 'activeEvent'
  | 'eventLog'
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
  | 'renffrChatterUntilTick'
  | 'lastProcessedCalendarDay'
  | 'lastWildlifeReplenishLogDay'
  | 'storyFlags'
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
  return {
    tick: state.tick,
    year: state.year,
    dayInYear: state.dayInYear,
    season: state.season,
    weather: state.weather,
    weatherTimer: state.weatherTimer,
    paused: state.paused,
    speed: state.speed,

    // Clone entity objects and isolate nested arrays/maps from in-place property mutations
    entities: (state.entities ?? []).map((e) => ({
      ...e,
      skills: e.skills ? { ...e.skills } : e.skills,
      traits: e.traits ? [...e.traits] : e.traits,
      childrenIds: e.childrenIds ? [...e.childrenIds] : e.childrenIds,
      childhoodFriendsIds: e.childhoodFriendsIds ? [...e.childhoodFriendsIds] : e.childhoodFriendsIds,
      friendships: e.friendships ? { ...e.friendships } : e.friendships,
      feuds: e.feuds ? { ...e.feuds } : e.feuds,
      feudPeaks: e.feudPeaks ? { ...e.feudPeaks } : e.feudPeaks,
      moonHowlerSaved: e.moonHowlerSaved ? { ...e.moonHowlerSaved } : e.moonHowlerSaved,
    })),

    // Clone building objects and isolate occupants array
    buildings: (state.buildings ?? []).map((b) => ({
      ...b,
      occupants: [...(b.occupants ?? [])],
      hotelGuestIds: b.hotelGuestIds ? [...b.hotelGuestIds] : undefined,
    })),

    // Copy the elements, not just the arrays. The realtime layer decays these **in place**
    // (`tickLayerRealtime`: `ft.y -= 0.7; ft.life--`, `p.x += p.vx; p.life--`), so a shallow spread
    // left the backup holding the live objects and the rollback restored the already-mutated values —
    // a partial no-op that aged every popup and particle twice for one failed tick. The entity and
    // building clones above already copy at this depth for the same reason.
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
          // adding up (`simDelta.ts`), and `summarizeFoodLedger`'s `?? sum` fallback hid their
          // absence after a rollback.
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
    // Written by the daily layer (`dailyWorldEvents.ts:194-230`), so the tick must be able to
    // roll it back — it used to be the one WorldState field the delta carried but the prep
    // payload did not.
    activeEvent: state.activeEvent ? structuredClone(state.activeEvent) : null,
    eventLog: [...(state.eventLog ?? [])],
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
    renffrChatterUntilTick: state.renffrChatterUntilTick ?? 0,
    lastProcessedCalendarDay: state.lastProcessedCalendarDay ?? 0,
    lastWildlifeReplenishLogDay: state.lastWildlifeReplenishLogDay ?? 0,
    storyFlags: { ...(state.storyFlags ?? {}) },
    pendingStoryEvents: structuredClone(state.pendingStoryEvents ?? []),
    guidedCampaign: state.guidedCampaign ? structuredClone(state.guidedCampaign) : undefined,
    workSchedule: getWorkSchedule(state),
    tavernSchedule: getVenueSchedule(state, 'tavern'),
    hotelSchedule: getVenueSchedule(state, 'hotel'),
    workforcePolicy: getWorkforcePolicy(state),
    bigNews: [...(state.bigNews ?? [])],
    notifications: [...(state.notifications ?? [])],
    huntVisuals: [...(state.huntVisuals ?? [])],
    // A real copy, not a reference: the realtime layer decays the grid and deposits predator odour
    // into it in place, before anything in the tick can throw, so a rolled-back tick used to keep
    // the failed decay and spread.
    scentGrid: isScentGridRuntime(state.scentGrid)
      ? ScentGrid.fromRuntime(state.scentGrid)
      : undefined,
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
  world.activeEvent = prep.activeEvent;
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
  world.workforcePolicy = prep.workforcePolicy;
  world.bigNews = prep.bigNews;
  world.notifications = prep.notifications;
  world.huntVisuals = prep.huntVisuals;
  world.simRng = prep.simRng;
  restoreSimRng(prep.simRng);

  // Two separate duties meet on the scent field, and conflating them is what let F-1 hide behind
  // the persist-across-rebuild fix:
  //   1. rollback — the field must return to its pre-tick value, because the realtime layer decayed
  //      and spread the live grid before the tick could fail (`restoreScentGridSnapshot`);
  //   2. persistence — `invalidateWorldRuntimeCaches` drops the slot as a runtime cache
  //      (worldRuntimeCaches.ts), which zeroed the whole trail after every rollback (F5), so the
  //      rebuild has to carry the restored grid across (`rebuildWorldRuntimeCaches`).
  // Order matters: restore first, rebuild second — the rebuild preserves what is in the slot then.
  restoreScentGridSnapshot(world, prep.scentGrid);
  rebuildWorldRuntimeCaches(world);
}

/**
 * Puts a prep snapshot of the scent field back onto `world`.
 *
 * Written back into the live grid whenever its geometry still matches, so the instance survives the
 * rollback (sidecar packing and the F5 case in `tests/simPrep.rollbackFields.test.ts` hold on to it);
 * the snapshot is copied out of, never adopted, so the payload stays re-appliable. An absent or
 * malformed snapshot means the pre-tick world had no usable grid at all: the one the failed tick
 * created is dropped, and the next realtime layer recreates it through `ensureScentGrid`.
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
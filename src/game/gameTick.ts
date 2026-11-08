/**
 * gameTick — thin orchestrator: calendar, TickContext, four layers, post cleanup.
 * Realtime owns chat/courtship, Assign owns house/job fill; domain helpers stay in feature modules.
 */
import type {
  WorldState, Entity, Building,
} from './gameTypes';
import {
  BuildingType,
  Season,
  EntityType,
} from './gameTypes';
import { recordHumanDeath, recordYearlyStats, tallyTickDeaths, updateLifetimeStats } from './stats';
import { logEvent } from './eventLog';
import { bumpHistoryRevision } from './historyRevisions';
import { ensureEntityByIdMap } from './entityIndex';
import { getGrassGrowthMultiplier, getWinterEnergyPenalty } from './grassEcology';
import {
  getCalendarDay,
  getHourOfDay,
  TICKS_PER_DAY,
  markCalendarDayProcessed,
  syncHumanAgeFromCalendar,
  reconcileOrphanedMarriages,
} from './dayCycle';
import { syncResidenceOccupants } from './housingPipeline';
import { displayYear } from './dayCycleClock';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { getEcosystemHealth } from './dailyEcology';
import { buildEntityByType, type SimulationFocus } from './simFocus';
import {
  cacheEntityByType,
  getCachedEntityByType,
  invalidateCachedEntityByType,
} from './entityTypeCache';
import {
  getSeason,
  getReproductionMultiplier,
} from './simHelpers';
import { countWorkingAndIdleSettlers } from './workforce';
import { isPlayerHuman } from './playerHuman';
import type { TickContext } from './simulation/simulationTypes';
import { buildHuntTargetByPreyIndex } from './simulation/simulationEntities';
import { tickLayerRealtime } from './tickLayerRealtime';
import { tickLayerSystems, LAYER_SYSTEMS_INTERVAL } from './tickLayerSystems';
import { tickLayerAssign, LAYER_ASSIGN_INTERVAL, LAYER_ASSIGN_PHASE_TICK } from './tickLayerAssign';
import { tickLayerDaily } from './tickLayerDaily';
import { isSettlementDestroyed, tickRaidRecovery } from './raidAftermath';
import { tickPendingRaidEvents, tickPendingOutgoingRaidEvents } from './frontierCombat';
import { isStartOfClockHour } from './dayCycleClock';
import { tickPrisonPresence } from './prisonGuardDuty';
import { tickWinterHeating } from './dailyBuildingEconomy';
import {
  USE_SPATIAL_GRID,
  buildRoadAvoidanceIndex,
  computeRoadLayoutStamp,
  assertSpatialGridInvariants,
} from './spatialGrid';
import {
  computePopulationCounts,
  wildlifeCountsFromPopulation,
} from './entityCounts';
import {
  flushSpatialQueryTickToSession,
  isSpatialQueryMetricsEnabled,
  resetSpatialQueryTickMetrics,
  setSpatialQueryGridMode,
} from './spatialQueryMetrics';
import {
  flushPathfinderTickToSession,
  isPathfindingMetricsEnabled,
  resetPathfinderTickMetrics,
} from './pathfindingMetrics';
import { assertSimInvariants } from './simulation/simInvariants';
import { collectSimulationInvariantErrors } from './simulation/simulationInvariants';
import { profileEnd, profileSimulationTick, profileStart } from './performanceProfiler';
import { stampHousingRelocationClock } from './housingRelocationMonitor';

export function gameTick(state: WorldState, focus?: SimulationFocus): WorldState {
  if (state.paused || isSettlementDestroyed(state)) return state;
  const { width, height } = state;

  if (isSpatialQueryMetricsEnabled()) {
    resetSpatialQueryTickMetrics();
    setSpatialQueryGridMode(USE_SPATIAL_GRID ? 'grid' : 'naive');
  }
  if (isPathfindingMetricsEnabled()) resetPathfinderTickMetrics();

  // --- Calendar ---
  state.tick++;
  profileSimulationTick(state.tick, state.humanPopulation, state.weather);
  const tickProfileStart = profileStart();
  state.dayInYear = getCalendarDay(state.tick);
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  const newYear = yearRollover ? state.year + 1 : state.year;
  stampHousingRelocationClock(state.tick, newYear, state.dayInYear);

  if (yearRollover) {
    const yearlyStat = recordYearlyStats(state, state.year);
    state.yearlyStats.push(yearlyStat);
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    bumpHistoryRevision(state, 'yearlyStats');
    state.lifetimeStats = updateLifetimeStats(state, state.lifetimeStats);
    // One line a year for the colony's social state, not a line per bond.
    if (yearlyStat.social) {
      const { closeBonds, withFriend, isolated, bondsFormed } = yearlyStat.social;
      const growth = bondsFormed == null ? '' : `, ${bondsFormed} new`;
      logEvent(
        state,
        'event',
        `Year ${displayYear(yearlyStat.year)} in review — ${closeBonds} close friendships${growth}; ${withFriend} settlers have a friend, ${isolated} have none`,
      );
    }
    state.eventsThisYear = [];
    state.deathsThisYear = { humans: 0, animals: 0 };
    if (newYear > 0) {
      state.ecoHealthYearsAbove80 = getEcosystemHealth(state) >= 80
        ? state.ecoHealthYearsAbove80 + 1
        : 0;
    }
    state.year = newYear;
  }

  const season = getSeason(state.dayInYear);
  const grassMult = getGrassGrowthMultiplier(season, state.weather);
  const reproMult = getReproductionMultiplier(season);
  const winterPenalty = getWinterEnergyPenalty(season);
  state.season = season;

  ensureEntityByIdMap(state);

  const newEntities: Entity[] = [];
  if (isStartOfClockHour(state.tick)) {
    const beforeRaids = state.pendingRaidEvents.length || state.pendingOutgoingRaidEvents.length
      ? state.entities.filter((person) => person.alive && isPlayerHuman(person)) : [];
    tickPendingOutgoingRaidEvents(state);
    tickPendingRaidEvents(state, state.entities.filter((person) => person.alive));
    tickRaidRecovery(state);
    const fallen = beforeRaids.filter((person) => !person.alive);
    if (fallen.length > 0) {
      const tally = state.deathsThisYear ??= { humans: 0, animals: 0 };
      tally.humans += fallen.length;
      for (const person of fallen) recordHumanDeath(state, person);
    }
    if (isSettlementDestroyed(state)) return state;
  }
  const aliveEntities = state.entities.filter((e) => e.alive && !e.departedAlive);

  for (const entity of aliveEntities) {
    if (entity.moonHowlerCursed && entity.type === EntityType.Human) {
      syncHumanAgeFromCalendar(entity, state);
    }
  }

  const byType = getCachedEntityByType(state, aliveEntities);
  const hourOfDay = getHourOfDay(state.tick);
  const updatedBuildings = state.buildings;
  const playerHumans = byType[EntityType.Human].filter(isPlayerHuman);
  const humanCount = playerHumans.length;
  const isWinter = season === Season.Winter;

  // Winter heating once per day (stores villageCanHeat for the full day)
  const canHeat = tickWinterHeating(state, humanCount, isWinter);

  // Single building pass: id map + roads + civic flags
  const buildingById = new Map<number, Building>();
  const roadBuildings: Building[] = [];
  let hasWell = false;
  let hasHospital = false;
  for (const b of updatedBuildings) {
    buildingById.set(b.id, b);
    if (!b.completed) continue;
    // Roads + bridges grant the walk-speed bonus
    if (b.type === BuildingType.Road || b.type === BuildingType.Bridge) roadBuildings.push(b);
    else if (b.type === BuildingType.Well && b.faction !== 'rival') hasWell = true;
    else if (b.type === BuildingType.Hospital && b.faction !== 'rival') hasHospital = true;
  }

  // Predators — reuse playerHumans (already filtered); one pass for rivals
  const predators: Entity[] = [
    ...byType[EntityType.Wolf],
    ...byType[EntityType.Fox],
    ...byType[EntityType.Werewolf],
  ];
  for (const h of playerHumans) {
    if (h.age >= HUMAN_ADULT_MIN_AGE) predators.push(h);
  }
  for (const h of byType[EntityType.Human]) {
    if (h.alive && h.faction === 'rival') predators.push(h);
  }

  const roadStamp = computeRoadLayoutStamp(roadBuildings);
  if (
    !state.roadAvoidance
    || state.roadAvoidanceStamp !== roadStamp
    || typeof state.roadAvoidance.isNearRoad !== 'function'
    || !state.roadAvoidance.matchesLayout(width, height)
  ) {
    state.roadAvoidance = buildRoadAvoidanceIndex(width, height, roadBuildings);
    state.roadAvoidanceStamp = roadStamp;
  }

  const entityById = ensureEntityByIdMap(state);
  const ctx: TickContext = {
    width,
    height,
    hourOfDay,
    season,
    grassMult,
    reproMult,
    winterPenalty,
    canHeat,
    byType,
    aliveEntities,
    newEntities,
    updatedBuildings,
    roadBuildings,
    playerHumans,
    entityById,
    buildingById,
    predators,
    grassGrid: undefined,
    mobileGrid: undefined,
    treeGrid: undefined,
    roadAvoidance: state.roadAvoidance,
    huntTargetByPreyId: buildHuntTargetByPreyIndex(byType),
    scentGrid: undefined,
    focus,
    wildlifeSpawnParent: new Map(),
    hasWell,
    hasHospital,
  };

  // --- 4 layers, FIXED order + cadence: realtime → systems → assign → daily (tests/gameTick.layerOrder.test.ts).
  // DEV-only leader-home trace; no production work. Do not add a tick layer without an authority update. ---
  const traceLeader = import.meta.env?.DEV === true && state.villageLeaderId != null;
  const leaderIdForTrace = state.villageLeaderId;
  const leaderForTrace = traceLeader
    ? state.entities.find((entity) => entity.id === leaderIdForTrace)
    : undefined;
  let lastLeaderResidence = leaderForTrace?.residenceBuildingId;
  const traceLeaderResidence = (stage: string): void => {
    if (!traceLeader || !leaderForTrace) return;
    const currentResidence = leaderForTrace.residenceBuildingId;
    if (currentResidence === lastLeaderResidence) return;
    console.warn(
      `[leaderResidence] tick=${state.tick} leader=${leaderIdForTrace} stage=${stage} residence ${String(lastLeaderResidence)} -> ${String(currentResidence)}`,
    );
    lastLeaderResidence = currentResidence;
  };

  const realtimeStart = profileStart();
  tickLayerRealtime(state, ctx);
  profileEnd('sim.realtime', realtimeStart);
  traceLeaderResidence('realtime');

  if (state.tick % LAYER_SYSTEMS_INTERVAL === 0) {
    const systemsStart = profileStart();
    tickLayerSystems(state, ctx);
    profileEnd('sim.systems', systemsStart);
    traceLeaderResidence('systems');
  }

  // Spread four daily assignment sweeps away from the midnight daily workload.
  // 3h, 9h, 15h and 21h instead of 0h, 6h, 12h and 18h.
  if (state.tick % LAYER_ASSIGN_INTERVAL === LAYER_ASSIGN_PHASE_TICK) {
    const assignStart = profileStart();
    tickLayerAssign(state, ctx);
    profileEnd('sim.assign', assignStart);
    traceLeaderResidence('assign');
  }

  // Presence is an hourly snapshot. Take it after the realtime, movement, and assignment layers so
  // a guard who reaches the post on this clock-hour tick is counted at the position the player sees.
  tickPrisonPresence(state);

  const allAlive: Entity[] = [];
  for (const e of aliveEntities) {
    if (e.alive) allAlive.push(e);
  }
  for (const e of newEntities) {
    if (e.alive) allAlive.push(e);
  }

  assertSpatialGridInvariants(ctx.grassGrid, ctx.mobileGrid, allAlive);
  const counts = computePopulationCounts(allAlive);
  // Keep denormalized wildlife counts fresh before daily ecology stage
  state.wildlifeCounts = wildlifeCountsFromPopulation(counts);
  state.humanPopulation = counts.humans;

  // Daily layer is invoked at 00:00, 06:00, 12:00 and 18:00; phases occupy 00/06/18 and 12 is empty.
  const dailyLayerRan = state.tick % (TICKS_PER_DAY / 4) === 0;
  if (dailyLayerRan) {
    const dailyStart = profileStart();
    tickLayerDaily(state, ctx, allAlive);
    profileEnd('sim.daily', dailyStart);
    traceLeaderResidence('daily');
  }

  // Daily systems append entities through ctx.newEntities after the pre-daily snapshot; retain
  // them so the set matches the population counts.
  if (newEntities.length > 0) {
    const retained = new Set(allAlive.map((entity) => entity.id));
    for (const entity of newEntities) {
      if (entity.alive && !retained.has(entity.id)) {
        retained.add(entity.id);
        allAlive.push(entity);
      }
    }
  }
  // The daily layer may kill or duplicate entities after the snapshot: filter to alive, unique ids
  // before publishing `allAlive` or counting population.
  const seenFinalIds = new Set<number>();
  let writeIndex = 0;
  let droppedInFinalPass = 0;
  for (let i = 0; i < allAlive.length; i++) {
    const entity = allAlive[i];
    if (!entity.alive || entity.departedAlive || seenFinalIds.has(entity.id)) {
      droppedInFinalPass++;
      continue;
    }
    seenFinalIds.add(entity.id);
    allAlive[writeIndex++] = entity;
  }
  allAlive.length = writeIndex;
  // Only a daily pass or a dropped entry can change the roster the pre-daily scan already counted.
  const finalCounts = !dailyLayerRan && droppedInFinalPass === 0
    ? counts
    : computePopulationCounts(allAlive);

  // --- Deaths: entries alive at tick start and not now ---
  // `aliveEntities` is the tick-start list, so each dead entry died during this tick.
  tallyTickDeaths(state, aliveEntities);

  traceLeaderResidence('post-layers');
  // --- Post ---
  state.buildings = updatedBuildings;
  state.entities = allAlive;

  // Reuse playerHumans + any newly born player settlers this tick (avoid full allAlive filter)
  let endTickHumans: Entity[] = playerHumans;
  if (newEntities.length > 0) {
    const bornPlayers = newEntities.filter((e) => e.alive && isPlayerHuman(e));
    if (bornPlayers.length > 0) endTickHumans = [...playerHumans, ...bornPlayers];
  }
  const workforceCounts = countWorkingAndIdleSettlers(endTickHumans, updatedBuildings);
  state.workingSettlers = workforceCounts.working;
  state.idleSettlers = workforceCounts.idle;

  reconcileOrphanedMarriages(allAlive);
  // Rebuild type buckets only when composition changed; reusing them keeps object identity
  // stable so the render catalog can skip its rebuild.
  const deathsThisTick = aliveEntities.length - (allAlive.length - newEntities.length);
  // Untracked spawns (immigration, world events) grow `allAlive` without `newEntities`, making
  // `deathsThisTick` negative; rebuild instead of caching a byType missing them.
  const untrackedSpawns = deathsThisTick < 0;
  const typeChanged = ctx.byType !== byType;
  if (deathsThisTick > 0 || untrackedSpawns || newEntities.length > 0 || typeChanged || dailyLayerRan) {
    invalidateCachedEntityByType(state);
    state.entityByType = buildEntityByType(allAlive);
  } else {
    cacheEntityByType(state, byType);
    state.entityByType = byType;
  }
  if (USE_SPATIAL_GRID) state.mobileGrid = ctx.mobileGrid;
  state.buildings = updatedBuildings;
  state.season = season;
  state.humanPopulation = finalCounts.humans;
  // Track the true peak here: `yearlyStats` only samples year-end population. A world whose
  // `lifetimeStats` predates the field has no record yet, which reads as the owner's empty count.
  const peakCount = state.lifetimeStats.largestPopulation?.count ?? 0;
  if (finalCounts.humans > peakCount) {
    state.lifetimeStats.largestPopulation = { count: finalCounts.humans, year: state.year };
  }
  state.wildlifeCounts = wildlifeCountsFromPopulation(finalCounts);
  markCalendarDayProcessed(state);

  // Keep the residence mirror truthful: `state.entities` is complete here, so this is the one place
  // that can reconcile `residenceBuildingId ↔ occupants`; who lives where stays with assign.
  const residencesStart = profileStart();
  syncResidenceOccupants(allAlive, updatedBuildings);
  profileEnd('sim.residences', residencesStart);
  if (isSpatialQueryMetricsEnabled()) flushSpatialQueryTickToSession();
  if (isPathfindingMetricsEnabled()) flushPathfinderTickToSession();

  // Dev-only invariant pulse on each daily-layer pass — never repairs state. `import.meta.env`
  // needs the guard: it does not exist under the headless tsx runner.
  const isDevBuild = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
  if (isDevBuild && dailyLayerRan) {
    const sanity = assertSimInvariants(state);
    if (sanity.length > 0) {
      console.warn('[simInvariants]', sanity.slice(0, 8));
    }
    const ownership = collectSimulationInvariantErrors(state);
    if (ownership.length > 0) {
      console.warn('[simulationInvariants]', ownership.slice(0, 8).map((error) => typeof error === 'string' ? error : JSON.stringify(error)).join('\n'));
    }
  }

  profileEnd('sim.totalTick', tickProfileStart);
  return state;
}

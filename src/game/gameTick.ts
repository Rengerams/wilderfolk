/**
 * gameTick — thin orchestrator: calendar + TickContext + 4 layers + post cleanup.
 *
 * Exactly four layer files own sim work:
 *   tickLayerRealtime · tickLayerSystems · tickLayerAssign · tickLayerDaily
 * Domain helpers (tickHumans, etc.) live in feature modules, not extra tick* files.
 * Chat/courtship = Realtime; house/job fill = Assign (not “social”).
 */
import type {
  WorldState, Entity, Building,
} from './gameTypes';
import {
  BuildingType,
  Season,
  EntityType,
} from './gameTypes';
import { recordYearlyStats, updateLifetimeStats } from './stats';
import { logEvent } from './eventLog';
import { ensureEntityByIdMap } from './entityIndex';
import { getGrassGrowthMultiplier, getWinterEnergyPenalty } from './grassEcology';
import {
  getCalendarDay,
  getHourOfDay,
  TICKS_PER_DAY,
  markCalendarDayProcessed,
  syncHumanAgeFromCalendar,
  reconcileOrphanedMarriages,
  syncResidenceOccupants,
} from './dayCycle';
import { displayYear } from './dayCycleClock';
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

  if (yearRollover) {
    const yearlyStat = recordYearlyStats(state, state.year);
    state.yearlyStats.push(yearlyStat);
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    state.lifetimeStats = updateLifetimeStats(state, state.lifetimeStats);
    // One line a year for the colony's social state, instead of a line per bond. That
    // pattern made 60 % of a real exported 2 000-event chronicle friendship noise, and
    // buried the leadership election inside it.
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
    const fallen = beforeRaids.filter((person) => !person.alive).length;
    if (fallen > 0) {
      const tally = state.deathsThisYear ??= { humans: 0, animals: 0 };
      tally.humans += fallen;
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
    if (!h.isJuvenile) predators.push(h);
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

  // --- 4 layers (FIXED order + cadence — see tests/gameTick.layerOrder.test.ts) ---
  // realtime every tick → systems every LAYER_SYSTEMS_INTERVAL → assign every
  // LAYER_ASSIGN_INTERVAL → daily once per TICKS_PER_DAY. Do not add a new
  // tick layer here; new layers require an authority-document update (§4).
  // DEV diagnostic: identify the exact layer that changes the elected leader's home.
  // No repairs or extra work in production builds.
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

  // Daily subsystems execute at 00:00, 06:00, 12:00, and 18:00.
  // Each system remains once per day; no longer concentrate all work at midnight.
  if (state.tick % (TICKS_PER_DAY / 4) === 0) {
    const dailyStart = profileStart();
    tickLayerDaily(state, ctx, allAlive);
    profileEnd('sim.daily', dailyStart);
    traceLeaderResidence('daily');
  }

  // Daily systems may append authoritative entities through ctx.newEntities
  // after the pre-daily population snapshot was built. Retain those entities
  // and refresh denormalized counts before the invariant boundary.
  // Built once and kept in step with every push, so membership matches the
  // per-entity scan while the tick's daily deltas are already in `allAlive`.
  if (newEntities.length > 0) {
    const retained = new Set(allAlive.map((entity) => entity.id));
    for (const entity of newEntities) {
      if (entity.alive && !retained.has(entity.id)) {
        retained.add(entity.id);
        allAlive.push(entity);
      }
    }
  }
  // The daily layer may kill wildlife or settlers after the pre-daily snapshot.
  // Remove them before publishing the authoritative collection or counting
  // population; an alive-only snapshot made earlier in the tick is insufficient.
  // Also prevent any duplicate entity ids from a daily spawn from surviving.
  const seenFinalIds = new Set<number>();
  let writeIndex = 0;
  for (let i = 0; i < allAlive.length; i++) {
    const entity = allAlive[i];
    if (!entity.alive || entity.departedAlive || seenFinalIds.has(entity.id)) continue;
    seenFinalIds.add(entity.id);
    allAlive[writeIndex++] = entity;
  }
  allAlive.length = writeIndex;
  const finalCounts = computePopulationCounts(allAlive);

  // --- Deaths (exact: alive at the start of the tick, not alive now) ---
  // `aliveEntities` is the list this tick started with, so every entry that is no longer alive
  // was killed during the tick — wildlife, old age, disease, famine, exhaustion, combat or a
  // command. The yearly statistic used to read `!e.alive` out of `state.entities`, which by then
  // contains only the living, so "humans died" was permanently zero in the panel.
  let deadHumans = 0;
  let deadAnimals = 0;
  for (const entity of aliveEntities) {
    if (entity.alive) continue;
    if (entity.type === EntityType.Human) {
      // A departing visitor group or a finished caravan carrier clears `alive` without dying.
      if (isPlayerHuman(entity)) deadHumans++;
    } else if (entity.type !== EntityType.Tree && entity.type !== EntityType.Grass) deadAnimals++;
  }
  if (deadHumans > 0 || deadAnimals > 0) {
    const tally = state.deathsThisYear ?? (state.deathsThisYear = { humans: 0, animals: 0 });
    tally.humans += deadHumans;
    tally.animals += deadAnimals;
  }

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
  // Deaths/births during the tick — rebuild type buckets only when the
  // composition actually changed; otherwise reuse this tick's buckets so the
  // object identity stays stable (lets the render catalog skip its rebuild).
  const deathsThisTick = aliveEntities.length - (allAlive.length - newEntities.length);
  const dailyLayerRan = state.tick % (TICKS_PER_DAY / 4) === 0;
  // BUG-1/BUG-6: untracked spawns (immigration, world events) grow allAlive without
  // touching newEntities — deathsThisTick goes negative; rebuild instead of caching
  // a byType that omits the newcomers.
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

  // Keep the residence mirror truthful at the tick boundary. Several owners move a settler in and
  // out of a residence mid-tick (births, orphan adoption, divorce, the leader's household, a
  // cursed settler's form change), and each of them can only reconcile the lists it knows about;
  // `state.entities` is complete here — for the first time this tick it contains a newborn created
  // after the assignment layer ran — so this is the one place that can guarantee
  // `residenceBuildingId ↔ occupants` for SIMULATION_AUTHORITY §5. The decision of *who* lives
  // where stays with the assignment layer; this only makes the mirror agree with it.
  // No pre-filter: `syncResidenceOccupants` skips non-occupants itself
  // (`residencyReconciliation.ts` — `if (!isResidenceOccupantEntity(human)) continue;`), and
  // `isResidenceOccupantEntity` already tests `entity.alive`, so
  // `allAlive.filter((e) => e.alive && isResidenceOccupantEntity(e))` discarded every element the
  // callee discards again and produced identical buckets. Measured at 1.79 % of tick time
 // for a
  // ~1 800-element copy per tick.
  const residencesStart = profileStart();
  syncResidenceOccupants(allAlive, updatedBuildings);
  profileEnd('sim.residences', residencesStart);
  if (isSpatialQueryMetricsEnabled()) flushSpatialQueryTickToSession();
  if (isPathfindingMetricsEnabled()) flushPathfinderTickToSession();

  // Dev-only invariant pulse once per colony day — never repairs state.
  // Guarded like every other env read in the codebase: `import.meta.env` does not
  // exist under the headless tsx runner (`npm run test:full-year`), where an
  // unguarded read throws on the very first tick and kills the long-run gate.
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

/**
 * gameTick — thin orchestrator: calendar + TickContext + 4 layers + post cleanup.
 *
 * Exactly four layer files own sim work:
 *   tickLayerRealtime · tickLayerSystems · tickLayerAssign · tickLayerDaily
 * Domain helpers (tickHumans, etc.) live in feature modules, not extra tick* files.
 * Chat/courtship = Realtime; house/job fill = Assign (not “social”).
 */

import type { WorldState, Entity, Building } from './gameTypes';
import { BuildingType, Season, EntityType } from './gameTypes';
import { recordYearlyStats, updateLifetimeStats } from './stats';
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
import { buildEntityByType, type SimulationFocus } from './simFocus';
import {
  cacheEntityByType,
  getCachedEntityByType,
  invalidateCachedEntityByType,
} from './entityTypeCache';
import { getSeason, getReproductionMultiplier } from './simHelpers';
import { countWorkingAndIdleSettlers } from './workforce';
import { isPlayerHuman } from './playerHuman';
import type { TickContext } from './simulation/simulationTypes';
import { buildHuntTargetByPreyIndex } from './simulation/simulationEntities';
import { tickLayerRealtime } from './tickLayerRealtime';
import { tickLayerSystems, LAYER_SYSTEMS_INTERVAL } from './tickLayerSystems';
import { tickLayerAssign, LAYER_ASSIGN_INTERVAL } from './tickLayerAssign';
import { tickLayerDaily } from './tickLayerDaily';
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

/**
 * Advances calendar date, handles yearly roll-overs, and computes season modifiers.
 */
function advanceCalendar(state: WorldState): {
  season: Season;
  grassMult: number;
  reproMult: number;
  winterPenalty: number;
} {
  state.tick++;
  state.dayInYear = getCalendarDay(state.tick);
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  const newYear = yearRollover ? state.year + 1 : state.year;

  if (yearRollover) {
    const yearlyStat = recordYearlyStats(state, state.year);
    state.yearlyStats.push(yearlyStat);
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    state.lifetimeStats = updateLifetimeStats(state, state.lifetimeStats);
    state.eventsThisYear = [];
    if (newYear > 0) {
      state.ecoHealthYearsAbove80 = state.ecosystemHealth >= 80
        ? state.ecoHealthYearsAbove80 + 1
        : 0;
    }
    state.year = newYear;
  }

  const season = getSeason(state.dayInYear);
  state.season = season;

  return {
    season,
    grassMult: getGrassGrowthMultiplier(season, state.weather),
    reproMult: getReproductionMultiplier(season),
    winterPenalty: getWinterEnergyPenalty(season),
  };
}

/**
 * Single-pass scan for buildings: id map, roads/bridges, and civic infrastructure flags.
 */
function indexBuildings(buildings: Building[]): {
  buildingById: Map<number, Building>;
  roadBuildings: Building[];
  hasWell: boolean;
  hasHospital: boolean;
} {
  const buildingById = new Map<number, Building>();
  const roadBuildings: Building[] = [];
  let hasWell = false;
  let hasHospital = false;

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    buildingById.set(b.id, b);
    if (!b.completed) continue;

    if (b.type === BuildingType.Road || b.type === BuildingType.Bridge) {
      roadBuildings.push(b);
    } else if (b.faction !== 'rival') {
      if (b.type === BuildingType.Well) hasWell = true;
      else if (b.type === BuildingType.Hospital) hasHospital = true;
    }
  }

  return { buildingById, roadBuildings, hasWell, hasHospital };
}

/**
 * Collects active predators (wildlife, adult player humans, and rival humans).
 */
function collectPredators(
  byType: Record<EntityType, Entity[]>,
  playerHumans: Entity[],
): Entity[] {
  const predators: Entity[] = [
    ...(byType[EntityType.Wolf] ?? []),
    ...(byType[EntityType.Fox] ?? []),
    ...(byType[EntityType.Werewolf] ?? []),
  ];

  for (let i = 0; i < playerHumans.length; i++) {
    if (!playerHumans[i].isJuvenile) predators.push(playerHumans[i]);
  }

  const humans = byType[EntityType.Human] ?? [];
  for (let i = 0; i < humans.length; i++) {
    const h = humans[i];
    if (h.alive && h.faction === 'rival') predators.push(h);
  }

  return predators;
}

export function gameTick(state: WorldState, focus?: SimulationFocus): WorldState {
  if (state.paused) return state;
  const { width, height } = state;

  if (isSpatialQueryMetricsEnabled()) {
    resetSpatialQueryTickMetrics();
    setSpatialQueryGridMode(USE_SPATIAL_GRID ? 'grid' : 'naive');
  }

  // --- 1. Calendar & Environmental Modifiers ---
  const { season, grassMult, reproMult, winterPenalty } = advanceCalendar(state);

  const entityById = ensureEntityByIdMap(state);
  const newEntities: Entity[] = [];
  const aliveEntities = state.entities.filter((e) => e.alive);

  for (let i = 0; i < aliveEntities.length; i++) {
    const entity = aliveEntities[i];
    if (entity.moonHowlerCursed && entity.type === EntityType.Human) {
      syncHumanAgeFromCalendar(entity, state);
    }
  }

  const byType = getCachedEntityByType(state, aliveEntities);
  const hourOfDay = getHourOfDay(state.tick);
  const updatedBuildings = state.buildings;
  const playerHumans = (byType[EntityType.Human] ?? []).filter(isPlayerHuman);
  const humanCount = playerHumans.length;
  const isWinter = season === Season.Winter;

  // Winter heating once per day (stores villageCanHeat for the full day)
  const canHeat = tickWinterHeating(state, humanCount, isWinter);

  // --- 2. Building & Spatial Indexes ---
  const { buildingById, roadBuildings, hasWell, hasHospital } = indexBuildings(updatedBuildings);
  const predators = collectPredators(byType, playerHumans);

  // Guard for Bug #20: Full defensive check against structuredClone method stripping
  const roadStamp = computeRoadLayoutStamp(roadBuildings);
  if (
    !state.roadAvoidance
    || state.roadAvoidanceStamp !== roadStamp
    || typeof state.roadAvoidance.isNearRoad !== 'function'
    || typeof state.roadAvoidance.matchesLayout !== 'function'
    || !state.roadAvoidance.matchesLayout(width, height)
  ) {
    state.roadAvoidance = buildRoadAvoidanceIndex(width, height, roadBuildings);
    state.roadAvoidanceStamp = roadStamp;
  }

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

  // --- 3. 4 Sim Layers (Realtime -> Systems -> Assign -> Daily) ---
  tickLayerRealtime(state, ctx);

  if (state.tick % LAYER_SYSTEMS_INTERVAL === 0) {
    tickLayerSystems(state, ctx);
  }

  if (state.tick % LAYER_ASSIGN_INTERVAL === 0) {
    tickLayerAssign(state, ctx);
  }

  // Pre-daily entity consolidation using a Set for O(1) deduplication
  const allAlive: Entity[] = [];
  const aliveIdSet = new Set<number>();

  for (let i = 0; i < aliveEntities.length; i++) {
    const e = aliveEntities[i];
    if (e.alive) {
      allAlive.push(e);
      aliveIdSet.add(e.id);
    }
  }
  for (let i = 0; i < newEntities.length; i++) {
    const e = newEntities[i];
    if (e.alive && !aliveIdSet.has(e.id)) {
      allAlive.push(e);
      aliveIdSet.add(e.id);
    }
  }

  assertSpatialGridInvariants(ctx.grassGrid, ctx.mobileGrid, allAlive);
  const counts = computePopulationCounts(allAlive);

  // Keep denormalized wildlife counts fresh before daily ecology stage
  state.wildlifeCounts = wildlifeCountsFromPopulation(counts);
  state.humanPopulation = counts.humans;

  if (state.tick % TICKS_PER_DAY === 0) {
    tickLayerDaily(state, ctx, allAlive, counts);
  }

  // Retain authoritative entities appended to ctx.newEntities during daily systems
  for (let i = 0; i < newEntities.length; i++) {
    const entity = newEntities[i];
    if (entity.alive && !aliveIdSet.has(entity.id)) {
      allAlive.push(entity);
      aliveIdSet.add(entity.id);
    }
  }
  const finalCounts = computePopulationCounts(allAlive);

  // --- 4. Post-Tick Commit & State Invariants ---
  state.buildings = updatedBuildings;
  state.entities = allAlive;

  // Track workforce counts for active player settlers (typed as Entity[] to satisfy TS2322)
  let endTickHumans: Entity[] = playerHumans;
  if (newEntities.length > 0) {
    const bornPlayers = newEntities.filter((e) => e.alive && isPlayerHuman(e));
    if (bornPlayers.length > 0) {
      endTickHumans = [...playerHumans, ...bornPlayers];
    }
  }
  const workforceCounts = countWorkingAndIdleSettlers(endTickHumans, updatedBuildings);
  state.workingSettlers = workforceCounts.working;
  state.idleSettlers = workforceCounts.idle;

  reconcileOrphanedMarriages(allAlive);

  // Invalidate byType cache only when entity composition actually changes
  const deathsThisTick = aliveEntities.length - (allAlive.length - newEntities.length);
  const dailyLayerRan = state.tick % TICKS_PER_DAY === 0;
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

  state.season = season;
  state.humanPopulation = finalCounts.humans;
  state.wildlifeCounts = wildlifeCountsFromPopulation(finalCounts);

  markCalendarDayProcessed(state);
  if (isSpatialQueryMetricsEnabled()) flushSpatialQueryTickToSession();

  return state;
}
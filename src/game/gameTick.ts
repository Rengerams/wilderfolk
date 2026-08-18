/**
 * gameTick — thin orchestrator: calendar + TickContext + 4 layers + post cleanup.
 *
 * Exactly four layer files own sim work:
 *   tickLayerRealtime · tickLayerSystems · tickLayerAssign · tickLayerDaily
 * Domain helpers (tickHumans, etc.) live in feature modules, not extra tick* files.
 * Chat/courtship = Realtime; house/job fill = Assign (not “social”).
 */
import type {
  WorldState, Entity, Building, EntityByType,
} from './gameTypes';
import {
  BuildingType,
  Season,
  EntityType,
} from './gameTypes';
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
import {
  buildEntityByType,
  type SimulationFocus,
} from './simFocus';
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
import { tickLayerAssign, LAYER_ASSIGN_INTERVAL } from './tickLayerAssign';
import { tickLayerDaily, tickWinterHeating } from './tickLayerDaily';
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
 * Per-world stable entity buckets across no-change ticks (P1, BUG-2):
 * most ticks neither birth, nor kill, nor change types — on those, the
 * entity-by-type index built for the layers is also the final index, so we
 * reuse it (same object identity) instead of rebuilding it at the end of the
 * tick. The render catalog keys off that identity to skip its own rebuild.
 * Keyed per WorldState so multiple worlds/scripts never share buckets.
 */
const stableByTypeByWorld = new WeakMap<WorldState, EntityByType>();

export function gameTick(state: WorldState, focus?: SimulationFocus): WorldState {
  if (state.paused) return state;
  const { width, height } = state;

  if (isSpatialQueryMetricsEnabled()) {
    resetSpatialQueryTickMetrics();
    setSpatialQueryGridMode(USE_SPATIAL_GRID ? 'grid' : 'naive');
  }

  // --- Calendar ---
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
  const grassMult = getGrassGrowthMultiplier(season, state.weather);
  const reproMult = getReproductionMultiplier(season);
  const winterPenalty = getWinterEnergyPenalty(season);
  state.season = season;

  ensureEntityByIdMap(state);

  const newEntities: Entity[] = [];
  const aliveEntities = state.entities.filter((e) => e.alive);

  for (const entity of aliveEntities) {
    if (entity.moonHowlerCursed && entity.type === EntityType.Human) {
      syncHumanAgeFromCalendar(entity, state);
    }
  }

  const byType = stableByTypeByWorld.get(state) ?? buildEntityByType(aliveEntities);
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

  // --- 4 layers ---
  tickLayerRealtime(state, ctx);

  if (state.tick % LAYER_SYSTEMS_INTERVAL === 0) {
    tickLayerSystems(state, ctx);
  }

  if (state.tick % LAYER_ASSIGN_INTERVAL === 0) {
    tickLayerAssign(state, ctx);
  }

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

  if (state.tick % TICKS_PER_DAY === 0) {
    tickLayerDaily(state, ctx, allAlive, counts);
  }

  // --- Post ---
  state.buildings = updatedBuildings;
  state.entities = allAlive;

  // Reuse playerHumans + any newly born player settlers this tick (avoid full allAlive filter)
  let endTickHumans = playerHumans;
  if (newEntities.length > 0) {
    const bornPlayers = newEntities.filter((e) => e.alive && isPlayerHuman(e));
    if (bornPlayers.length > 0) endTickHumans = playerHumans.concat(bornPlayers);
  }
  const workforceCounts = countWorkingAndIdleSettlers(endTickHumans, updatedBuildings);
  state.workingSettlers = workforceCounts.working;
  state.idleSettlers = workforceCounts.idle;

  reconcileOrphanedMarriages(allAlive);
  // Deaths/births during the tick — rebuild type buckets only when the
  // composition actually changed; otherwise reuse this tick's buckets so the
  // object identity stays stable (lets the render catalog skip its rebuild).
  const deathsThisTick = aliveEntities.length - (allAlive.length - newEntities.length);
  // BUG-1/BUG-6: untracked spawns (immigration, world events) grow allAlive without
  // touching newEntities — deathsThisTick goes negative; rebuild instead of caching
  // a byType that omits the newcomers.
  const untrackedSpawns = deathsThisTick < 0;
  const typeChanged = ctx.byType !== byType;
  if (deathsThisTick > 0 || untrackedSpawns || newEntities.length > 0 || typeChanged) {
    state.entityByType = buildEntityByType(allAlive);
    stableByTypeByWorld.delete(state);
  } else {
    if (!stableByTypeByWorld.has(state)) stableByTypeByWorld.set(state, byType);
    state.entityByType = stableByTypeByWorld.get(state)!;
  }
  if (USE_SPATIAL_GRID) state.mobileGrid = ctx.mobileGrid;
  state.buildings = updatedBuildings;
  state.season = season;
  state.humanPopulation = counts.humans;
  state.wildlifeCounts = wildlifeCountsFromPopulation(counts);
  markCalendarDayProcessed(state);
  if (isSpatialQueryMetricsEnabled()) flushSpatialQueryTickToSession();

  return state;
}

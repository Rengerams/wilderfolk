import type { Building, Entity, WorldMap } from './gameTypes';
import { PATH_CELL } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { findRouteCostOutcome, getNavigationQuote, getCurrentPathGrid, getReadOnlyPathGrid, isWalkableRoad, type PathGrid } from './pathfinding';
import { ROAD_SPEED_MULT } from './simulation/movementSteering';
import { buildingAccessPoints } from './buildingAccess';

/** Commute reach, lead hours and walk pacing, shared by the movement loop and work assignment. */
export const COMMUTE_CONFIG = {
  LONG_RANGE_DIST: 150,
  ARRIVAL_DIST: 8,
  /** Final-approach easing: the last stretch closes at `dist * APPROACH_RATE_PER_TICK` per tick. */
  APPROACH_RATE_PER_TICK: 0.1,
  APPROACH_MIN_SPEED_RATIO: 0.5,
  /** Per-tick distance on the pathed branch, as a fraction of commute speed. */
  PATH_STEER_SPEED_RATIO: 0.88,
} as const;

/** The longest commute lead the scheduler hands out, in hours (see `commuteLeadHoursFor`). */
export const MAX_COMMUTE_LEAD_HOURS = 24;

/** Urgent commutes may walk faster, but never exceed 3.5 times the settler's normal pace. */
export const WORK_COMMUTE_RUSH = 3.5;

/** Owner rule: a settler who cannot reach a post inside two hours is not a candidate for it. */
export const MAX_ASSIGNABLE_COMMUTE_HOURS = 2;

export type CommuteVerdict =
  | { readonly status: 'priced'; readonly travelHours: number;
      readonly leadHours: number; readonly costTiles: number }
  | { readonly status: 'unreachable' }
  | { readonly status: 'pending'; readonly reason: 'search-budget' | 'node-budget' | 'complexity-cap' | 'no-grid' };

/** Price a real walkable-point leg without accepting an unresolved route as a commute. */
export function quoteCommute(
  origin: Readonly<{ x: number; y: number }>,
  destination: Readonly<{ x: number; y: number }>,
  walkSpeed: number,
  grid: PathGrid | null,
): CommuteVerdict {
  if (![origin.x, origin.y, destination.x, destination.y].every(Number.isFinite)) {
    return { status: 'unreachable' };
  }
  const start = { x: Math.floor(origin.x / PATH_CELL), y: Math.floor(origin.y / PATH_CELL) };
  const goal = { x: Math.floor(destination.x / PATH_CELL), y: Math.floor(destination.y / PATH_CELL) };
  const route = getNavigationQuote(grid, start, goal, { maxNodes: MAX_COMMUTE_ROUTE_SEARCH_NODES });
  if (route.status !== 'priced') return route;
  const distance = start.x === goal.x && start.y === goal.y
    ? Math.hypot(destination.x - origin.x, destination.y - origin.y)
    : route.costTiles * PATH_CELL
      + Math.hypot((start.x + 0.5) * PATH_CELL - origin.x,
        (start.y + 0.5) * PATH_CELL - origin.y)
      + Math.hypot((goal.x + 0.5) * PATH_CELL - destination.x,
        (goal.y + 0.5) * PATH_CELL - destination.y);
  const speed = commuteWalkSpeed(walkSpeed, WORK_COMMUTE_RUSH)
    * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO;
  return { status: 'priced',
    travelHours: distance / speed / TICKS_PER_HOUR,
    leadHours: commuteLeadHoursFor(distance, walkSpeed),
    costTiles: distance / PATH_CELL };
}

/** Route searches one housing sweep may run before legs fall back to the straight line. */
export const MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS = 256;

/** Node cap per search: past it the leg keeps the straight-line estimate. */
const MAX_COMMUTE_ROUTE_SEARCH_NODES = 4000;
/** A single advanced search per pass prevents large colonies from multiplying expensive A* retries. */
const ADVANCED_ROUTE_SEARCHES_PER_PASS = 1;
/** Absolute terminal complexity bound for one commute; never spin indefinitely on one route. */
const MAX_PROGRESSIVE_COMMUTE_ROUTE_NODES = 131072;

/** Route hours cached per grid generation; the cap bounds memory on a long-lived map. */
const COMMUTE_ROUTE_CACHE_LIMIT = 4096;

/** Applies the bounded urgency multiplier shared by movement and commute estimates. */
export function commuteWalkSpeed(walkSpeed: number, rush = 1): number {
  const speed = Number.isFinite(walkSpeed) && walkSpeed > 0 ? walkSpeed : 1;
  const multiplier = Number.isFinite(rush) && rush > 0
    ? Math.min(WORK_COMMUTE_RUSH, Math.max(1, rush))
    : 1;
  return speed * multiplier;
}

/** Hours before a shift a settler must set off, floored at one and capped by `MAX_COMMUTE_LEAD_HOURS`. */
export function commuteLeadHoursFor(
  distance: number,
  walkSpeed: number,
  rush: number = WORK_COMMUTE_RUSH,
): number {
  if (!Number.isFinite(distance) || distance <= COMMUTE_CONFIG.ARRIVAL_DIST) return 1;
  const perTick = commuteWalkSpeed(walkSpeed, rush)
    * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO;
  if (!Number.isFinite(perTick) || perTick <= 0) return 1;
  const hours = distance / perTick / TICKS_PER_HOUR;
  if (!Number.isFinite(hours)) return 1;
  return Math.min(MAX_COMMUTE_LEAD_HOURS, Math.max(1, hours));
}

/** Time-weighted straight-line distance: each paved fraction is charged only once. */
function straightRouteCost(
  fromX: number, fromY: number, toX: number, toY: number,
  buildings: readonly Building[],
): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return 0;
  const intervals: Array<[number, number]> = [];
  for (const road of buildings) {
    if (!isWalkableRoad(road)) continue;
    let lower = 0;
    let upper = 1;
    const axes = [
      [fromX, dx, road.x - road.width / 2, road.x + road.width / 2],
      [fromY, dy, road.y - road.height / 2, road.y + road.height / 2],
    ];
    for (const [start, delta, min, max] of axes) {
      if (delta === 0) {
        if (start < min || start >= max) { upper = -1; break; }
      } else {
        const a = (min - start) / delta;
        const b = (max - start) / delta;
        lower = Math.max(lower, Math.min(a, b));
        upper = Math.min(upper, Math.max(a, b));
      }
    }
    if (upper > lower) intervals.push([lower, upper]);
  }
  if (intervals.length === 0) return distance;
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let start = intervals[0][0];
  let end = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (next[0] <= end) end = Math.max(end, next[1]);
    else {
      covered += end - start;
      start = next[0];
      end = next[1];
    }
  }
  covered += end - start;
  return distance * (1 - covered * (1 - 1 / ROAD_SPEED_MULT));
}

/** Searches left in the housing sweep's budget; a cached leg costs nothing. */
let routeSearchesLeft = MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS;
let advancedRouteSearchesLeft = ADVANCED_ROUTE_SEARCHES_PER_PASS;
/** Unpriced routes due to this pass's search/node budget are still pending. */
let commuteRouteChecksDeferred = false;
/** Each unresolved leg is attempted at most once per assignment pulse. */
let attemptedRoutesThisPass = new WeakMap<PathGrid, Set<string>>();
const routeCostCache = new WeakMap<PathGrid, Map<string, number>>();
/** Next A* node limit per unresolved leg; scoped to its grid generation and bounded in size. */
const pendingNodeBudgets = new WeakMap<PathGrid, Map<string, number>>();
/** Terminal budget exhaustion stays unknown, not a proven disconnected route. */
const terminalRouteBudgets = new WeakMap<PathGrid, Set<string>>();

/** Opens a housing sweep's route-search budget. */
export function beginCommuteRoutePass(): void {
  routeSearchesLeft = MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS;
  advancedRouteSearchesLeft = ADVANCED_ROUTE_SEARCHES_PER_PASS;
  commuteRouteChecksDeferred = false;
  attemptedRoutesThisPass = new WeakMap<PathGrid, Set<string>>();
}

/** Report whether this pass left any candidate unpriced (not a proven blocked route). */
export function wereCommuteRouteChecksDeferred(): boolean {
  return commuteRouteChecksDeferred;
}

/** Weighted tile cost over the sim grid; null means pending and Infinity means disconnected. */
function routeCommuteCost(fromWorldX: number, fromWorldY: number, toWorldX: number, toWorldY: number, gridOverride?: PathGrid): number | null {
  const grid = gridOverride ?? getCurrentPathGrid();
  if (!grid) return null;
  const fromX = Math.floor(fromWorldX / PATH_CELL);
  const fromY = Math.floor(fromWorldY / PATH_CELL);
  const toX = Math.floor(toWorldX / PATH_CELL);
  const toY = Math.floor(toWorldY / PATH_CELL);
  if (fromX === toX && fromY === toY) return 0;
  const key = `${fromX},${fromY}>${toX},${toY}`;
  let cache = routeCostCache.get(grid);
  if (!cache) {
    cache = new Map<string, number>();
    routeCostCache.set(grid, cache);
  }
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  if (gridOverride) {
    // Read-only preview never consumes the live search budget or caches timed-out routes.
    const preview = findRouteCostOutcome(grid, fromX, fromY, toX, toY, MAX_COMMUTE_ROUTE_SEARCH_NODES);
    if (preview.budgetExhausted) return null;
    const cost = preview.cost ?? Infinity;
    if (cache.size >= COMMUTE_ROUTE_CACHE_LIMIT) cache.clear();
    cache.set(key, cost);
    return cost;
  }
  // A bounded terminal timeout never becomes an authoritative no-route verdict.
  if (terminalRouteBudgets.get(grid)?.has(key)) {
    commuteRouteChecksDeferred = true;
    return null;
  }
  const attempted = attemptedRoutesThisPass.get(grid);
  if (attempted?.has(key)) {
    commuteRouteChecksDeferred = true;
    return null;
  }
  const retries = pendingNodeBudgets.get(grid);
  const nextBudget = retries?.get(key) ?? MAX_COMMUTE_ROUTE_SEARCH_NODES;
  if (routeSearchesLeft <= 0 || (nextBudget > MAX_COMMUTE_ROUTE_SEARCH_NODES && advancedRouteSearchesLeft <= 0)) {
    commuteRouteChecksDeferred = true;
    return null;
  }
  routeSearchesLeft--;
  if (nextBudget > MAX_COMMUTE_ROUTE_SEARCH_NODES) advancedRouteSearchesLeft--;
  const routes = attempted ?? new Set<string>();
  routes.add(key);
  attemptedRoutesThisPass.set(grid, routes);
  const search = findRouteCostOutcome(grid, fromX, fromY, toX, toY, nextBudget);
  if (search.cost === null) {
    if (search.budgetExhausted) {
      // Repeating the same search makes no progress: double the bound for the next pulse, and let
      // at most one expensive advanced search run per pass.
      const terminalBudget = Math.min(MAX_PROGRESSIVE_COMMUTE_ROUTE_NODES,
        Math.max(MAX_COMMUTE_ROUTE_SEARCH_NODES, grid.cols * grid.rows * 4));
      if (nextBudget < terminalBudget) {
        let pending = retries;
        if (!pending) {
          pending = new Map<string, number>();
          pendingNodeBudgets.set(grid, pending);
        }
        if (pending.size >= COMMUTE_ROUTE_CACHE_LIMIT) pending.clear();
        pending.set(key, Math.min(terminalBudget, nextBudget * 2));
        commuteRouteChecksDeferred = true;
        return null;
      }
      let terminal = terminalRouteBudgets.get(grid);
      if (!terminal) {
        terminal = new Set<string>();
        terminalRouteBudgets.set(grid, terminal);
      }
      if (terminal.size >= COMMUTE_ROUTE_CACHE_LIMIT) terminal.clear();
      terminal.add(key);
      commuteRouteChecksDeferred = true;
      return null;
    }
    retries?.delete(key);
    if (cache.size >= COMMUTE_ROUTE_CACHE_LIMIT) cache.clear();
    cache.set(key, Infinity);
    return Infinity;
  }
  retries?.delete(key);
  if (cache.size >= COMMUTE_ROUTE_CACHE_LIMIT) cache.clear();
  cache.set(key, search.cost);
  return search.cost;
}


/** Same walkable entrances and routed travel evidence for work, school, housing and bot previews. */
export function quoteBuildingCommute(
  origin: Readonly<{ x: number; y: number }> | Building,
  destination: Readonly<{ x: number; y: number }> | Building,
  walkSpeed: number,
  gridOverride?: PathGrid,
): CommuteVerdict {
  const grid = gridOverride ?? getCurrentPathGrid();
  if (!grid) return { status: 'pending', reason: 'no-grid' };
  const fromPoints = 'type' in origin && 'width' in origin && 'height' in origin
    ? buildingAccessPoints(origin as Building, grid) : [origin];
  const toPoints = 'type' in destination && 'width' in destination && 'height' in destination
    ? buildingAccessPoints(destination as Building, grid) : [destination];
  if (fromPoints.length === 0 || toPoints.length === 0) return { status: 'unreachable' };

  const pairs = fromPoints.flatMap((from) => toPoints.map((to) => ({
    from, to, distance: Math.hypot(to.x - from.x, to.y - from.y),
  }))).sort((a, b) => a.distance - b.distance
    || a.from.x - b.from.x || a.from.y - b.from.y
    || a.to.x - b.to.x || a.to.y - b.to.y);
  let pending = false;
  for (const { from, to } of pairs) {
    const costTiles = routeCommuteCost(from.x, from.y, to.x, to.y, gridOverride);
    if (costTiles === null) { pending = true; continue; }
    if (costTiles === Infinity) continue;
    const start = { x: Math.floor(from.x / PATH_CELL), y: Math.floor(from.y / PATH_CELL) };
    const goal = { x: Math.floor(to.x / PATH_CELL), y: Math.floor(to.y / PATH_CELL) };
    const distance = start.x === goal.x && start.y === goal.y
      ? Math.hypot(to.x - from.x, to.y - from.y)
      : costTiles * PATH_CELL
        + Math.hypot(from.x - (start.x + 0.5) * PATH_CELL, from.y - (start.y + 0.5) * PATH_CELL)
        + Math.hypot(to.x - (goal.x + 0.5) * PATH_CELL, to.y - (goal.y + 0.5) * PATH_CELL);
    const speed = commuteWalkSpeed(walkSpeed, WORK_COMMUTE_RUSH) * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO;
    return { status: 'priced', travelHours: distance / speed / TICKS_PER_HOUR,
      leadHours: commuteLeadHoursFor(distance, walkSpeed), costTiles: distance / PATH_CELL };
  }
  return pending ? { status: 'pending', reason: 'search-budget' } : { status: 'unreachable' };
}

/**
 * Cheapest possible travel time between two points: straight line at the maximum rush/road pace.
 * Safe as a lower bound for skipping route searches, never as a replacement for the route.
 */
export function straightLineCommuteLowerBoundHours(
  from: { x: number; y: number },
  to: { x: number; y: number },
  walkSpeed: number,
): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const perTick = commuteWalkSpeed(walkSpeed, WORK_COMMUTE_RUSH)
    * ROAD_SPEED_MULT
    * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO;
  if (!Number.isFinite(distance) || !Number.isFinite(perTick) || perTick <= 0) return 0;
  return distance / perTick / TICKS_PER_HOUR;
}

/**
 * Hours from a home over the walkable route: the straight line when no route is priced, and
 * `Infinity` when a finished search proves the destination unreachable.
 */
export function estimatedCommuteHours(
  home: Building,
  destination: Building,
  buildings: readonly Building[],
  walkSpeed: number,
): number {
  const routed = quoteBuildingCommute(home, destination, walkSpeed);
  if (routed.status === 'unreachable') return Infinity;
  if (routed.status === 'priced') return routed.leadHours;
  if (getCurrentPathGrid()) return Infinity;
  return commuteLeadHoursFor(straightRouteCost(home.x, home.y, destination.x, destination.y, buildings), walkSpeed);
}

/**
 * Whether this settler can be assigned a post here: the lead hours the scheduler would really hand out
 * must fit `MAX_ASSIGNABLE_COMMUTE_HOURS`, measured from home, with a road route counting in their favour.
 */
export function isWithinAssignableCommute(
  entity: Entity,
  building: Pick<Building, 'x' | 'y'>,
  buildings: readonly Building[],
  walkSpeed: number,
  buildingById?: ReadonlyMap<number, Building>,
  worldMap?: WorldMap | null,
): boolean {
  // The residence, not a worker's present position or previous workplace, owns
  // the commute origin. For an unhoused settler, use their current position.
  const home = entity.residenceBuildingId == null
    ? undefined
    : buildingById?.get(entity.residenceBuildingId)
      ?? buildings.find((candidate) => candidate.id === entity.residenceBuildingId);
  const from = home ?? entity;
  // Speculative placements use their own map; the unfinished plot is not a solid footprint yet.
  const previewBuildings = worldMap
    ? buildings.filter((candidate) => candidate !== building) as Building[]
    : undefined;
  const previewGrid = worldMap ? getReadOnlyPathGrid(worldMap, previewBuildings) : undefined;
  const grid = previewGrid ?? getCurrentPathGrid();
  const routed = quoteBuildingCommute(from, building, walkSpeed, previewGrid);
  if (routed.status === 'priced') return routed.leadHours <= MAX_ASSIGNABLE_COMMUTE_HOURS;
  if (routed.status === 'unreachable' || grid) return false;

  // A failed or budget-exhausted search is unknown, not a passable road: defer new jobs. Only a
  // bootstrap with no map falls back to the straight-road estimate.
  return commuteLeadHoursFor(
    straightRouteCost(from.x, from.y, building.x, building.y, buildings),
    walkSpeed,
  ) <= MAX_ASSIGNABLE_COMMUTE_HOURS;
}

import type { Building, Entity } from './gameTypes';
import { PATH_CELL } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { findRouteCostOutcome, getCurrentPathGrid, type PathGrid } from './pathfinding';

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

/** Route searches one housing sweep may run before legs fall back to the straight line. */
export const MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS = 256;

/** Node cap per search: past it the leg keeps the straight-line estimate. */
const MAX_COMMUTE_ROUTE_SEARCH_NODES = 4000;

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

/** Searches left in the housing sweep's budget; a cached leg costs nothing. */
let routeSearchesLeft = MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS;
const routeCostCache = new WeakMap<PathGrid, Map<string, number>>();

/** Opens a housing sweep's route-search budget. */
export function beginCommuteRoutePass(): void {
  routeSearchesLeft = MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS;
}

/** Route hours home → destination over the sim's current grid, or null when no route is priced. */
function routeCommuteHours(fromWorldX: number, fromWorldY: number, toWorldX: number, toWorldY: number, walkSpeed: number): number | null {
  const grid = getCurrentPathGrid();
  if (!grid) return null;
  const fromX = Math.floor(fromWorldX / PATH_CELL);
  const fromY = Math.floor(fromWorldY / PATH_CELL);
  const toX = Math.floor(toWorldX / PATH_CELL);
  const toY = Math.floor(toWorldY / PATH_CELL);
  // Co-located buildings are the straight line's case, not the search's.
  if (fromX === toX && fromY === toY) return null;
  const key = `${walkSpeed}|${fromX},${fromY}>${toX},${toY}`;
  let cache = routeCostCache.get(grid);
  if (!cache) {
    cache = new Map<string, number>();
    routeCostCache.set(grid, cache);
  }
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  if (routeSearchesLeft <= 0) return null;
  routeSearchesLeft--;
  const search = findRouteCostOutcome(grid, fromX, fromY, toX, toY, MAX_COMMUTE_ROUTE_SEARCH_NODES);
  if (search.cost === null) {
    // A spent budget leaves the leg unpriced; a finished search with no route proves the walk away.
    if (search.budgetExhausted) return null;
    if (cache.size >= COMMUTE_ROUTE_CACHE_LIMIT) cache.clear();
    cache.set(key, Infinity);
    return Infinity;
  }
  // A* steps are tile units, so the walk distance is the route's step cost in world px.
  const hours = commuteLeadHoursFor(search.cost * PATH_CELL, walkSpeed);
  if (cache.size >= COMMUTE_ROUTE_CACHE_LIMIT) cache.clear();
  cache.set(key, hours);
  return hours;
}

/**
 * Hours from a home over the walkable route: the straight line when no route is priced, and
 * `Infinity` when a finished search proves the destination unreachable.
 */
export function estimatedCommuteHours(
  home: Building,
  destination: Building,
  _buildings: readonly Building[],
  walkSpeed: number,
): number {
  const routed = routeCommuteHours(home.x, home.y, destination.x, destination.y, walkSpeed);
  if (routed === Infinity) return Infinity;
  if (routed !== null) return routed;
  const distance = Math.hypot(destination.x - home.x, destination.y - home.y);
  // A missing or budget-exhausted route never grants a speculative road discount.
  return commuteLeadHoursFor(distance, walkSpeed);
}

/**
 * Whether this settler can be assigned a post here: the lead hours the scheduler would really hand out
 * must fit `MAX_ASSIGNABLE_COMMUTE_HOURS`, measured from home, with a road route counting in their favour.
 */
export function isWithinAssignableCommute(
  entity: Entity,
  building: Building,
  buildings: readonly Building[],
  walkSpeed: number,
): boolean {
  // workerBuildingId stores the JOB, not the residence. Commute always starts
  // from the resident's home; fall back to their position if not housed.
  const home = entity.residenceBuildingId == null
    ? undefined
    : buildings.find((candidate) => candidate.id === entity.residenceBuildingId);
  const from = home ?? entity;
  const toX = building.x;
  const toY = building.y;
  if (home) {
    return estimatedCommuteHours(home, building, buildings, walkSpeed) <= MAX_ASSIGNABLE_COMMUTE_HOURS;
  }
  const routed = routeCommuteHours(from.x, from.y, toX, toY, walkSpeed);
  if (routed !== null) return routed <= MAX_ASSIGNABLE_COMMUTE_HOURS;
  // No grid or exhausted search budget: do not infer a full-route speed bonus from one road.
  return commuteLeadHoursFor(Math.hypot(toX - from.x, toY - from.y), walkSpeed)
    <= MAX_ASSIGNABLE_COMMUTE_HOURS;
}

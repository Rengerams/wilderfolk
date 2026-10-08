import { BuildingType } from './buildings';
import type { Building, Entity } from './gameTypes';
import { isEntityOnBuilding } from './buildingRotation';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { ROAD_SPEED_MULT } from './simulation/movementSteering';

/** Commute reach, lead hours and walk pacing, shared by the movement loop and work assignment. */
export const COMMUTE_CONFIG = {
  LONG_RANGE_DIST: 50,
  ARRIVAL_DIST: 8,
  MAX_DIST_RUSH: 12,
  /** Final-approach easing: the last stretch closes at `dist * APPROACH_RATE_PER_TICK` per tick. */
  APPROACH_RATE_PER_TICK: 0.25,
  /** Per-tick distance on the pathed branch, as a fraction of `moveSpeed`. */
  PATH_STEER_SPEED_RATIO: 0.88,
} as const;

/** The longest commute lead the scheduler hands out, in hours (see `commuteLeadHoursFor`). */
export const MAX_COMMUTE_LEAD_HOURS = 6;

/** The `rush` the work commute passes to the walk; the lead estimate has to include it. */
export const WORK_COMMUTE_RUSH = 3.5;

/** Roads are quicker to walk, so a settler who may use them can be housed further out. */
const COMMUTE_ROAD_SPEED_MULT = ROAD_SPEED_MULT;

/** Spacing of the samples that test whether a road serves a route, in world px. */
const ROAD_ROUTE_SAMPLE_PX = 24;

/** Owner rule: a settler who cannot reach a post inside two hours is not a candidate for it. */
export const MAX_ASSIGNABLE_COMMUTE_HOURS = 2;

/** Hours before a shift a settler must set off, floored at one and capped by `MAX_COMMUTE_LEAD_HOURS`. */
export function commuteLeadHoursFor(
  distance: number,
  walkSpeed: number,
  rush: number = WORK_COMMUTE_RUSH,
): number {
  if (!Number.isFinite(distance) || distance <= COMMUTE_CONFIG.ARRIVAL_DIST) return 1;
  const speed = Number.isFinite(walkSpeed) && walkSpeed > 0 ? walkSpeed : 1;
  const rushMult = Number.isFinite(rush) && rush > 0 ? rush : 1;
  const perTick = speed * rushMult * Math.min(COMMUTE_CONFIG.MAX_DIST_RUSH, 1 + distance / 40)
    * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO;
  if (!Number.isFinite(perTick) || perTick <= 0) return 1;
  const hours = distance / perTick / TICKS_PER_HOUR;
  if (!Number.isFinite(hours)) return 1;
  return Math.min(MAX_COMMUTE_LEAD_HOURS, Math.max(1, hours));
}

/** Whether a road serves the route between two points, sampled along the straight line. */
function routePassesRoad(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  buildings: readonly Building[],
): boolean {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const samples = Math.max(1, Math.min(24, Math.ceil(distance / ROAD_ROUTE_SAMPLE_PX)));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    for (const building of buildings) {
      if (building.type !== BuildingType.Road && building.type !== BuildingType.Bridge) continue;
      if (!building.completed) continue;
      if (isEntityOnBuilding(x, y, building, ROAD_ROUTE_SAMPLE_PX)) return true;
    }
  }
  return false;
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
  const home = entity.homeBuildingId == null
    ? undefined
    : buildings.find((candidate) => candidate.id === entity.homeBuildingId);
  const from = home ?? entity;
  const toX = building.x + building.width / 2;
  const toY = building.y + building.height / 2;
  const distance = Math.hypot(toX - from.x, toY - from.y);
  const usesRoad = routePassesRoad(from.x, from.y, toX, toY, buildings);
  const speed = usesRoad ? walkSpeed * COMMUTE_ROAD_SPEED_MULT : walkSpeed;
  return commuteLeadHoursFor(distance, speed) <= MAX_ASSIGNABLE_COMMUTE_HOURS;
}

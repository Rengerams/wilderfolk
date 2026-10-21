import { BuildingType } from './buildings';
import type { Building, Entity } from './gameTypes';
import { isEntityOnBuilding } from './buildingRotation';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { ROAD_SPEED_MULT } from './simulation/movementSteering';

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

/** Roads are quicker to walk, so a settler who may use them can be housed further out. */
const COMMUTE_ROAD_SPEED_MULT = ROAD_SPEED_MULT;

/** Spacing of the samples that test whether a road serves a route, in world px. */
const ROAD_ROUTE_SAMPLE_PX = 24;

/** Owner rule: a settler who cannot reach a post inside two hours is not a candidate for it. */
export const MAX_ASSIGNABLE_COMMUTE_HOURS = 2;

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
  for (const building of buildings) {
    if (building.type !== BuildingType.Road && building.type !== BuildingType.Bridge) continue;
    if (!building.completed) continue;
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const x = fromX + (toX - fromX) * t;
      const y = fromY + (toY - fromY) * t;
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
  // homeBuildingId stores the JOB, not the residence. Commute always starts
  // from the resident's home; fall back to their position if not housed.
  const home = entity.residenceBuildingId == null
    ? undefined
    : buildings.find((candidate) => candidate.id === entity.residenceBuildingId);
  const from = home ?? entity;
  const toX = building.x + building.width / 2;
  const toY = building.y + building.height / 2;
  const distance = Math.hypot(toX - from.x, toY - from.y);
  if (commuteLeadHoursFor(distance, walkSpeed) <= MAX_ASSIGNABLE_COMMUTE_HOURS) return true;
  if (commuteLeadHoursFor(distance, walkSpeed * COMMUTE_ROAD_SPEED_MULT) > MAX_ASSIGNABLE_COMMUTE_HOURS) return false;
  return routePassesRoad(from.x, from.y, toX, toY, buildings);
}

import { TERRAIN_TILE_SIZE } from '../gameTypes';
import type { Building, Entity } from '../gameTypes';
import { isActiveMoonHowler } from '../moonHowler';
import { steerWithPath } from '../pathfinding';
import { faceVelocity } from './movementSteering';

const COMMUTE_CONFIG = {
  LONG_RANGE_DIST: 50,
  ARRIVAL_DIST: 8,
  MAX_DIST_RUSH: 12,
  /**
   * Final-approach easing: inside `LONG_RANGE_DIST` the walk closes on the doorstep at
   * `dist * APPROACH_RATE_PER_TICK` per tick, clamped to the base walking speed at the low end and
   * to the commute speed at the high end.
   *
   * Both earlier tunings were wrong in opposite directions: a flat `moveSpeed * 0.12` crawl took
   * most of a game hour to cover the last 50 px (owner report: "the cooling down period to a
   * building is now very slow"), while `Math.max(speed, moveSpeed * 0.65)` snapped through the same
   * stretch in about ten ticks. A distance-proportional step decelerates *visibly* — full commute
   * speed at 50 px, ~2.5x walking speed at 10 px — without ever crawling or snapping, and the
   * `Math.min(dist, …)` cap still means no overshoot.
   */
  APPROACH_RATE_PER_TICK: 0.25,
  /** Per-tick distance on the pathed branch, as a fraction of `moveSpeed` (see M27). */
  PATH_STEER_SPEED_RATIO: 0.88,
} as const;

/** Beyond this distance, settlers snap to home/work. */
export const COMMUTE_SNAP_DISTANCE = 200;

// ============ COMMUTE HELPERS ============

/**
 * Calculates a deterministic, dispersed standing position in the front yard of a home residence
 * so family members and roommates do not overlap sprites or get hidden behind the roof.
 */
export function homeStandPosition(building: Building, entityId: number): { x: number; y: number } {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const seed = Math.abs(entityId * 17 + building.id * 31);

  // Bias angle toward the south (front yard / porch arc: 30° to 150°)
  const angle = Math.PI * 0.18 + ((seed % 100) / 100) * Math.PI * 0.64;
  const ring = (seed % 4) + 1;
  const radius = 10 + ring * 6;

  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * (radius * 0.65) + building.height * 0.2,
  };
}

/**
 * Returns the exact destination coordinates for a human heading to home or workplace.
 */
export function humanBuildingTarget(
  building: Building,
  entityId: number,
  arrivingHome: boolean,
): { x: number; y: number } {
  if (arrivingHome) {
    return homeStandPosition(building, entityId);
  }
  const seed = Math.abs(entityId * 13 + building.id * 29);
  const offset = ((seed % 7) - 3) * 6;
  return {
    x: building.x + building.width / 2 + offset,
    // Workers stand in front of the building (south) so sprites are not obscured
    y: building.y + building.height * 0.92,
  };
}

export function commuteDistanceToBuilding(
  entity: Entity,
  building: Building,
  arrivingHome: boolean,
): number {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  return Math.hypot(target.x - entity.x, target.y - entity.y);
}

export function snapHumanToBuilding(entity: Entity, building: Building, arrivingHome: boolean): void {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  entity.x = target.x;
  entity.y = target.y;
  entity.vx = 0;
  entity.vy = 0;
  entity.spriteAngle = Math.PI / 2; // Face forward/south toward the road
}

/**
 * Generates a stable path key per commute leg so A* is not recalculated on every tile crossed.
 */
export function commutePathCacheKey(
  buildingId: number,
  arrivingHome: boolean,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  entityId?: number,
): string {
  // A known entity identifies the commute on its own: the key must stay stable
  // while that settler crosses tiles, or A* would rerun on every step.
  if (entityId != null) {
    return `c_${entityId}_${buildingId}_${arrivingHome ? 'h' : 'w'}`;
  }
  // Without an entity there is nothing else to name the commute, so both
  // endpoint tiles are part of the key.
  const startTileX = Math.floor(startX / TERRAIN_TILE_SIZE);
  const startTileY = Math.floor(startY / TERRAIN_TILE_SIZE);
  const targetTileX = Math.floor(targetX / TERRAIN_TILE_SIZE);
  const targetTileY = Math.floor(targetY / TERRAIN_TILE_SIZE);
  return `c_${buildingId}_${arrivingHome ? 'h' : 'w'}_${startTileX}_${startTileY}_${targetTileX}_${targetTileY}`;
}

/**
 * Steers a human entity towards their target building.
 * Returns `true` if the entity has arrived within destination radius, `false` otherwise.
 */
export function commuteHumanToBuilding(
  entity: Entity,
  building: Building,
  speed: number,
  arrivingHome: boolean,
  rush = 1,
): boolean {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);

  // Arrived at destination
  if (dist <= COMMUTE_CONFIG.ARRIVAL_DIST) {
    entity.vx = 0;
    entity.vy = 0;
    return true;
  }

  // Accelerate long-range commutes so cross-map walks do not consume the entire work day
  const distRush = Math.min(COMMUTE_CONFIG.MAX_DIST_RUSH, 1 + dist / 40);
  const moveSpeed = speed * rush * distRush;

  if (dist > COMMUTE_CONFIG.LONG_RANGE_DIST) {
    const cacheKey = commutePathCacheKey(
      building.id,
      arrivingHome,
      entity.x,
      entity.y,
      target.x,
      target.y,
      entity.id,
    );

    const handled = steerWithPath(
      entity,
      target.x,
      target.y,
      moveSpeed * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO,
      cacheKey,
    );

    // 'path' only sets the velocity along the route; the human loop's movement apply at the end of
    // the tick is the single integration (the stepper must not move the entity as well).
    if (handled === 'path') return false;
    if (handled === 'arrived') return true;

    const step = Math.min(dist, moveSpeed * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO);
    entity.vx = (dx / dist) * step;
    entity.vy = (dy / dist) * step;
    faceVelocity(entity);
    return false;
  }

  // Final approach: ease in at a distance-proportional step (never below a normal walk, never a
  // snap) and never overshoot the doorstep.
  const approachSpeed = Math.min(
    moveSpeed,
    Math.max(speed, dist * COMMUTE_CONFIG.APPROACH_RATE_PER_TICK),
  );
  const step = Math.min(dist, approachSpeed);
  entity.vx = (dx / dist) * step;
  entity.vy = (dy / dist) * step;

  if (Math.abs(entity.vx) > 0.001 || Math.abs(entity.vy) > 0.001) {
    faceVelocity(entity);
  }

  return false;
}

/**
 * Finds the nearest active, living cursed Moon Howler (werewolf form)
 * relative to an entity (used primarily for priest exorcism AI).
 */
export function nearestActiveMoonHowler(
  entity: Entity,
  werewolves: Entity[] | undefined,
): Entity | undefined {
  if (!werewolves || werewolves.length === 0) return undefined;

  let best: Entity | undefined;
  let bestDistSq = Infinity;

  for (let i = 0; i < werewolves.length; i++) {
    const w = werewolves[i];
    // Ignore self, dead entities, and non-active werewolves
    if (w.id === entity.id || !w.alive || !isActiveMoonHowler(w)) continue;

    const dx = w.x - entity.x;
    const dy = w.y - entity.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = w;
    }
  }

  return best;
}

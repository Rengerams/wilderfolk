import { TERRAIN_TILE_SIZE } from '../gameTypes';
import type { Building, Entity } from '../gameTypes';
import { isActiveMoonHowler } from '../moonHowler';
import { steerWithPath } from '../pathfinding';

const COMMUTE_CONFIG = {
  LONG_RANGE_DIST: 50,
  ARRIVAL_DIST: 8,
  MAX_DIST_RUSH: 12,
  HOME_APPROACH_DAMPING: 0.12,
  WORK_APPROACH_DAMPING: 0.12,
  PATH_STEER_SPEED_RATIO: 0.88,
} as const;

/** Beyond this distance, settlers snap to home/work. */
export const COMMUTE_SNAP_DISTANCE = 200;

// ============ COMMUTE HELPERS ============

/**
 * Calculates a deterministic, dispersed standing position around a home residence
 * so that family members and roommates do not overlap sprites.
 */
export function homeStandPosition(building: Building, entityId: number): { x: number; y: number } {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const seed = Math.abs(entityId * 17 + building.id * 31);
  const angle = (seed * 2.399963) % (Math.PI * 2);
  const ring = (seed % 5) + 1;
  const radius = 10 + ring * 7;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius * 0.6,
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
}

export function commutePathCacheKey(
  buildingId: number,
  arrivingHome: boolean,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
): string {
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
    );

    const handled = steerWithPath(
      entity,
      target.x,
      target.y,
      moveSpeed * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO,
      cacheKey,
    );

    if (handled === 'path') return false;
    if (handled === 'arrived') return true;

    const step = Math.min(dist, moveSpeed * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO);
    entity.vx = (dx / dist) * step;
    entity.vy = (dy / dist) * step;
    entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    return false;
  }

  // Final approach damping: prevent overshooting the doorstep
  const damping = arrivingHome
    ? COMMUTE_CONFIG.HOME_APPROACH_DAMPING
    : COMMUTE_CONFIG.WORK_APPROACH_DAMPING;

  const step = Math.min(dist, moveSpeed * damping);
  entity.vx = (dx / dist) * step;
  entity.vy = (dy / dist) * step;

  if (Math.abs(entity.vx) > 0.001 || Math.abs(entity.vy) > 0.001) {
    entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
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
    if (!w.alive || !isActiveMoonHowler(w)) continue;

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
/**
 * Human movement — commuting to home/work, snapping, and Moon Howler proximity.
 * Extracted verbatim from humanTick.ts (humanTick-split plan, Task 1) — behavior unchanged.
 */
import type { Building, Entity } from '../gameTypes';
import { isActiveMoonHowler } from '../moonHowler';
import { steerWithPath } from '../pathfinding';

// ============ COMMUTE HELPERS ============
export function homeStandPosition(building: Building, entityId: number): { x: number; y: number } {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const seed = entityId * 17 + building.id * 31;
  const angle = (seed * 2.399963) % (Math.PI * 2);
  const ring = (seed % 5) + 1;
  const radius = 10 + ring * 7;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius * 0.6,
  };
}

/** Beyond this distance, settlers snap to home/work at shift change (7am / 7pm). */
export const COMMUTE_SNAP_DISTANCE = 130;

export function humanBuildingTarget(
  building: Building,
  entityId: number,
  arrivingHome: boolean,
): { x: number; y: number } {
  if (arrivingHome) return homeStandPosition(building, entityId);
  const seed = entityId * 13 + building.id * 29;
  const offset = ((seed % 7) - 3) * 6;
  return {
    x: building.x + building.width / 2 + offset,
    // Workers stand in front of the building (south) so sprites aren't buried in the art.
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
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Stronger long-range rush so village-scale walks finish in a work morning
  const distRush = Math.min(12, 1 + dist / 40);
  const moveSpeed = speed * rush * distRush;
  if (dist > 22) {
    // Long commute: route around water/mountains when the straight line is blocked.
    const handled = steerWithPath(
      entity,
      target.x,
      target.y,
      moveSpeed * 0.72,
      // BUG-8: include origin — a path cached for one settler must not be reused
      // for others starting elsewhere.
      `c_${building.id}_${arrivingHome ? 'h' : 'w'}_${Math.round(entity.x)}_${Math.round(entity.y)}`,
    );
    if (handled === 'path') return false;
    if (handled === 'arrived') return true;
    entity.vx = (dx / dist) * moveSpeed * 0.72;
    entity.vy = (dy / dist) * moveSpeed * 0.72;
    entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    return false;
  }
  if (dist <= 8) {
    entity.vx = 0;
    entity.vy = 0;
    return true;
  }
  entity.vx = (dx / dist) * moveSpeed * (arrivingHome ? 0.12 : 0.18);
  entity.vy = (dy / dist) * moveSpeed * (arrivingHome ? 0.12 : 0.18);
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
  return false;
}

/** Nearest alive cursed Moon Howler (werewolf form) to an entity — for the priest hunt. */
export function nearestActiveMoonHowler(e: Entity, werewolves: Entity[] | undefined): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const w of werewolves ?? []) {
    if (!w.alive || !isActiveMoonHowler(w)) continue;
    const dx = w.x - e.x;
    const dy = w.y - e.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

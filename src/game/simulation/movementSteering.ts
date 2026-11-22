/**
 * The movement contract: a behaviour sets velocity (and facing) and the human loop applies the step —
 * the stepper never writes a position. Leaf module, so `humanMovement` → `pathfinding` stays acyclic.
 */
import type { Entity } from '../gameTypes';

/** How much faster a settler walks on a road. The pathfinder prices a road tile as `1 / this`. */
export const ROAD_SPEED_MULT = 1.5;

/** Faces the entity the way its velocity already points. */
export function faceVelocity(entity: Entity): void {
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
}

/**
 * Normalises the delta to `(targetX, targetY)` and writes the entity's velocity along it. `|| 1` is
 * deliberate: a zero delta leaves an exactly-zero velocity instead of `NaN`.
 */
export function setVelocityToward(
  entity: Entity,
  targetX: number,
  targetY: number,
  speed: number,
  approachFactor = 1,
): void {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const distance = Math.hypot(dx, dy) || 1;
  entity.vx = (dx / distance) * speed * approachFactor;
  entity.vy = (dy / distance) * speed * approachFactor;
}

/** {@link setVelocityToward} plus {@link faceVelocity} — the whole step at once. */
export function steerEntityToward(
  entity: Entity,
  targetX: number,
  targetY: number,
  speed: number,
  approachFactor = 1,
): void {
  setVelocityToward(entity, targetX, targetY, speed, approachFactor);
  faceVelocity(entity);
}

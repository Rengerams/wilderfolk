/**
 * The movement contract every behaviour module follows: a behaviour **sets velocity** (and facing)
 * and the human loop applies the step — the stepper never writes a position (the 2026-09-13 movement
 * regression, `HANDOVER-simulation-audit-2026-09-13.md:188`).
 *
 * This is the single owner of the "normalise a delta, set velocity, face it" step
 * (`duplication-deadcode.md` A14), which was hand-written at ~20 sites, each with its own magic
 * approach factor. `approachFactor` is the per-behaviour tuning that used to be a literal at the call
 * site. The multiplication order `(dx / distance) * speed * approachFactor` is part of the contract:
 * it is the exact order the inline copies used, so no velocity value moves.
 *
 * Leaf module on purpose: `pathfinding` uses this too and `humanMovement` already imports
 * `pathfinding.steerWithPath`, so the owner cannot live in either without an import cycle.
 */
import type { Entity } from '../gameTypes';

/** Faces the entity the way its velocity already points. */
export function faceVelocity(entity: Entity): void {
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
}

/**
 * Normalises the delta to `(targetX, targetY)` and writes the entity's velocity along it.
 *
 * `|| 1` is deliberate: a zero delta leaves an exactly-zero velocity instead of `NaN`, which is what
 * every copy this replaces did.
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

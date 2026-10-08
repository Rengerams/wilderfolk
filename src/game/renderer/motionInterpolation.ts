import type { Entity } from '../gameTypes';

/** A world-space position sampled for interpolation. */
export interface MotionPosition {
  x: number;
  y: number;
}

/**
 * A step longer than this in one tick is a teleport — spawn, prison, hotel or commute snap — and is
 * drawn at its destination instead of being smeared across the map.
 */
export const MAX_INTERPOLATED_STEP_PX = 96;

/** Blend one tick of motion; the fraction is clamped, so a backed-up accumulator never overshoots. */
export function interpolatePosition(
  previous: MotionPosition | null,
  current: MotionPosition,
  fraction: number,
  maxStepPx: number = MAX_INTERPOLATED_STEP_PX,
): MotionPosition {
  if (!previous) return current;
  const t = fraction <= 0 ? 0 : fraction >= 1 ? 1 : fraction;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  if (Math.hypot(dx, dy) > maxStepPx) return current;
  return { x: previous.x + dx * t, y: previous.y + dy * t };
}

/** Where each mover stood at the previous tick, keyed by entity id. */
let previousByEntity: ReadonlyMap<number, MotionPosition> = new Map();
/** Where each mover stands now; refilled in place per frame and promoted at the next tick. */
let lastSeenByEntity = new Map<number, MotionPosition>();
let sampledTick = -1;
let sampledFraction = 1;

/** Sample the movers for this frame and set the tick fraction they are blended by. */
export function beginMotionFrame(
  tick: number,
  fraction: number,
  ...lists: ReadonlyArray<readonly Entity[]>
): void {
  // A new tick: what the previous frame saw is where the tick before it left every mover, and the
  // map that held it becomes the blend source while a fresh one collects the new tick.
  if (tick !== sampledTick) {
    previousByEntity = lastSeenByEntity;
    lastSeenByEntity = new Map();
    sampledTick = tick;
  }
  const seen = lastSeenByEntity;
  for (const list of lists) {
    for (const entity of list) {
      const sample = seen.get(entity.id);
      if (sample) {
        sample.x = entity.x;
        sample.y = entity.y;
      } else {
        seen.set(entity.id, { x: entity.x, y: entity.y });
      }
    }
  }
  sampledFraction = fraction;
}

/** Where to draw a mover this frame: the previous tick's position blended by the tick fraction. */
export function presentationPosition(entity: Entity): MotionPosition {
  const previous = previousByEntity.get(entity.id);
  if (!previous) return { x: entity.x, y: entity.y };
  return interpolatePosition(previous, { x: entity.x, y: entity.y }, sampledFraction);
}

/** Drop every sample — a new session, a loaded save or a world swap. */
export function resetMotionInterpolation(): void {
  previousByEntity = new Map();
  lastSeenByEntity = new Map();
  sampledTick = -1;
  sampledFraction = 1;
}

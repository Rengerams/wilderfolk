import type { EntityType, HuntVisual, WorldState } from './gameTypes';

export type { HuntVisual };

/**
 * An arrow's flight is animated against the render clock: `startedAtMs` is a presentation-only stamp
 * (never read by a decision), while `startedAtTick` is the simulation reading that owns retention.
 */
export const HUNT_ANIM_MS = 1000;

/**
 * Retention in simulation ticks. At speed 1 a tick is one second, so this keeps the arrow for the
 * flight plus a tick of margin — the wall clock can never prune or preserve it inside the tick.
 */
export const HUNT_ANIM_LIFETIME_TICKS = 2;

/** Flight progress for the renderer, read against the render clock (`nowMs`), never by the simulation. */
export function huntAnimProgress(visual: HuntVisual, nowMs = Date.now()): number {
  const elapsed = nowMs - visual.startedAtMs;
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / HUNT_ANIM_MS);
}

/** Whether the arrow is still inside its retention window, measured in simulation ticks. */
export function isHuntVisualActive(visual: HuntVisual, nowTick: number): boolean {
  return nowTick - visual.startedAtTick < HUNT_ANIM_LIFETIME_TICKS;
}

export function pruneHuntVisuals(state: WorldState, nowTick = state.tick): void {
  const visuals = state.huntVisuals;
  
  // Early exit if undefined or empty
  if (!visuals || visuals.length === 0) {
    if (!visuals) state.huntVisuals = [];
    return;
  }

  // 🚀 OPTIMIZED: Zero-allocation in-place filtering
  let writeIdx = 0;
  for (let i = 0; i < visuals.length; i++) {
    if (isHuntVisualActive(visuals[i], nowTick)) {
      visuals[writeIdx++] = visuals[i];
    }
  }
  
  // Truncate the array to remove stale references, zero GC pressure
  visuals.length = writeIdx;
}

export function addHuntVisual(
  state: WorldState,
  visual: Omit<HuntVisual, 'id'> & { id?: string; preyType: EntityType },
): void {
  if (!state.huntVisuals) {
    state.huntVisuals = [];
  }
  
  const entry: HuntVisual = {
    id: visual.id ?? `hunt-${state.tick}-${visual.hunterId}-${state.huntVisuals.length}`,
    hunterId: visual.hunterId,
    preyType: visual.preyType,
    fromX: visual.fromX,
    fromY: visual.fromY,
    toX: visual.toX,
    toY: visual.toY,
    startedAtTick: visual.startedAtTick,
    startedAtMs: visual.startedAtMs,
    success: visual.success,
    foughtBack: visual.foughtBack,
  };
  
  // Unshift adds the newest visual to the front (index 0)
  state.huntVisuals.unshift(entry);
  
  // 🚀 OPTIMIZED: Direct length truncation is cleaner and marginally faster than .pop()
  if (state.huntVisuals.length > 8) {
    state.huntVisuals.length = 8;
  }
}

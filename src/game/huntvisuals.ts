import type { EntityType, HuntVisual, WorldState } from './gameTypes';

export type { HuntVisual };

/**
 * An arrow's flight is animated against the **wall clock**, and `startedAtTick` exists beside
 * `startedAtMs` so the two jobs stay separate. Both timestamps are on the visual, and only one of them
 * can be right for each job:
 *
 * - retention and progress read `startedAtMs`, because a 1 s animation has to finish in about a second
 *   of real time even while the player runs the simulation at 5× or fast-forwards a day. Keying
 *   retention off `startedAtTick` is the defect this module's test file is named after — at speed, an
 *   arrow expired before the renderer had drawn it.
 * - `startedAtTick` is the reproducible reading of the same event, for anything that needs to reason
 *   about the simulation rather than the screen.
 *
 * The cost of that choice is recorded rather than paid off: `huntVisuals` is written from inside
 * `gameTick` (`addHuntVisual`) and pruned from inside it (`pruneHuntVisuals`, `tickLayerRealtime`), so
 * a tick delta is not byte-reproducible across two runs of one seed. That is presentation-only
 * (`renderer/humans.ts` and `renderSnapshot.ts` are the only readers), the slice is not in
 * `WORLD_STATE_SAVE_KEYS` so saves stay reproducible, and `scripts/colonyHealth.ts` already documents
 * it as expected. Do not "fix" it by moving retention onto ticks: it is not free, it reintroduces the
 * bug above, and nothing downstream depends on it.
 */
export const HUNT_ANIM_MS = 1000;

export function huntAnimProgress(visual: HuntVisual, nowMs = Date.now()): number {
  const elapsed = nowMs - visual.startedAtMs;
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / HUNT_ANIM_MS);
}

export function isHuntVisualActive(visual: HuntVisual, nowMs = Date.now()): boolean {
  return nowMs - visual.startedAtMs < HUNT_ANIM_MS + 400;
}

export function pruneHuntVisuals(state: WorldState, nowMs = Date.now()): void {
  const visuals = state.huntVisuals;
  
  // Early exit if undefined or empty
  if (!visuals || visuals.length === 0) {
    if (!visuals) state.huntVisuals = [];
    return;
  }

  // 🚀 OPTIMIZED: Zero-allocation in-place filtering
  let writeIdx = 0;
  for (let i = 0; i < visuals.length; i++) {
    if (isHuntVisualActive(visuals[i], nowMs)) {
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
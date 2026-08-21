import type { EntityType, HuntVisual, WorldState } from './gameTypes';

export type { HuntVisual };

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
  if (!state.huntVisuals) {
    state.huntVisuals = [];
    return;
  }
  // Rendering measures arrow flight in milliseconds, so retain the entry on the
  // same wall-clock domain. Simulation speed must not shorten the visual.
  state.huntVisuals = state.huntVisuals.filter((v) => isHuntVisualActive(v, nowMs));
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
  state.huntVisuals.unshift(entry);
  if (state.huntVisuals.length > 8) {
    state.huntVisuals.pop();
  }
}

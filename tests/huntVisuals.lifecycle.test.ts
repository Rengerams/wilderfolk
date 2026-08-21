/*
 * Hunt Visual lifecycle regression — BUG 2026-08-21-hunt-visuals-expire-on-simulation-ticks.
 *
 * The renderer animates Hunt Visuals in milliseconds. Their transient-state
 * retention must use the same clock so finished arrows do not linger in render snapshots.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { HuntVisual, WorldState } from '../src/game/gameTypes';
import { HUNT_ANIM_MS, pruneHuntVisuals } from '../src/game/huntvisuals';

function visual(startedAtMs: number, startedAtTick: number): HuntVisual {
  return {
    id: 'hunt-test',
    hunterId: 1,
    preyType: EntityType.Deer,
    fromX: 10,
    fromY: 10,
    toX: 20,
    toY: 20,
    startedAtMs,
    startedAtTick,
    success: true,
    foughtBack: false,
  };
}

function world(huntVisuals: HuntVisual[]): WorldState {
  return { tick: 999, huntVisuals } as WorldState;
}

describe('Hunt Visual lifecycle', () => {
  it('keeps a recent visual even if fast-forward has advanced many simulation ticks', () => {
    const state = world([visual(10_000, 1)]);

    pruneHuntVisuals(state, 10_000 + HUNT_ANIM_MS + 399);

    expect(state.huntVisuals).toHaveLength(1);
  });

  it('removes a visual only after the renderer visibility window elapses', () => {
    const state = world([visual(10_000, 990)]);

    pruneHuntVisuals(state, 10_000 + HUNT_ANIM_MS + 400);

    expect(state.huntVisuals).toEqual([]);
  });
});

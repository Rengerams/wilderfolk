/*
 * An arrow's flight is drawn against the render clock, but its retention is simulation state: the
 * tick is the only clock allowed to decide whether a visual still exists. Fast-forwarding the
 * simulation therefore expires the visual, and real time cannot keep a stale arrow alive.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { HuntVisual, WorldState } from '../src/game/gameTypes';
import { HUNT_ANIM_LIFETIME_TICKS, pruneHuntVisuals } from '../src/game/huntvisuals';

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
  it('keeps a visual inside its tick retention window', () => {
    const state = world([visual(10_000, 1)]);

    pruneHuntVisuals(state, 1 + HUNT_ANIM_LIFETIME_TICKS - 1);

    expect(state.huntVisuals).toHaveLength(1);
  });

  it('removes a visual once the simulation window elapses, however little real time passed', () => {
    const state = world([visual(10_000, 990)]);

    pruneHuntVisuals(state, 990 + HUNT_ANIM_LIFETIME_TICKS);

    expect(state.huntVisuals).toEqual([]);
  });
});

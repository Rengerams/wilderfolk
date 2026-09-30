/**
 * D-1 of the 2026-09-21 audit — the logistics projection's per-frame recomputation.
 *
 * `buildRenderSnapshot` calls `computeLogisticsOverlay` once per snapshot, and the snapshot cache key
 * in `gameLoop.snapshotDirtyKey()` includes the camera, which `updateView` lerps every frame. With the
 * overlay on, panning therefore re-ran the whole projection — road graph, bucket grid, and one
 * `classifyCommute` (4–128 grid samples) per settler — at frame rate instead of once per tick.
 *
 * The memo is keyed on world **identity** plus the tick, so it also survives the case the audit could
 * not fix by keying on the tick alone: a handler that mutates the current world while paused, where
 * the tick does not move. Identity catches that.
 *
 * Every case here asserts equality with the uncached function first, so a cache that returns the wrong
 * projection fails rather than merely counting calls.
 */
import { describe, expect, it } from 'vitest';
import {
  computeLogisticsOverlay,
  computeLogisticsOverlayCached,
  resetLogisticsOverlayCache,
} from '../src/game/logisticsOverlayData';
import { initGame } from '../src/game/worldGen';
import type { WorldState } from '../src/game/gameTypes';

function world(): WorldState {
  return initGame({ villageName: 'Logistics', seed: 20260929 });
}

describe('the logistics projection is memoised per world revision', () => {
  it('returns the same projection on a repeat call at the same revision', () => {
    resetLogisticsOverlayCache();
    const w = world();

    const first = computeLogisticsOverlayCached(w);
    const second = computeLogisticsOverlayCached(w);

    expect(first).toEqual(computeLogisticsOverlay(w));
    // The same object, not merely an equal one: rebuilding would defeat the point.
    expect(second).toBe(first);
  });

  it('recomputes when the tick advances', () => {
    resetLogisticsOverlayCache();
    const w = world();

    const first = computeLogisticsOverlayCached(w);
    w.tick += 1;
    const second = computeLogisticsOverlayCached(w);

    expect(second).not.toBe(first);
    expect(second).toEqual(computeLogisticsOverlay(w));
  });

  it('recomputes when the world object is replaced at the same tick', () => {
    resetLogisticsOverlayCache();
    const w = world();
    const first = computeLogisticsOverlayCached(w);

    // A session swap or a `setWorld`: same tick, different object — the case a tick-only key misses.
    const replacement = { ...w, buildings: [...w.buildings] } as WorldState;
    const second = computeLogisticsOverlayCached(replacement);

    expect(second).not.toBe(first);
    expect(second).toEqual(computeLogisticsOverlay(replacement));
  });

  it('recomputes after an explicit reset', () => {
    resetLogisticsOverlayCache();
    const w = world();
    const first = computeLogisticsOverlayCached(w);

    resetLogisticsOverlayCache();
    const second = computeLogisticsOverlayCached(w);

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('refreshes a projection of an in-place mutation at an unchanged tick', () => {
    resetLogisticsOverlayCache();
    const w = world();
    w.tick = 500;
    // A command while paused mutates the world in place without advancing the tick; the identity key
    // is what makes the next read see it.
    const before = computeLogisticsOverlayCached({ ...w } as WorldState);
    const mutated = { ...w, buildings: [...w.buildings] } as WorldState;
    const after = computeLogisticsOverlayCached(mutated);

    expect(after).not.toBe(before);
    expect(after).toEqual(computeLogisticsOverlay(mutated));
  });
});

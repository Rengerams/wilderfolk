/**
 * The logistics projection is memoised per world revision: the cache is keyed on world identity plus
 * tick, so camera lerps and paused-world mutations do not re-run it per frame.
 */
import { describe, expect, it } from 'vitest';
import {
  computeLogisticsOverlay,
  computeLogisticsOverlayCached,
  resetLogisticsOverlayCache,
} from '../src/game/logisticsOverlayData';
import { initGame } from '../src/game/worldGen';
import { BuildingType, MapSize, type Building, type WorldState } from '../src/game/gameTypes';

function world(): WorldState {
  return initGame({ size: MapSize.Medium, villageName: 'Logistics', seed: 20260929 });
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

  it('recomputes after the mutation boundary resets it at an unchanged tick', () => {
    resetLogisticsOverlayCache();
    const w = world();
    w.tick = 500;
    const before = computeLogisticsOverlayCached(w);

    // A command while paused mutates the world in place without advancing the tick. The memo
    // cannot detect that by itself; the mutation boundary is what must drop it.
    const extra = {
      id: 999001,
      type: BuildingType.House,
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      completed: true,
      occupants: [],
    } as unknown as Building;
    w.buildings.push(extra);
    expect(computeLogisticsOverlayCached(w)).toBe(before);

    resetLogisticsOverlayCache(); // GameLoop.invalidateRenderSnapshot does this
    const after = computeLogisticsOverlayCached(w);

    expect(after).not.toBe(before);
    expect(after).toEqual(computeLogisticsOverlay(w));
    expect(after.poorlyConnected.length).toBe(before.poorlyConnected.length + 1);
  });
});

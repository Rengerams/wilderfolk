/**
 * A new session's opening view starts on the camp: both `camera` and `camera.target`
 * sit there, because `focusCameraOn` moves only the target.
 */
import { describe, it, expect } from 'vitest';
import { MapSize } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createInitialView, createInitialViewForWorld } from '../src/game/viewState';

const MAP = { seed: 407992, size: MapSize.Medium } as const;

describe('a new session opens on the camp', () => {
  it('places the camera itself at the camp, not only its target', () => {
    const world = initGame(MAP);
    if (!world.worldMap) throw new Error('worldgen built no map');
    // A camp off the centre, as a coastal start gives when the centre is sea.
    const camp = { x: world.width * 0.25, y: world.height * 0.3 };
    world.worldMap.campSite = camp;

    const view = createInitialViewForWorld(world);

    expect(view.camera.x).toBe(camp.x);
    expect(view.camera.y).toBe(camp.y);
    expect(view.camera.targetX).toBe(camp.x);
    expect(view.camera.targetY).toBe(camp.y);
  });

  it('falls back to the standard opening view when the map carries no camp', () => {
    const world = initGame(MAP);
    if (world.worldMap) delete world.worldMap.campSite;

    expect(createInitialViewForWorld(world)).toEqual(createInitialView(world.width, world.height));
  });
});

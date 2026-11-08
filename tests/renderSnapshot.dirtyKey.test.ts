/**
 * GFX-02/GFX-03: the render snapshot key must cover every preference the snapshot reads, so the
 * F4 logistics overlay and the juice-effects toggle update while the world is paused.
 */
import { describe, expect, it } from 'vitest';
import { renderSnapshotDirtyKey } from '../src/game/renderSnapshot';
import { saveJuiceEffectsEnabled } from '../src/game/preferences';
import { Season, type WorldState } from '../src/game/gameTypes';
import type { ViewState } from '../src/game/viewState';

function pausedWorld(): WorldState {
  return {
    tick: 42,
    paused: true,
    season: Season.Spring,
    floatingTexts: [],
    bigNews: [],
    deathParticles: [],
    visitorGroups: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    buildings: [],
    entities: [],
  } as unknown as WorldState;
}

function baseView(): ViewState {
  return {
    camera: { x: 100, y: 100, zoom: 1 },
    screenShake: 0,
    showGrid: false,
    showPaths: false,
    showLogistics: false,
  } as unknown as ViewState;
}

describe('render snapshot cache identity', () => {
  it('rebuilds when the F4 logistics overlay is toggled while paused', () => {
    const world = pausedWorld();
    const off = renderSnapshotDirtyKey(world, baseView(), 'obj');
    const on = renderSnapshotDirtyKey(world, { ...baseView(), showLogistics: true }, 'obj');

    expect(on).not.toBe(off);
  });

  it('rebuilds when the juice-effects preference changes while paused', () => {
    const world = pausedWorld();
    saveJuiceEffectsEnabled(true);
    const enhanced = renderSnapshotDirtyKey(world, baseView(), 'obj');
    saveJuiceEffectsEnabled(false);
    const reduced = renderSnapshotDirtyKey(world, baseView(), 'obj');

    expect(reduced).not.toBe(enhanced);
    saveJuiceEffectsEnabled(true);
  });
});

import { describe, expect, it } from 'vitest';
import { discardSpotlightReturn, takeSpotlightReturn } from '../src/components/spotlightReturnState';

describe('spotlight presentation state across colony sessions', () => {
  it('consumes the old camera and pause controls at most once on ordinary completion', () => {
    const old = { id: 'scene-1', camera: { x: 20, y: 80 }, favoriteEntityId: 6, paused: true, speed: 4 };
    const snapshot: { current: typeof old | null } = { current: old };
    expect(takeSpotlightReturn(snapshot)).toEqual(old);
    expect(takeSpotlightReturn(snapshot)).toBeNull();
  });

  it('discards an old scene when a new save is loaded before restoring its settings', () => {
    const old = { id: 'scene-from-valley-A', camera: { x: 650, y: 120 }, paused: false, speed: 10 };
    const snapshot: { current: typeof old | null } = { current: old };
    const loaded = { camera: { x: 12, y: 34 }, paused: true, speed: 1 };
    discardSpotlightReturn(snapshot);
    expect(takeSpotlightReturn(snapshot)).toBeNull();
    expect(loaded).toEqual({ camera: { x: 12, y: 34 }, paused: true, speed: 1 });
  });

  it('does not retain a previous scene when starting a different colony', () => {
    const snapshot: { current: { id: string; paused: boolean } | null } = {
      current: { id: 'old-colony-scene', paused: false },
    };
    discardSpotlightReturn(snapshot);
    snapshot.current = { id: 'new-colony-scene', paused: true };
    expect(takeSpotlightReturn(snapshot)).toEqual({ id: 'new-colony-scene', paused: true });
  });
});

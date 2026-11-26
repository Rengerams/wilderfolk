import { describe, expect, it } from 'vitest';
import { atlasSourceRect, sandWaterOverlaySourceRect } from '../src/game/terrainAtlas';
import { canAfford, consumeResources } from '../src/game/resourceUtils';
import type { WorldState } from '../src/game/gameTypes';

describe('retained independent contracts', () => {
  it('uses the correct column count for each texture atlas', () => {
    expect(atlasSourceRect(5)).toEqual({ sx: 80, sy: 0 });
    expect(sandWaterOverlaySourceRect(5)).toEqual({ sx: 16, sy: 16 });
  });

  it('keeps affordability read-only and resource consumption atomic', () => {
    const state = { resources: { wood: 10, food: 5 } } as WorldState;
    expect(canAfford(state, { wood: 4, food: 2 })).toBe(true);
    expect(state.resources).toEqual({ wood: 10, food: 5 });
    expect(consumeResources(state, { wood: 4, food: 6 })).toBe(false);
    expect(state.resources).toEqual({ wood: 10, food: 5 });
    expect(consumeResources(state, { wood: 4, food: 2 })).toBe(true);
    expect(state.resources).toEqual({ wood: 6, food: 3 });
  });
});

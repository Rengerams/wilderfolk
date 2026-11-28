import { clampToMapBounds } from '../src/game/mapBounds';
import { describe, expect, it } from 'vitest';
import { isFootprintWithinMapBounds } from '../src/game/placementUtils';

describe('A13 — footprint bounds have one implementation owner', () => {

  it('uses the placement owner rule at the inset edge', () => {
    expect(isFootprintWithinMapBounds(10, 10, 5, 5, 100, 100)).toBe(false);
    expect(isFootprintWithinMapBounds(10, 10, 11, 11, 100, 100)).toBe(true);
  });
});

describe('L44 map bounds clamp', () => {
  it('resets non-finite positions instead of letting NaN through', () => {
    const nan = { x: Number.NaN, y: Number.NaN };
    clampToMapBounds(nan, 200, 100);
    expect(nan.x).toBe(0);
    expect(nan.y).toBe(0);

    // Ordinary over-the-edge positions still clamp to the map rectangle.
    const outside = { x: -5, y: 300 };
    clampToMapBounds(outside, 200, 100);
    expect(outside.x).toBe(0);
    expect(outside.y).toBe(100);
  });
});

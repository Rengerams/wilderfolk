/**
 * The build catalogue's copy states no static barricade numbers. The day-index half of this rule
 * lives in `scripts/check-source-guards.mjs`.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';

describe('catalogue copy keeps its owner (L2)', () => {
  it('states no barricade numbers in the build catalogue copy (L2)', () => {
    const wall = BUILDING_CONFIGS[BuildingType.Wall];
    const watchtower = BUILDING_CONFIGS[BuildingType.Watchtower];

    expect(wall.description).toBeTruthy();
    expect(watchtower.description).toBeTruthy();
    // "+8", "cap +72", "+15" — numbers the owners can change and this copy cannot follow.
    expect(wall.description).not.toMatch(/\+\d/);
    expect(watchtower.description).not.toMatch(/\+\d/);
  });
});

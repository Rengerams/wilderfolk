/**
 * Source-level guards that two rules keep their single owner: the build catalogue's copy states no
 * static barricade numbers, and the day index comes from `getColonyDay` rather than a restated 360.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuildingType } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

describe('catalogue copy and the day index keep their owners (L2, L7)', () => {
  it('states no barricade numbers in the build catalogue copy (L2)', () => {
    const wall = BUILDING_CONFIGS[BuildingType.Wall];
    const watchtower = BUILDING_CONFIGS[BuildingType.Watchtower];

    expect(wall.description).toBeTruthy();
    expect(watchtower.description).toBeTruthy();
    // "+8", "cap +72", "+15" — numbers the owners can change and this copy cannot follow.
    expect(wall.description).not.toMatch(/\+\d/);
    expect(watchtower.description).not.toMatch(/\+\d/);
  });

  it('derives the day index from getColonyDay, not a restated 360 (L7)', () => {
    for (const file of ['src/game/rivalEvents.ts', 'src/game/temperature.ts']) {
      const src = read(file);
      expect(src, `${file} restates the day index`).not.toMatch(/\*\s*360\b/);
      expect(src, `${file} does not use the owner`).toMatch(/getColonyDay/);
    }
  });
});

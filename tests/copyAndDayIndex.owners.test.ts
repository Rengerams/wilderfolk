/**
 * Two "the rule already has an owner" guards from the 2026-09-16 economy audit.
 *
 * Tracked in `LIVE-FINDINGS-STATUS.md`. Both are the same shape as M1/M5/L5: a second expression of a
 * rule that already had one definition.
 *
 * - **L2** — the wall cap and watchtower bonus were restated in the build catalogue's player-visible
 *   copy (`buildings.ts` descriptions) while the owners are `defenseStructures.getWallSegmentCap`
 *   (a cap that wall plates raise) and the ballista forge bonus (which raises the tower's strength).
 *   The static numbers were a third definition that no upgrade could update, so they are gone.
 * - **L7** — the day index was written as `year * 360 + dayInYear` in two places, duplicating
 *   `DAYS_PER_YEAR`; `getColonyDay` is the owner. (`temperature.ts` carried the same expression and
 *   was fixed with it.)
 *
 * Source-level guards, deliberately narrow: the first fails if a stale barricade number returns to the
 * catalogue copy, the second if the literal day index returns to either file.
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

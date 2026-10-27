/**
 * F23 — a building's camera focus targeted the footprint corner, not the building
 * (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * Three call sites passed `x + width/2, y + height/2` to `onFocusBuilding(buildingId, cx, cy)` — adding
 * half a footprint to a value that **is already the centre** — so "center map on the Blacksmith" landed
 * half a building away from the building the button names. The convention is settled by the consumers:
 * the pad and sprite are drawn from `x - w/2`/`y - h/2` (`spriteDrawing.drawBuildingPad`),
 * `placementUtils.overlapsAnyBuilding` compares `b.x ± b.width/2`, `isFootprintWithinMapBounds` and
 * `isFootprintOnBuildableTerrain` take `x ± w/2`, and `snapBuildingCenter` + `createBuilding` store the
 * cursor's centre unchanged. `getBuildingCenter` now names that in one place, and the sites call it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getBuildingCenter,
  isFootprintWithinMapBounds,
  MAP_EDGE_INSET,
} from '../src/game/placementUtils';
import type { Building } from '../src/game/gameTypes';

const MAP_W = 1000;
const MAP_H = 1000;

function building(x: number, y: number, width = 80, height = 60): Building {
  return { id: 1, x, y, width, height } as Building;
}

describe('a building is centred on its own x/y', () => {
  it('returns the stored point, not a corner', () => {
    expect(getBuildingCenter(building(400, 500))).toEqual({ x: 400, y: 500 });
    expect(getBuildingCenter(building(400, 500, 120, 40))).toEqual({ x: 400, y: 500 });
  });

  it('agrees with the bounds rule, which the half-footprint offset did not', () => {
    // Flush with the right edge: legal at the centre, out of bounds a half-footprint further right —
    // which is the place a focus call adding `width/2` was asking the camera to look at.
    const flush = building(MAP_W - MAP_EDGE_INSET - 40, 500);
    expect(isFootprintWithinMapBounds(flush.width, flush.height, flush.x, flush.y, MAP_W, MAP_H)).toBe(true);
    expect(
      isFootprintWithinMapBounds(flush.width, flush.height, flush.x + flush.width / 2, flush.y, MAP_W, MAP_H),
      'the shifted point is a different place',
    ).toBe(false);
  });

  it('leaves no focus caller adding half a footprint', () => {
    const files = [
      'src/game/priorityAlerts.ts',
      'src/game/focusHints.ts',
      'src/components/tabPanels/VillageTabPanel.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, `${file} focuses a corner again`).not.toMatch(/\.(x|y) \+ \w+\.(width|height) \/ 2/);
      expect(source, `${file} does not ask for the centre`).toContain('getBuildingCenter(');
    }
  });
});

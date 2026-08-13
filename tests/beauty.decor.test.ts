/**
 * Phase 3.2 — decorations & beauty. Decor buildings stamp a neighborhood
 * beauty grid, settlers drift toward pretty spots, and village happiness
 * reads out from beauty under settlers.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CATEGORIES } from '../src/game/buildCatalog';
import { STRIP_BUILD_TYPES } from '../src/game/stripBuild';
import { BuildingType } from '../src/game/buildings';
import {
  HAPPINESS_BASE,
  HAPPINESS_PER_BEAUTY,
  beautyAt,
  computeVillageHappiness,
  createBeautyGrid,
  isDecorType,
  pickBeautySpot,
  rebuildBeautyGrid,
} from '../src/game/beautyGrid';
import { TERRAIN_TILE_SIZE } from '../src/game/gameTypes';

const DECOR_TYPES = [BuildingType.Garden, BuildingType.Statue, BuildingType.Lamp, BuildingType.Fence];

function game() {
  return initGame({ villageName: 'D', size: 'small' });
}

function addDecor(state: ReturnType<typeof game>, type: BuildingType, x: number, y: number): void {
  state.buildings.push({
    id: state.nextBuildingId++,
    type,
    x,
    y,
    width: 40,
    height: 36,
    rotation: 0,
    completed: true,
    faction: 'player',
    occupants: [],
    constructionProgress: 100,
    level: 1,
    spriteScale: 1,
  } as never);
}

describe('decor buildings', () => {
  it('all four decor types are marked decor and buildable from the catalog', () => {
    for (const t of DECOR_TYPES) expect(isDecorType(t)).toBe(true);
    const decorCategory = BUILDING_CATEGORIES.find((c) => c.id === 'decor');
    expect(decorCategory).toBeDefined();
    for (const t of DECOR_TYPES) expect(decorCategory!.types).toContain(t);
  });

  it('the fence is a strip building (rotates like walls/roads)', () => {
    expect(STRIP_BUILD_TYPES.has(BuildingType.Fence)).toBe(true);
  });
});

describe('beauty grid', () => {
  it('stamps beauty around a garden and nothing far away', () => {
    const state = game();
    addDecor(state, BuildingType.Garden, 100, 100);
    const map = state.worldMap!;
    const grid = rebuildBeautyGrid(state, map.width, map.height);
    // The garden's own tile is the prettiest
    expect(beautyAt(grid, 100, 100)).toBeGreaterThan(0);
    // 10 tiles away: outside the 3-tile falloff
    expect(beautyAt(grid, 100 + TERRAIN_TILE_SIZE * 10, 100)).toBe(0);
  });

  it('a statue (beauty 5) outshines a lamp (beauty 2) at the same spot', () => {
    const state = game();
    addDecor(state, BuildingType.Statue, 200, 200);
    const map = state.worldMap!;
    const grid = rebuildBeautyGrid(state, map.width, map.height);
    const statue = beautyAt(grid, 200, 200);
    const state2 = game();
    addDecor(state2, BuildingType.Lamp, 200, 200);
    const grid2 = rebuildBeautyGrid(state2, map.width, map.height);
    expect(beautyAt(grid2, 200, 200)).toBeLessThan(statue);
  });

  it('pickBeautySpot finds the pretty corner over an empty one', () => {
    const state = game();
    addDecor(state, BuildingType.Garden, 300, 300);
    const map = state.worldMap!;
    const grid = rebuildBeautyGrid(state, map.width, map.height);
    const spot = pickBeautySpot(grid, 250, 250, 8);
    expect(Math.hypot(spot.x - 300, spot.y - 300)).toBeLessThan(TERRAIN_TILE_SIZE * 2);
  });

  it('pickBeautySpot without a grid falls back to the center', () => {
    expect(pickBeautySpot(null, 123, 456)).toEqual({ x: 123, y: 456 });
  });
});

describe('village happiness', () => {
  it('is the base value with no beauty and rises with beauty under settlers', () => {
    const grid = createBeautyGrid(20, 20);
    expect(computeVillageHappiness(grid, [{ x: 50, y: 50 }])).toBe(HAPPINESS_BASE);

    // Plant one unit of beauty under the settler
    grid.values[5 * 20 + 5] = 10;
    const expected = HAPPINESS_BASE + 10 * HAPPINESS_PER_BEAUTY;
    expect(computeVillageHappiness(grid, [{ x: 55, y: 55 }])).toBe(expected);
    expect(computeVillageHappiness(grid, [])).toBe(HAPPINESS_BASE);
  });

  it('clamps to 0–100', () => {
    const grid = createBeautyGrid(20, 20);
    grid.values[5 * 20 + 5] = 127;
    expect(computeVillageHappiness(grid, [{ x: 55, y: 55 }])).toBe(100);
  });
});

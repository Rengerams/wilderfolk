/**
 * Compact saves and the valley they came from.
 *
 * A compact save is a reference: it stores `seed`, `preset`, `size` and the dimensions, and the whole
 * valley is regenerated on load. That reference was incomplete — it recorded no terrain noise seed —
 * so a change to how the seed is derived repainted every existing settlement. The owner's played
 * valley became a different one, and its own water-dependent placements are the proof: a Fishing Spot
 * may only be placed where its footprint holds water, and 13 of 13 were left standing on dry land.
 *
 * These cases pin all three halves of the repair: a save that records the seed regenerates exactly
 * that valley; a save written before the seed was recorded falls back to the pre-change noise seed
 * when its own completed fishing dock proves the current rule is wrong; and a save with no such
 * witness pays for one worldgen only.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, MAP_SIZE_DIMENSIONS, MapPreset, MapSize, PATH_CELL, type WorldMap } from '../src/game/gameTypes';
import { Walkability } from '../src/game/terrain/terrainGrid';
import { legacyTerrainSeed } from '../src/game/terrain/terragen';
import { generateWorldMap } from '../src/game/terrainGen';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';

/** The real generator, not a fixture, so the case is measured against the shipped rules. */
const PRESET = MapPreset.Oasis;
const SIZE = MapSize.Large;
const SEED: number = 6422;
/** The shipped pixel size of `SIZE`, so both rules can be asked for the same map. */
const DIMENSIONS = MAP_SIZE_DIMENSIONS[SIZE];

/**
 * A completed Fishing Spot centred on a water cell of `map`, with the shipped footprint.
 *
 * Only a preset/size pair whose two seed rules disagree is worth using: the first water cell of the
 * legacy map is a dock whose own placement rule holds under one rule and not the other.
 */
function fishingSpotOnWater(map: WorldMap, id: number): Record<string, unknown> {
  for (let ty = 1; ty < map.height - 1; ty++) {
    for (let tx = 1; tx < map.width - 1; tx++) {
      if (map.pathGrid?.[ty * map.width + tx] !== Walkability.Water) continue;
      return {
        id,
        type: BuildingType.FishingSpot,
        // `building.x/y` is the footprint centre, so the water cell sits under the dock.
        x: tx * PATH_CELL + PATH_CELL / 2,
        y: ty * PATH_CELL + PATH_CELL / 2,
        width: 52,
        height: 40,
        occupants: [],
        level: 1,
        constructionProgress: 100,
        completed: true,
        health: 100,
        maxHealth: 100,
        spriteScale: 1,
        buildAnimTimer: 0,
      };
    }
  }
  throw new Error('the map has no water cell to place a fishing spot on');
}

/**
 * A save built from a real generated world, with its compact map record overridden.
 *
 * `terrainSeed: null` drops the recorded seed, which is exactly what a save written before it was
 * recorded looks like on the wire.
 */
function syntheticSave(options: {
  terrainSeed: number | null;
  buildings?: Record<string, unknown>[];
}): Record<string, unknown> {
  const world = initGame({ seed: SEED, size: SIZE, preset: PRESET });
  const save = buildSaveData(world, createInitialView(world.width, world.height));
  const worldMap = { ...(save.worldMap as Record<string, unknown>) };
  if (options.terrainSeed === null) delete worldMap._terrainSeed;
  else worldMap._terrainSeed = options.terrainSeed;
  const payload: Record<string, unknown> = { ...save, worldMap };
  if (options.buildings) payload.buildings = options.buildings;
  return payload;
}

/** Save → wire → parse → load, exactly as the player's "Load from file" does. */
function loadThroughParse(
  payload: Record<string, unknown>,
): NonNullable<ReturnType<typeof loadGameFromParsed>> {
  const parsed = parseSaveJson(JSON.stringify(payload));
  expect(parsed.valid).toBe(true);
  if (!parsed.valid) throw new Error('save refused at parse');
  const loaded = loadGameFromParsed(parsed.parsed);
  expect(loaded).not.toBeNull();
  if (!loaded) throw new Error('save did not load');
  return loaded;
}

function waterCells(map: WorldMap): number {
  let count = 0;
  const grid = map.pathGrid;
  if (!grid) return 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === Walkability.Water) count++;
  }
  return count;
}

/** Whether the regenerated ground under a world point is water. */
function waterAt(map: WorldMap, worldX: number, worldY: number): boolean {
  const tx = Math.floor(worldX / PATH_CELL);
  const ty = Math.floor(worldY / PATH_CELL);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  return map.pathGrid?.[ty * map.width + tx] === Walkability.Water;
}

describe('a compact save regenerates the valley it was saved from', () => {
  it('honours the terrain seed the save records', () => {
    const original = initGame({ seed: SEED, size: SIZE, preset: PRESET }).worldMap!;
    expect(original.terrainSeed, 'a generated map records its noise seed').toBeTypeOf('number');

    const loaded = loadThroughParse(syntheticSave({ terrainSeed: original.terrainSeed! }));
    const restored = loaded.world.worldMap!;
    const expected = generateWorldMap(
      loaded.world.width,
      loaded.world.height,
      SEED,
      SIZE,
      PRESET,
      original.terrainSeed,
    );

    expect(restored.terrainSeed).toBe(original.terrainSeed);
    expect(restored.width).toBe(expected.width);
    expect(restored.height).toBe(expected.height);
    expect(waterCells(restored)).toBe(waterCells(expected));
    expect(waterCells(restored), 'the recorded seed is a real valley, not all land').toBeGreaterThan(0);
    expect(Array.from(restored.pathGrid!)).toEqual(Array.from(expected.pathGrid!));
  });

  it('repairs a save written before the seed was recorded, using its own fishing dock as the witness', () => {
    // The same seed + size under the current rule and the pre-offset rule are two different valleys,
    // and this is the exact pair the owner's save fell between.
    const current = generateWorldMap(DIMENSIONS.width, DIMENSIONS.height, SEED, SIZE, PRESET);
    const legacy = generateWorldMap(
      DIMENSIONS.width,
      DIMENSIONS.height,
      SEED,
      SIZE,
      PRESET,
      legacyTerrainSeed(SEED),
    );
    expect(current.terrainSeed).not.toBe(legacy.terrainSeed);
    expect(Array.from(current.pathGrid!)).not.toEqual(Array.from(legacy.pathGrid!));

    const spot = fishingSpotOnWater(legacy, 448);
    expect(
      waterAt(current, spot.x as number, spot.y as number),
      'the witness must be dry under the current rule, or this case proves nothing',
    ).toBe(false);
    expect(waterAt(legacy, spot.x as number, spot.y as number)).toBe(true);

    const loaded = loadThroughParse(syntheticSave({ terrainSeed: null, buildings: [spot] }));
    const restored = loaded.world.worldMap!;

    expect(restored.terrainSeed, 'the legacy noise seed was used').toBe(legacy.terrainSeed);
    expect(Array.from(restored.pathGrid!)).toEqual(Array.from(legacy.pathGrid!));
    expect(waterAt(restored, spot.x as number, spot.y as number)).toBe(true);
    expect(waterCells(restored)).toBe(waterCells(legacy));
    expect(waterCells(restored)).not.toBe(waterCells(current));
  });

  it('does not pay for a second worldgen when the save has no water-dependent placement', () => {
    const current = generateWorldMap(DIMENSIONS.width, DIMENSIONS.height, SEED, SIZE, PRESET);
    const loaded = loadThroughParse(syntheticSave({ terrainSeed: null }));
    const restored = loaded.world.worldMap!;

    expect(
      loaded.world.buildings.filter((building) => building.type === BuildingType.FishingSpot),
    ).toEqual([]);
    expect(restored.terrainSeed, 'the current rule stands').toBe(current.terrainSeed);
    expect(waterCells(restored)).toBe(waterCells(current));
    expect(Array.from(restored.pathGrid!)).toEqual(Array.from(current.pathGrid!));
  });
});

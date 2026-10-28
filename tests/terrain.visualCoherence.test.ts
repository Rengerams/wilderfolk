import { describe, expect, it } from 'vitest';
import { EntityType, MapPreset, MapSize, TerrainType, type WorldMap } from '../src/game/gameTypes';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { WATER_CELL, tileAt } from '../src/game/terrain/terrainGrid';
import { initGame } from '../src/game/worldGen';
import { buildWhittakerFields } from '../src/game/renderer/whittakerTerrain';

describe('landscape rendering follows the simulation map', () => {
  it('places biome-appropriate props rather than unrelated vegetation or river clutter', () => {
    const desertProps = new Set(['cactus', 'rock_small', 'rock_big', 'bones', 'tallgrass']);
    const forestProps = new Set(['bush', 'fern', 'flower', 'stump', 'mushroom', 'log', 'berries', 'dirt_patch']);
    let checked = 0;
    let checkedDesert = 0;
    for (const preset of [MapPreset.Arabia, MapPreset.BlackForest, MapPreset.Rivers]) {
      const map = generateRawTerrain(1280, 960, 1234, MapSize.Medium, preset);
      for (const d of map.decorations ?? []) {
        const tile = tileAt(map, Math.floor(d.x / 10), Math.floor(d.y / 10));
        expect(tile, `${preset}: decor must sit on a tile`).toBeDefined();
        expect([TerrainType.DeepWater, TerrainType.ShallowWater, TerrainType.River])
          .not.toContain(tile!.type);
        if (tile!.type === TerrainType.Desert) {
          checkedDesert++;
          expect(desertProps.has(d.type), `${preset}: unexpected ${d.type} on desert`).toBe(true);
        }
        if (tile!.type === TerrainType.Forest || tile!.type === TerrainType.DarkForest) {
          expect(forestProps.has(d.type), `${preset}: unexpected ${d.type} in forest`).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(checkedDesert).toBeGreaterThan(10);
  }, 120_000);

  it('spawns living trees only in vegetated biomes on new maps', () => {
    for (const preset of [MapPreset.Arabia, MapPreset.Oasis, MapPreset.BlackForest]) {
      const world = initGame({ seed: 1234, preset, size: MapSize.Medium });
      expect(world.worldMap?.generationVersion).toBe(3);
      let trees = 0;
      for (const entity of world.entities) {
        if (entity.type !== EntityType.Tree || !entity.alive) continue;
        const tile = tileAt(world.worldMap!, Math.floor(entity.x / 10), Math.floor(entity.y / 10));
        expect([TerrainType.Grassland, TerrainType.Forest, TerrainType.DarkForest, TerrainType.RiverBank])
          .toContain(tile?.type);
        trees++;
      }
      expect(trees, `${preset}: trees should exist on suitable ground`).toBeGreaterThan(0);
    }
  }, 120_000);

  it('fills the space between drainage points rather than stamping disconnected discs', () => {
    const map = generateRawTerrain(1280, 960, 1234, MapSize.Medium, MapPreset.Rivers);
    expect(map.rivers?.length).toBeGreaterThan(0);
    let segments = 0;
    for (const line of map.rivers!) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!, b = line[i]!;
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        const cx = Math.min(map.waterCols! - 1, Math.floor(x / WATER_CELL));
        const cy = Math.min(map.waterRows! - 1, Math.floor(y / WATER_CELL));
        expect(map.riverDist![cy * map.waterCols! + cx], `river gap at ${x},${y}`)
          .toBeGreaterThan(0.30);
        segments++;
      }
    }
    expect(segments).toBeGreaterThan(10);
  }, 120_000);

  it('creates a nonzero horizon shadow inside a mountain bowl, but none on flat ground', () => {
    const make = (ridge: boolean): WorldMap => {
      const elevation = new Float32Array(9 * 9).fill(0.60);
      if (ridge) {
        for (let y = 2; y <= 6; y++) {
          elevation[y * 9 + 2] = 0.95;
          elevation[y * 9 + 6] = 0.95;
        }
      }
      return { cols: 9, rows: 9, elevation, terrain: new Uint8Array(81),
        seaLevel: 0.20 } as unknown as WorldMap;
    };
    const flat = buildWhittakerFields(make(false));
    const mountain = buildWhittakerFields(make(true));
    expect(flat).not.toBeNull();
    expect(mountain).not.toBeNull();
    expect(flat!.skyOcclusion[4 * 9 + 4]).toBe(0);
    expect(mountain!.skyOcclusion[4 * 9 + 4]).toBeGreaterThan(0);
  });
});

/**
 * Real `WorldMap` fixtures for tests.
 *
 * Teraforge's four-layer model keeps **no** `TerrainTile[][]`: a tile is projected from the L2
 * continuous fields on demand, and post-generation edits live in the sparse `WorldMap.overrides`
 * layer with the L0/L1 grids rebaked to match. Tests used to build maps by hand as
 * `{ tiles, width, height, seed, preset }`, which the model no longer has — but a hand-built map
 * is the right shape for a test that needs *exact* terrain, so this helper builds one honestly:
 * it supplies the continuous fields and lets the production projection classify the tiles.
 *
 * Overrides go through the production write path (`setTileOverride` + `rebakeTerrainGrids`), so a
 * fixture cannot accidentally disagree with what the walkability and build grids believe about
 * the same ground.
 */
import { MapPreset, MapSize, TerrainType } from '../game/gameTypes';
import type { WorldMap } from '../game/gameTypes';
import { generateRawTerrain } from '../game/terrain/terragen';
import {
  DEFAULT_MOISTURE_FOREST,
  rebakeTerrainGrids,
  setTileOverride,
} from '../game/terrain/terrainGrid';

export interface TestMapOptions {
  /** Tile size. World pixels are `tilesX * 10` by `tilesY * 10` — the L0 grid's own resolution. */
  tilesX: number;
  tilesY: number;
  seed?: number;
  preset?: MapPreset;
  /**
   * Per-tile terrain override. Return `undefined` to leave the projected type alone; return a
   * type to pin that tile (used by the walkability, placement and movement fixtures).
   */
  tileType?: (tx: number, ty: number) => TerrainType | undefined;
  /**
   * Per-cell river-distance override, in 64px cell coordinates. Any value above 0.55 classifies
   * the tile as `River`, and the projection samples bilinearly, so a caller that wants a blocked
   * column at tile `T` should light up the cells around `T / 6.4` rather than only one cell.
   */
  riverDist?: (cx: number, cy: number) => number | undefined;
}

/**
 * A small, deterministic map whose default land classifies as `Grassland`.
 *
 * The climate defaults are chosen so the projection lands on open grass: moisture below the
 * forest cut and temperature above the taiga band. `generateRawTerrain` supplies the base arrays,
 * so the result carries every field the production readers touch.
 */
export function testWorldMap(options: TestMapOptions): WorldMap {
  const { tilesX, tilesY, seed = 1, preset = MapPreset.Continental } = options;

  // Sized to exactly these tiles, so the generated cell grid is never larger than the map asked for.
  const map = generateRawTerrain(tilesX * 10, tilesY * 10, seed, MapSize.Medium, preset);

  // Open grassland: dry enough to miss the forest cut, warm enough to miss the taiga band, flat
  // enough that no cliff or slope rule fires, and with no river anywhere.
  map.moisture!.fill(DEFAULT_MOISTURE_FOREST - 0.1);
  map.temperature!.fill(0.5);
  map.elevation!.fill(0.4);
  map.riverDist!.fill(0);

  if (options.riverDist) {
    const cols = map.cols!;
    const rows = map.rows!;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const value = options.riverDist(cx, cy);
        if (value !== undefined) map.riverDist![cy * cols + cx] = value;
      }
    }
  }

  if (options.tileType) {
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const type = options.tileType(tx, ty);
        if (type === undefined) continue;
        setTileOverride(map, tx, ty, { type, elevation: 40, moisture: 45, variation: 0.5 });
      }
    }
  }

  // One whole-map rebake: a fixture edits terrain everywhere, so this is the production
  // "terrain changed here" call asked once for the whole grid.
  rebakeTerrainGrids(map, {
    startTx: 0,
    endTx: map.width - 1,
    startTy: 0,
    endTy: map.height - 1,
    margin: 0,
  });
  return map;
}

/** A blocked column at tile `tx`, spanning every row. */
export function blockedColumn(tx: number): TestMapOptions['tileType'] {
  return (x: number) => (x === tx ? TerrainType.River : undefined);
}

/** A blocked row at tile `ty`, spanning every column. */
export function blockedRow(ty: number): TestMapOptions['tileType'] {
  return (_x: number, y: number) => (y === ty ? TerrainType.River : undefined);
}

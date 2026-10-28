/**
 * Presentation/ecology weights for biome fringes. These do NOT classify tiles or
 * alter pathfinding: terrainGrid remains the single gameplay terrain owner.
 * World generation revision 4 uses them for gradual tree and ground-prop distributions.
 */
import { TerrainType, type WorldMap } from '../gameTypes';
import { COLD_TEMPERATURE, DEFAULT_MOISTURE_FOREST, DEFAULT_SEA_LEVEL, LAND_BANDS, TERRAIN_CELL, WATER_CELL, sampleElev } from './terrainGrid';
import { clamp } from './noise';

const smooth = (v: number): number => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};

export interface EcotoneClimate {
  forest: number;
  denseForest: number;
  dry: number;
  riparian: number;
  alpineFade: number;
}

/**
 * Continuous climate fractions at a world point. Every sample uses canonical
 * map fields; labels only forbid invalid habitats such as open water.
 */
export function sampleEcotone(map: WorldMap, x: number, y: number): EcotoneClimate {
  const { cols, rows, elevation, moisture, temperature, riverDist } = map;
  if (!cols || !rows || !elevation || !moisture || !temperature) {
    return { forest: 0, denseForest: 0, dry: 0, riparian: 0, alpineFade: 1 };
  }
  const cx = x / TERRAIN_CELL, cy = y / TERRAIN_CELL;
  const mo = sampleElev(moisture, cols, rows, cx, cy);
  const te = sampleElev(temperature, cols, rows, cx, cy);
  const e = sampleElev(elevation, cols, rows, cx, cy);
  const sea = map.seaLevel ?? DEFAULT_SEA_LEVEL;
  const hn = (e - sea) / Math.max(0.01, 1 - sea);
  const forestCut = map.moistureForestThreshold ?? DEFAULT_MOISTURE_FOREST;
  const denseCut = map.moistureDarkForestThreshold ?? forestCut + 0.12;
  const humidityForest = smooth((mo - (forestCut - 0.12)) / 0.24);
  const humidityDense = smooth((mo - (denseCut - 0.1)) / 0.20);
  // Taiga is a cold forest even in moderately dry air: soften the temperature threshold.
  const cold = smooth((COLD_TEMPERATURE + 0.06 - te) / 0.12);
  const forest = Math.max(humidityForest, cold * 0.72);
  const denseForest = Math.max(humidityDense * forest, cold * 0.55 * forest);
  const dry = smooth(((forestCut - 0.14) + 0.08 - mo) / 0.20)
    * smooth((te - 0.52) / 0.28);
  const alpineFade = 1 - smooth((hn - (LAND_BANDS.hills - 0.08)) / 0.16);
  const wCols = map.waterCols ?? cols;
  const wRows = map.waterRows ?? rows;
  const rd = riverDist
    ? sampleElev(riverDist, wCols, wRows, x / WATER_CELL, y / WATER_CELL) : 0;
  const riparian = smooth((rd - 0.035) / 0.37);
  return { forest, denseForest, dry, riparian, alpineFade };
}

export function treeEcotoneAt(map: WorldMap, x: number, y: number, type: TerrainType): { density: number; tallChance: number } {
  if (type !== TerrainType.Grassland && type !== TerrainType.Forest
    && type !== TerrainType.DarkForest && type !== TerrainType.RiverBank) {
    return { density: 0, tallChance: 0 };
  }
  const climate = sampleEcotone(map, x, y);
  // Open grass and forest share one continuous recruitment probability.
  const woodland = 0.035 + 0.365 * climate.forest + 0.14 * climate.denseForest;
  const fringe = type === TerrainType.RiverBank
    ? 0.055 + 0.14 * climate.riparian * climate.forest : woodland;
  const density = clamp(fringe * climate.alpineFade, 0, 0.54);
  const tallChance = clamp(0.24 + 0.56 * climate.denseForest, 0, 1);
  return { density, tallChance };
}

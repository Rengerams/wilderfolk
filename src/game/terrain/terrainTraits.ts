/**
 * What a `TerrainType` is: is this water, and may a structure stand on it. A leaf module, so both
 * `terrainGrid` and `placementUtils` can read the rule without an import cycle.
 */
import { TerrainType } from '../gameTypes';

/**
 * Terrain a structure may not stand on — the placement rule, deliberately separate from the
 * walking rule in `terrainGrid.WALK_BLOCKED_TERRAIN`.
 */
const UNBUILDABLE_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

/** The subset of the above that a Fishing Spot's footprint is *required* to touch. */
const WATER_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
]);

export function isUnbuildableTerrainType(type: TerrainType): boolean {
  return UNBUILDABLE_TERRAIN.has(type);
}

export function isWaterTerrainType(type: TerrainType): boolean {
  return WATER_TERRAIN.has(type);
}

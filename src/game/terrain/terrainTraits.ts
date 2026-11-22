/**
 * Terrain-type properties used by placement, ground reinforcement and map grids. This is the
 * shared leaf owner; L0 walking remains independent in terrainGrid.
 */
import { TerrainType } from '../gameTypes';

/** Only actual water is unbuildable by terrain type. All dry land — including steep, snowy,
 * or riverside terrain — is ordinary buildable ground unless occupied by a structure or decor.
 * Special structure footprints (docks/bridges) still have their own placement constraints.
 */
const WATER_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
]);

/** Ground that a Ground Reinforcement operation can improve; distinct from buildability.
 * Centralized because both preview validation and the terrain-edit command must agree.
 */
const REINFORCEABLE_TERRAIN = new Set<TerrainType>([
  TerrainType.Mountains,
  TerrainType.Snow,
  TerrainType.ShallowWater,
  TerrainType.RiverBank,
]);

export function isWaterTerrainType(type: TerrainType): boolean {
  return WATER_TERRAIN.has(type);
}

export function isReinforceableTerrainType(type: TerrainType): boolean {
  return REINFORCEABLE_TERRAIN.has(type);
}

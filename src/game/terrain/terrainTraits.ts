/**
 * What a `TerrainType` **is**: the two questions every layer asks of it — is this water, and may a
 * structure stand on it.
 *
 * A **leaf module**, for the same reason `simulation/movementSteering.ts` is one. `terrainGrid` needs
 * the unbuildable rule (its L1 build grid is derived from it: `isTileBuildable`, `rebakeBuildCell`)
 * while `placementUtils` needs the tile projection (`tileAt`) out of `terrainGrid` — so the rule sat
 * in a genuine **runtime import cycle of two**, which `npm run audit:deps` reported as
 * *"cycle of 2: src/game/placementUtils.ts → src/game/terrain/terrainGrid.ts"*. The rule has one
 * definition and now lives below both of them.
 */
import { TerrainType } from '../gameTypes';

/**
 * Terrain a structure may not stand on. The **placement** rule, not the walking rule:
 * `terrainGrid.WALK_BLOCKED_TERRAIN` happens to name the same three water types today, but "a settler
 * may cross it" and "a building may sit on it" are separate decisions and are kept separate.
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

import { canBuildLeaderHouse } from './leaderHouseExpansion';
import { type BuildingRotation, getBuildingFootprintForType } from './buildingRotation';
import { BuildingType, PATH_CELL, TerrainType, type Building } from './gameTypes';
import type { ResearchNode } from './gameTypes';
import type { RenderSnapshot } from './renderSnapshot';
import { getBuildingConfig } from './buildingConfig';
import { isWalkableTerrainType, tileAt, Walkability } from './terrain/terrainGrid';
// The "what a terrain type is" pair moved to a leaf so `terrainGrid` can read it without importing
// this module back — that edge was a runtime cycle.
import { isUnbuildableTerrainType, isWaterTerrainType } from './terrain/terrainTraits';

/** Keep building footprints slightly inside the map edge so sprites are not clipped. */
export const MAP_EDGE_INSET = 1;

function footprintTileIndices(
  left: number,
  right: number,
  top: number,
  bottom: number,
): { startTx: number; endTx: number; startTy: number; endTy: number } {
  return {
    startTx: Math.floor(left / PATH_CELL),
    endTx: Math.ceil(right / PATH_CELL) - 1,
    startTy: Math.floor(top / PATH_CELL),
    endTy: Math.ceil(bottom / PATH_CELL) - 1,
  };
}

export function isFootprintWithinMapBounds(
  width: number,
  height: number,
  x: number,
  y: number,
  mapWidth: number,
  mapHeight: number,
): boolean {
  if (width <= 0 || height <= 0) return false;
  return (
    x - width / 2 >= MAP_EDGE_INSET
    && y - height / 2 >= MAP_EDGE_INSET
    && x + width / 2 <= mapWidth - MAP_EDGE_INSET
    && y + height / 2 <= mapHeight - MAP_EDGE_INSET
  );
}

const RIVER_PLACE_TERRAIN = new Set<TerrainType>([
  TerrainType.River,
  TerrainType.RiverBank,
]);

/**
 * Normal buildings: no water/mountains/snow.
 * Bridges: only river / riverbank (must touch river water, not only bank).
 */
export function isFootprintOnBuildableTerrain(
  snapshot: Pick<RenderSnapshot, 'worldMap'>,
  width: number,
  height: number,
  x: number,
  y: number,
  buildingType?: BuildingType,
): boolean {
  if (width <= 0 || height <= 0) return false;
  if (!snapshot.worldMap) return false;

  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  const { startTx, endTx, startTy, endTy } = footprintTileIndices(left, right, top, bottom);
  const tileW = snapshot.worldMap.width;
  const tileH = snapshot.worldMap.height;

  if (startTx > endTx || startTy > endTy) return false;

  const reinforcement = buildingType === BuildingType.GroundReinforcement;
  const bridge = buildingType === BuildingType.Bridge;
  const fishing = buildingType === BuildingType.FishingSpot;
  const road = buildingType === BuildingType.Road;
  let riverCells = 0;
  let waterCells = 0;
  let cells = 0;
  let unstableCells = 0;

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= tileW || ty >= tileH) return false;
      const tile = tileAt(snapshot.worldMap, tx, ty);
      if (!tile) return false;
      cells++;
      if (reinforcement) {
        if (tile.type === TerrainType.DeepWater || tile.type === TerrainType.River) return false;
        if (isUnbuildableTerrainType(tile.type)) unstableCells++;
      } else if (bridge) {
        // A bridge needs water to span, but may land on the banks/approach like a real deck.
        if (isUnbuildableTerrainType(tile.type) && !RIVER_PLACE_TERRAIN.has(tile.type)) return false;
        if (tile.type === TerrainType.River) riverCells++;
      } else if (fishing) {
        // A fishing dock may straddle land and water — but never mountains/snow.
        if (isUnbuildableTerrainType(tile.type) && !isWaterTerrainType(tile.type)) return false;
        if (isWaterTerrainType(tile.type)) waterCells++;
      } else if (road) {
        const occupancy = snapshot.worldMap.pathGrid?.[ty * tileW + tx];
        if (isWaterTerrainType(tile.type) || !isWalkableTerrainType(tile.type)
          || (occupancy !== undefined && occupancy !== Walkability.Open)) return false;
      } else if (isUnbuildableTerrainType(tile.type)) {
        return false;
      }
    }
  }
  if (reinforcement) return unstableCells > 0;
  if (bridge) {
    // Must span actual river water, not only dry bank
    return riverCells >= 1 && cells > 0;
  }
  if (fishing) {
    // A dock must actually reach the water.
    return waterCells >= 1;
  }
  return true;
}

/** Any completed or in-progress structure blocks placement (including rival camps). */
export function overlapsAnyBuilding(
  buildings: readonly Building[],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (width <= 0 || height <= 0) return false;
  for (const b of buildings) {
    if (
      x + width / 2 > b.x - b.width / 2
      && x - width / 2 < b.x + b.width / 2
      && y + height / 2 > b.y - b.height / 2
      && y - height / 2 < b.y + b.height / 2
    ) {
      return true;
    }
  }
  return false;
}

/** The only overlap exception: perpendicular strips of the same road or solid-wall type. */
export function stripCrossingIsTheOnlyOverlap(
  buildings: readonly Building[],
  x: number,
  y: number,
  width: number,
  height: number,
  type: BuildingType,
): boolean {
  if (type !== BuildingType.Road && type !== BuildingType.Wall) return false;
  let crossed = false;
  for (const building of buildings) {
    const overlaps = x + width / 2 > building.x - building.width / 2
      && x - width / 2 < building.x + building.width / 2
      && y + height / 2 > building.y - building.height / 2
      && y - height / 2 < building.y + building.height / 2;
    if (!overlaps) continue;
    if (building.type !== type || (width > height) === (building.width > building.height)) return false;
    crossed = true;
  }
  return crossed;
}

/**
 * Renderer-only spatial index over building footprints; a query visits only touched cells and
 * returns the same strict-inequality answer as the linear scan. Keyed on array identity + map size.
 */
const OCCUPANCY_CELL_SIZE = 64;

interface BuildingOccupancyIndex {
  array: readonly Building[];
  mapW: number;
  mapH: number;
  cols: number;
  rows: number;
  buckets: Building[][];
}

let occupancyIndex: BuildingOccupancyIndex | null = null;

function getBuildingOccupancyIndex(
  buildings: readonly Building[],
  mapW: number,
  mapH: number,
): BuildingOccupancyIndex {
  if (
    occupancyIndex
    && occupancyIndex.array === buildings
    && occupancyIndex.mapW === mapW
    && occupancyIndex.mapH === mapH
  ) {
    return occupancyIndex;
  }
  const cols = Math.max(1, Math.ceil(mapW / OCCUPANCY_CELL_SIZE));
  const rows = Math.max(1, Math.ceil(mapH / OCCUPANCY_CELL_SIZE));
  const buckets: Building[][] = Array.from({ length: cols * rows }, () => []);
  for (const b of buildings) {
    const left = b.x - b.width / 2;
    const right = b.x + b.width / 2;
    const top = b.y - b.height / 2;
    const bottom = b.y + b.height / 2;
    const minCx = Math.max(0, Math.floor(left / OCCUPANCY_CELL_SIZE));
    const maxCx = Math.min(cols - 1, Math.floor(right / OCCUPANCY_CELL_SIZE));
    const minCy = Math.max(0, Math.floor(top / OCCUPANCY_CELL_SIZE));
    const maxCy = Math.min(rows - 1, Math.floor(bottom / OCCUPANCY_CELL_SIZE));
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        buckets[cy * cols + cx].push(b);
      }
    }
  }
  occupancyIndex = { array: buildings, mapW, mapH, cols, rows, buckets };
  return occupancyIndex;
}

/** Whether `rect` overlaps a building, via the cached index — equal to `overlapsAnyBuilding`. */
function overlapsAnyBuildingIndexed(
  buildings: readonly Building[],
  mapW: number,
  mapH: number,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (width <= 0 || height <= 0 || buildings.length === 0) return false;
  const idx = getBuildingOccupancyIndex(buildings, mapW, mapH);
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  const minCx = Math.max(0, Math.floor(left / OCCUPANCY_CELL_SIZE));
  const maxCx = Math.min(idx.cols - 1, Math.floor(right / OCCUPANCY_CELL_SIZE));
  const minCy = Math.max(0, Math.floor(top / OCCUPANCY_CELL_SIZE));
  const maxCy = Math.min(idx.rows - 1, Math.floor(bottom / OCCUPANCY_CELL_SIZE));
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const bucket = idx.buckets[cy * idx.cols + cx];
      for (let i = 0; i < bucket.length; i++) {
        const b = bucket[i];
        if (
          right > b.x - b.width / 2
          && left < b.x + b.width / 2
          && bottom > b.y - b.height / 2
          && top < b.y + b.height / 2
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * `building.x/y` centre convention comes from the leaf `buildingGeometry`, re-exported here
 * for the codebase's existing import path — one definition, no second source.
 */
export { getBuildingCenter, getBuildingFootprintRect } from './buildingGeometry';

export function isBuildingTechUnlocked(
  techId: string,
  unlockedTechs: readonly string[],
  researchNodes?: readonly ResearchNode[],
): boolean {
  if (!unlockedTechs.includes(techId)) return false;
  if (!researchNodes) return true;
  const node = researchNodes.find((n) => n.id === techId);
  return node?.researched ?? false;
}

/** Read-only world shape the placement rule needs; `WorldState` and `RenderSnapshot` both satisfy it. */
export interface PlacementCheckWorld {
  readonly buildings: readonly Building[];
  readonly width: number;
  readonly height: number;
  readonly worldMap: RenderSnapshot['worldMap'];
  readonly unlockedTechs: readonly string[];
  readonly researchNodes?: readonly ResearchNode[];
}

/**
 * The `unique` gate: true when this type is one-per-village and the player already owns a copy that
 * is complete or under construction. Rival structures never hold the player's slot.
 */
export function isUniqueBuildingAlreadyBuilt(
  world: Pick<PlacementCheckWorld, 'buildings'>,
  type: BuildingType,
): boolean {
  // The Leader's House owns an expansion rule rather than a plain one-per-village count.
  if (type === BuildingType.LeaderHouse) return !canBuildLeaderHouse(world.buildings);
  if (!getBuildingConfig(type).unique) return false;
  return world.buildings.some(
    (building) => building.type === type && building.faction !== 'rival',
  );
}

/**
 * The one placement decision: the first rule that refuses this spot, in the canvas's order, or
 * `null` when the spot is legal. Preview (`canPlaceBuilding`) and commit both call it.
 */
export function getPlaceBuildingFailureReason(
  world: PlacementCheckWorld,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): 'terrain' | 'blocked' | 'research' | 'unique' | null {
  const config = getBuildingConfig(type);
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (!isFootprintWithinMapBounds(width, height, x, y, world.width, world.height)) return 'blocked';
  if (
    config.unlockRequirement
    && !isBuildingTechUnlocked(config.unlockRequirement, world.unlockedTechs, world.researchNodes)
  ) {
    return 'research';
  }
  if (isUniqueBuildingAlreadyBuilt(world, type)) return 'unique';
  if (!isFootprintOnBuildableTerrain(world, width, height, x, y, type)) return 'terrain';
  // The renderer lattice calls this per candidate cell, so the overlap check goes through the cached
  // spatial index; it returns the same answer as `overlapsAnyBuilding`.
  if (overlapsAnyBuildingIndexed(world.buildings, world.width, world.height, width, height, x, y)
    && !stripCrossingIsTheOnlyOverlap(world.buildings, x, y, width, height, type)) {
    return 'blocked';
  }
  return null;
}

/** Read-only placement check for the renderer — the owner's decision, nothing else. */
export function canPlaceBuilding(
  snapshot: PlacementCheckWorld,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): boolean {
  return getPlaceBuildingFailureReason(snapshot, type, x, y, rotation) == null;
}

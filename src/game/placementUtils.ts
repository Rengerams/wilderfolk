import { type BuildingRotation, getBuildingFootprintForType } from './buildingRotation';
import { BUILDING_CONFIGS, BuildingType, TERRAIN_TILE_SIZE, TerrainType, type Building } from './gameTypes';
import type { ResearchNode } from './gameTypes';
import type { RenderSnapshot } from './renderSnapshot';
import { tileAt } from './terrain/terrainGrid';
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
    startTx: Math.floor(left / TERRAIN_TILE_SIZE),
    endTx: Math.ceil(right / TERRAIN_TILE_SIZE) - 1,
    startTy: Math.floor(top / TERRAIN_TILE_SIZE),
    endTy: Math.ceil(bottom / TERRAIN_TILE_SIZE) - 1,
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
  const inset = MAP_EDGE_INSET;
  return (
    x - width / 2 >= inset
    && y - height / 2 >= inset
    && x + width / 2 <= mapWidth - inset
    && y + height / 2 <= mapHeight - inset
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

  const bridge = buildingType === BuildingType.Bridge;
  const fishing = buildingType === BuildingType.FishingSpot;
  let riverCells = 0;
  let waterCells = 0;
  let cells = 0;

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= tileW || ty >= tileH) return false;
      const tile = tileAt(snapshot.worldMap, tx, ty);
      if (!tile) return false;
      cells++;
      if (bridge) {
        if (!RIVER_PLACE_TERRAIN.has(tile.type)) return false;
        if (tile.type === TerrainType.River) riverCells++;
      } else if (fishing) {
        // A fishing dock may straddle land and water — but never mountains/snow.
        if (isUnbuildableTerrainType(tile.type) && !isWaterTerrainType(tile.type)) return false;
        if (isWaterTerrainType(tile.type)) waterCells++;
      } else if (isUnbuildableTerrainType(tile.type)) {
        return false;
      }
    }
  }
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

/** Any structure (player or rival) blocks placement — alias of overlapsAnyBuilding. */
export function overlapsPlayerBuilding(
  buildings: readonly Building[],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  return overlapsAnyBuilding(buildings, width, height, x, y);
}

/**
 * Renderer-only spatial index over building footprints.
 *
 * `canPlaceBuildingSnapshot` runs once per candidate cell on the build grid — a ~2 200-cell lattice at
 * high zoom — and each call used to do an O(buildings) `overlapsAnyBuilding` scan, so a 300-building
 * village paid hundreds of thousands of footprint comparisons per repaint *while panning in build
 * mode*. The index answers "does anything overlap this rect" against only the
 * buildings in the cells the rect touches.
 *
 * Equivalence: a building is inserted into **every** cell its footprint touches, a query visits
 * **every** cell its footprint touches, and both use the same `floor(left / cell)` indexing — so a
 * building and a query that overlap share at least one cell, and the exact strict-inequality test
 * then gives the same answer as the linear scan. False positives are filtered by that test; false
 * negatives are impossible. Keyed on the buildings array identity plus the map dimensions, because a
 * placed building's footprint is immutable (`completed` flips but every state blocks placement, so it
 * is irrelevant to the index). The authoritative `overlapsAnyBuilding` stays a plain linear scan —
 * it is a single call, not a lattice.
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
 * The `building.x/y` centre convention now lives in the leaf module `buildingGeometry`, which exists
 * precisely so `buildingRotation` and this file can both read it without importing each other (the
 * old arrangement closed a runtime cycle). Re-exported here because this module
 * is where the rest of the codebase already looks for footprint geometry — one definition, two import
 * paths, and no second source of truth.
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

/** Read-only placement check for the renderer (matches gameEngine rules). */
export function canPlaceBuildingSnapshot(
  snapshot: RenderSnapshot,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): boolean {
  const config = BUILDING_CONFIGS[type];
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (!isFootprintWithinMapBounds(width, height, x, y, snapshot.width, snapshot.height)) return false;
  if (
    config.unlockRequirement
    && !isBuildingTechUnlocked(config.unlockRequirement, snapshot.unlockedTechs, snapshot.researchNodes)
  ) {
    return false;
  }
  if (config.unique && snapshot.buildings.some((b) => b.type === type)) return false;
  if (!isFootprintOnBuildableTerrain(snapshot, width, height, x, y, type)) return false;
  // The renderer lattice calls this per candidate cell, so the overlap check goes through the cached
  // spatial index; `overlapsAnyBuilding` (the authoritative, single-call path) is the exact same rule.
  if (overlapsAnyBuildingIndexed(snapshot.buildings, snapshot.width, snapshot.height, width, height, x, y)) {
    return false;
  }
  return true;
}
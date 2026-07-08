import { type BuildingRotation, getBuildingFootprintForType } from './buildingRotation';
import { BUILDING_CONFIGS, BuildingType, TerrainType, type Building } from './gameTypes';
import type { ResearchNode } from './gameTypes';
import type { RenderSnapshot } from './renderSnapshot';

export const PLACEMENT_TILE_SIZE = 10;
/** Keep building footprints slightly inside the map edge so sprites are not clipped. */
export const MAP_EDGE_INSET = 1;

const UNBUILDABLE_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

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

function footprintTileIndices(
  left: number,
  right: number,
  top: number,
  bottom: number,
): { startTx: number; endTx: number; startTy: number; endTy: number } {
  return {
    startTx: Math.floor(left / PLACEMENT_TILE_SIZE),
    endTx: Math.ceil(right / PLACEMENT_TILE_SIZE) - 1,
    startTy: Math.floor(top / PLACEMENT_TILE_SIZE),
    endTy: Math.ceil(bottom / PLACEMENT_TILE_SIZE) - 1,
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

export function isFootprintOnBuildableTerrain(
  snapshot: Pick<RenderSnapshot, 'worldMap'>,
  width: number,
  height: number,
  x: number,
  y: number,
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

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= tileW || ty >= tileH) return false;
      const tile = snapshot.worldMap.tiles[ty]?.[tx];
      if (!tile || UNBUILDABLE_TERRAIN.has(tile.type)) return false;
    }
  }
  return true;
}

/** Player-owned structures block placement; rival camps do not. */
export function overlapsPlayerBuilding(
  buildings: readonly Building[],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (width <= 0 || height <= 0) return false;
  for (const b of buildings) {
    if (b.faction === 'rival') continue;
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
  if (!isFootprintOnBuildableTerrain(snapshot, width, height, x, y)) return false;
  if (overlapsPlayerBuilding(snapshot.buildings, width, height, x, y)) return false;
  return true;
}
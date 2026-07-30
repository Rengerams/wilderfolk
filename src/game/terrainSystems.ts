/**
 * Terrain efficiency, spawn placement, adjacency multiplier wrapper.
 */
import type { Building, WorldState } from './gameTypes';
import { BuildingType, TerrainType } from './gameTypes';
import {
  buildingUsesAdjacency,
  ensureAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
} from './adjacencyIndex';
import { isEntityOnBuilding } from './buildingRotation';

export function getTileAt(state: WorldState, x: number, y: number) {
  if (!state.worldMap) return null;
  const tx = Math.floor(x / 10);
  const ty = Math.floor(y / 10);
  return state.worldMap.tiles[ty]?.[tx] ?? null;
}

const UNBUILDABLE_SPAWN_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

export function isInsideCompletedBuilding(state: WorldState, x: number, y: number, pad = 10): boolean {
  for (const b of state.buildings) {
    if (!b.completed) continue;
    if (isEntityOnBuilding(x, y, b, pad)) return true;
  }
  return false;
}

export function isValidHumanSpawnPosition(state: WorldState, x: number, y: number): boolean {
  const margin = 12;
  if (x < margin || y < margin || x > state.width - margin || y > state.height - margin) return false;
  const tile = getTileAt(state, x, y);
  if (!tile || UNBUILDABLE_SPAWN_TERRAIN.has(tile.type)) return false;
  return !isInsideCompletedBuilding(state, x, y);
}

export function findHumanSpawnNear(state: WorldState, x: number, y: number): { x: number; y: number } {
  if (isValidHumanSpawnPosition(state, x, y)) return { x, y };
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const r = 24 + (i % 4) * 20;
    const sx = x + Math.cos(angle) * r;
    const sy = y + Math.sin(angle) * r;
    if (isValidHumanSpawnPosition(state, sx, sy)) return { x: sx, y: sy };
  }
  return { x: state.width / 2, y: state.height / 2 };
}

export function getTerrainEfficiencyMultiplier(state: WorldState, building: Building): number {
  if (!state.worldMap) return 1;
  const tile = getTileAt(state, building.x, building.y);
  if (!tile) return 1;
  const type = tile.type;

  switch (building.type) {
    case BuildingType.Farm:
    case BuildingType.Greenhouse:
      if (type === TerrainType.Grassland) return 1.4;
      if (type === TerrainType.Forest || type === TerrainType.DarkForest) return 0.8;
      if (type === TerrainType.Rocky || type === TerrainType.Mountains) return 0.5;
      if (type === TerrainType.Snow) return 0.3;
      return 1.0;
    case BuildingType.LumberMill:
      if (type === TerrainType.Forest || type === TerrainType.DarkForest) return 1.5;
      if (type === TerrainType.Grassland) return 0.9;
      if (type === TerrainType.Rocky || type === TerrainType.Mountains) return 0.6;
      return 1.0;
    case BuildingType.Quarry:
    case BuildingType.Mine:
      if (type === TerrainType.Mountains || type === TerrainType.Rocky) return 1.5;
      if (type === TerrainType.Hills) return 1.2;
      if (type === TerrainType.Grassland || type === TerrainType.Forest) return 0.6;
      return 1.0;
    case BuildingType.Well:
      if (type === TerrainType.River || type === TerrainType.RiverBank || type === TerrainType.ShallowWater) return 1.5;
      if (type === TerrainType.Beach) return 1.2;
      return 1.0;
    default:
      return 1.0;
  }
}


export function getAdjacencyMultiplier(state: WorldState, building: Building): number {
  if (!buildingUsesAdjacency(building)) return 1;
  return getAdjacencyMultiplierFromIndex(ensureAdjacencyIndex(state), building);
}

import { describe, expect, it } from 'vitest';
import { BuildingType, ResearchType, TerrainType } from '@/game/gameTypes';
import type { Building, ResearchNode, TerrainTile } from '@/game/gameTypes';
import {
  isBuildingTechUnlocked,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  overlapsAnyBuilding,
  overlapsPlayerBuilding,
  PLACEMENT_TILE_SIZE,
} from '@/game/placementUtils';

function grassTile(): TerrainTile {
  return { type: TerrainType.Grassland, elevation: 0, moisture: 0.5, variation: 0 };
}

function waterTile(): TerrainTile {
  return { type: TerrainType.DeepWater, elevation: 0, moisture: 1, variation: 0 };
}

function worldMap(tiles: TerrainTile[][]) {
  return {
    seed: 1,
    preset: 'verdant' as const,
    size: 'small' as const,
    width: tiles[0].length,
    height: tiles.length,
    tiles,
    rivers: [] as { x: number; y: number }[][],
  };
}

describe('isFootprintOnBuildableTerrain', () => {
  it('checks every tile touched by the footprint, not just top-left corners', () => {
    const tiles = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => grassTile()),
    );
    tiles[2][2] = waterTile();

    const snapshot = { worldMap: worldMap(tiles) };
    const width = PLACEMENT_TILE_SIZE + 4;
    const height = PLACEMENT_TILE_SIZE + 4;
    const x = 2 * PLACEMENT_TILE_SIZE + 2;
    const y = 2 * PLACEMENT_TILE_SIZE + 2;

    expect(isFootprintOnBuildableTerrain(snapshot, width, height, x, y)).toBe(false);
  });

  it('rejects zero-size footprints', () => {
    const snapshot = { worldMap: worldMap([[grassTile()]]) };
    expect(isFootprintOnBuildableTerrain(snapshot, 0, 20, 10, 10)).toBe(false);
    expect(isFootprintOnBuildableTerrain(snapshot, 20, 0, 10, 10)).toBe(false);
  });
});

describe('isFootprintWithinMapBounds', () => {
  it('requires a small inset from the map edge', () => {
    expect(isFootprintWithinMapBounds(20, 20, 11, 11, 200, 200)).toBe(true);
    expect(isFootprintWithinMapBounds(20, 20, 1, 10, 200, 200)).toBe(false);
    expect(isFootprintWithinMapBounds(20, 20, 199, 10, 200, 200)).toBe(false);
  });
});

describe('overlapsAnyBuilding', () => {
  it('blocks rival faction buildings', () => {
    const rival: Building = {
      id: 1,
      type: BuildingType.House,
      x: 50,
      y: 50,
      width: 40,
      height: 40,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
      faction: 'rival',
    };
    expect(overlapsAnyBuilding([rival], 30, 30, 50, 50)).toBe(true);
  });
});

describe('overlapsPlayerBuilding', () => {
  it('blocks rival faction buildings', () => {
    const rival: Building = {
      id: 1,
      type: BuildingType.House,
      x: 50,
      y: 50,
      width: 40,
      height: 40,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
      faction: 'rival',
    };
    expect(overlapsPlayerBuilding([rival], 30, 30, 50, 50)).toBe(true);
  });
});

describe('isBuildingTechUnlocked', () => {
  it('requires the research node to be marked researched', () => {
    const nodes: ResearchNode[] = [
      {
        id: 'architecture_2',
        type: ResearchType.Architecture,
        name: 'Architecture II',
        description: '',
        cost: { wood: 100, stone: 80, food: 0, gold: 100 },
        prerequisites: [],
        effects: [],
        unlocked: true,
        researched: false,
        icon: '🏛️',
        tier: 2,
      },
    ];
    expect(isBuildingTechUnlocked('architecture_2', ['architecture_2'], nodes)).toBe(false);
    nodes[0].researched = true;
    expect(isBuildingTechUnlocked('architecture_2', ['architecture_2'], nodes)).toBe(true);
  });
});
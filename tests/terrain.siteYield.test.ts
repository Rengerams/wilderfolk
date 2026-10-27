import { describe, expect, it } from 'vitest';
import { BuildingType, MapPreset, MapSize, TerrainType } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { startBuilding } from '../src/game/buildingPlacementActions';
import { getTerrainEfficiencyMultiplier } from '../src/game/terrainSystems';
import { setTileOverride, tileAt, worldToTile } from '../src/game/terrain/terrainGrid';

describe('production retains its terrain bonus after building placement', () => {
  it.each([
    [BuildingType.LumberMill, 1.5],
    [BuildingType.Farm, 0.8],
  ] as const)('%s uses the wooded building site, not the cleared grass', (kind, multiplier) => {
    const world = initGame({ size: MapSize.Medium, preset: MapPreset.BlackForest, seed: 1234 });
    const map = world.worldMap!;
    const { x, y } = map.campSite!;
    const { tx, ty } = worldToTile(x, y);
    const tile = tileAt(map, tx, ty)!;
    setTileOverride(map, tx, ty, { ...tile, type: TerrainType.Forest });
    const placed = startBuilding(world, kind, x, y, 0, true);
    const building = placed.buildings.find(b => b.type === kind && b.x === x && b.y === y);
    expect(building, 'the founding site must accept a production building').toBeDefined();
    expect(building!.siteTerrain).toBe(TerrainType.Forest);
    expect(tileAt(placed.worldMap!, tx, ty)!.type).toBe(TerrainType.Grassland);
    expect(getTerrainEfficiencyMultiplier(placed, building!)).toBe(multiplier);
  }, 240_000);
});

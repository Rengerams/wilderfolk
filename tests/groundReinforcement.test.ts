import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType, TerrainType, PATH_CELL } from '../src/game/gameTypes';
import { getPlaceBuildingFailureReason, startBuilding } from '../src/game/buildingPlacementActions';
import { patchTile, tileAt } from '../src/game/terrain/terrainGrid';

describe('ground reinforcement', () => {
  function blockedGround() {
    const world = initGame({ seed: 321 });
    world.buildings = [];
    world.resources.stone = 500;
    world.resources.gold = 500;
    const map = world.worldMap!;
    // Use the same three-by-three footprint as the catalog tool.
    for (let ty = 9; ty <= 11; ty++) {
      for (let tx = 9; tx <= 11; tx++) patchTile(map, tx, ty, { type: TerrainType.Mountains });
    }
    return world;
  }

  it('converts unbuildable ground into permanent buildable terrain without leaving a structure', () => {
    const world = blockedGround();
    const x = 10.5 * PATH_CELL;
    const y = 10.5 * PATH_CELL;
    expect(getPlaceBuildingFailureReason(world, BuildingType.GroundReinforcement, x, y)).toBe(null);
    expect(getPlaceBuildingFailureReason(world, BuildingType.Lamp, x, y)).toBe('terrain');
    const placed = startBuilding(world, BuildingType.GroundReinforcement, x, y);
    expect(placed.buildings).toHaveLength(0);
    expect(placed.resources.stone).toBe(world.resources.stone - BUILDING_CONFIGS[BuildingType.GroundReinforcement].cost.stone);
    expect(tileAt(placed.worldMap!, 10, 10)?.type).toBe(TerrainType.Rocky);
    expect(getPlaceBuildingFailureReason(placed, BuildingType.Lamp, x, y)).toBe(null);
    expect(getPlaceBuildingFailureReason(placed, BuildingType.GroundReinforcement, x, y)).toBe('terrain');
    // Structured clone represents the save/load ownership of the map overrides.
    expect(tileAt(structuredClone(placed.worldMap!), 10, 10)?.type).toBe(TerrainType.Rocky);
  });

  it('cannot erase active rivers or deep water', () => {
    const world = blockedGround();
    patchTile(world.worldMap!, 10, 10, { type: TerrainType.River });
    const x = 10.5 * PATH_CELL;
    const y = 10.5 * PATH_CELL;
    expect(getPlaceBuildingFailureReason(world, BuildingType.GroundReinforcement, x, y)).toBe('terrain');
    const untouched = startBuilding(world, BuildingType.GroundReinforcement, x, y);
    expect(untouched.resources.stone).toBe(world.resources.stone);
    expect(tileAt(untouched.worldMap!, 10, 10)?.type).toBe(TerrainType.River);
  });
});

/**
 * Placing a building leaves a Chronicle line, not only a floating text.
 * The player reads "Farm placed" in the log and can filter it by the building type.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType, MapSize, PATH_CELL } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { getPlaceBuildingFailureReason, startBuilding } from '../src/game/buildingPlacementActions';

/** First placement point the game's own rule accepts; trees do not block a footprint. */
function findSpot(world: WorldState): { x: number; y: number } {
  for (let y = 100; y < world.height - 100; y += PATH_CELL * 2) {
    for (let x = 100; x < world.width - 100; x += PATH_CELL * 2) {
      if (getPlaceBuildingFailureReason(world, BuildingType.Farm, x, y, 0) === null) return { x, y };
    }
  }
  throw new Error('fixture: no legal placement point found');
}

describe('building placement is logged', () => {
  it('writes a building entry for the placed type', () => {
    const world = initGame({ size: MapSize.Medium, seed: 4242 });
    world.resources.wood = 500;
    world.resources.stone = 500;
    world.resources.gold = 500;
    const { x, y } = findSpot(world);

    const placed = startBuilding(world, BuildingType.Farm, x, y, 0);

    expect(
      placed.buildings.some((b) => b.type === BuildingType.Farm && b.x === x && b.y === y),
      'the fixture spot must accept the Farm',
    ).toBe(true);
    expect(placed.eventLog[0].type).toBe('building');
    expect(placed.eventLog[0].message).toBe(`${BUILDING_CONFIGS[BuildingType.Farm].label} placed`);
  });
});

/**
 * Every building type must be reachable from the build menu.
 *
 * The menu renders a category's `types` and nothing else, so a type missing from
 * `BUILDING_CATEGORIES` is unbuildable by the player even when its config, art and effect exist.
 * `WildlifePreserve` was in that state, which also made the `keeper_of_the_wild` chapter unreachable.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CATEGORIES, categoryForBuildingType } from '../src/game/buildCatalog';
import { BUILDING_CONFIGS, BuildingType, MapSize, PATH_CELL } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { getPlaceBuildingFailureReason, startBuilding } from '../src/game/buildingPlacementActions';
import { advanceValleyChronicle } from '../src/game/valleyChronicle';

const CATALOGUED_TYPES: BuildingType[] = BUILDING_CATEGORIES.flatMap((category) => category.types);

/** First placement point the game's own rule accepts for the type. */
function findSpot(world: WorldState, type: BuildingType): { x: number; y: number } {
  for (let y = 100; y < world.height - 100; y += PATH_CELL * 2) {
    for (let x = 100; x < world.width - 100; x += PATH_CELL * 2) {
      if (getPlaceBuildingFailureReason(world, type, x, y, 0) === null) return { x, y };
    }
  }
  throw new Error('fixture: no legal placement point found');
}

describe('the build catalogue reaches every building type', () => {
  it('lists every type in exactly one category', () => {
    const allTypes = Object.values(BuildingType);

    const unreachable = allTypes.filter((type) => !CATALOGUED_TYPES.includes(type));
    expect(unreachable, 'these types cannot be placed from the build menu').toEqual([]);

    const duplicated = allTypes.filter(
      (type) => CATALOGUED_TYPES.filter((listed) => listed === type).length > 1,
    );
    expect(duplicated, 'a type listed twice renders two tiles').toEqual([]);
  });

  it('offers the Wildlife Preserve as a Community building', () => {
    expect(CATALOGUED_TYPES).toContain(BuildingType.WildlifePreserve);
    expect(categoryForBuildingType(BuildingType.WildlifePreserve)).toBe('community');
    expect(BUILDING_CONFIGS[BuildingType.WildlifePreserve].label).toBe('Wildlife Preserve');
  });

  it('places the Wildlife Preserve, which unlocks Keeper of the Wild', () => {
    const world = initGame({ size: MapSize.Medium, seed: 4242 });
    world.resources = { wood: 5000, stone: 5000, food: 5000, gold: 5000, iron: 5000 };

    const { x, y } = findSpot(world, BuildingType.WildlifePreserve);
    const placed = startBuilding(world, BuildingType.WildlifePreserve, x, y, 0);

    const preserve = placed.buildings.find((b) => b.type === BuildingType.WildlifePreserve);
    expect(preserve, 'the placement owner refused the preserve').toBeDefined();

    // Construction completion is its own mechanic; the chapter reads the finished building.
    preserve!.completed = true;
    expect(advanceValleyChronicle(placed)).toContain('keeper_of_the_wild');
  });
});

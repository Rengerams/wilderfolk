import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import { beginCommuteRoutePass, isWithinAssignableCommute } from '../src/game/commuteReach';
import { findSchoolForChild } from '../src/game/education';
import { resetPathGridCaches, setCurrentPathMap } from '../src/game/pathfinding';
import { building, human } from '../src/test/factories';
import { testWorldMap } from '../src/test/worldMapFixtures';

describe('shared navigation decisions use the same real walkable map', () => {
  beforeEach(() => {
    resetPathGridCaches();
    beginCommuteRoutePass();
  });
  afterEach(() => setCurrentPathMap(null));

  it('enrolls at a reachable school rather than a geographically nearer one across a river', () => {
    const map = testWorldMap({
      tilesX: 40, tilesY: 40, seed: 3001,
      tileType: (x) => x === 20 ? TerrainType.River : undefined,
    });
    const nearbyAcrossRiver = building(2, BuildingType.School, {
      x: 25 * PATH_CELL, y: 15 * PATH_CELL, completed: true, occupants: [100],
    });
    const reachable = building(3, BuildingType.School, {
      x: 10 * PATH_CELL, y: 15 * PATH_CELL, completed: true, occupants: [101],
    });
    const child = human(7, {
      type: EntityType.Human, x: 19 * PATH_CELL, y: 15 * PATH_CELL, age: 10,
      schoolBuildingId: undefined,
    });
    setCurrentPathMap(map, [reachable, nearbyAcrossRiver]);
    expect(findSchoolForChild(child, [nearbyAcrossRiver, reachable])?.id).toBe(reachable.id);
  });

  it('refuses a new workforce commute across a river while accepting a priced same-bank job', () => {
    const map = testWorldMap({
      tilesX: 40, tilesY: 40, seed: 3002,
      tileType: (x) => x === 20 ? TerrainType.River : undefined,
    });
    const home = building(1, BuildingType.House, {
      x: 12 * PATH_CELL, y: 15 * PATH_CELL, completed: true,
    });
    const across = building(2, BuildingType.Farm, {
      x: 30 * PATH_CELL, y: 15 * PATH_CELL, completed: true,
    });
    const local = building(3, BuildingType.Farm, {
      x: 16 * PATH_CELL, y: 15 * PATH_CELL, completed: true,
    });
    const worker = human(11, { x: home.x, y: home.y, residenceBuildingId: home.id });
    const buildings = [home, across, local];
    setCurrentPathMap(map, buildings);
    expect(isWithinAssignableCommute(worker, across, buildings, 6.4)).toBe(false);
    expect(isWithinAssignableCommute(worker, local, buildings, 6.4)).toBe(true);
  });
});

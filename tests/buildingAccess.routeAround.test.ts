import { describe, expect, it } from 'vitest';
import { building, human } from '../src/test/factories';
import { BuildingType } from '../src/game/gameTypes';
import { applyHumanWalkStep, commuteHumanToBuilding, enterHumanBuilding, homeStandPosition, steerHumanToward } from '../src/game/simulation/humanMovement';
import { buildingAccessPoint } from '../src/game/buildingAccess';
import { getBuildingFootprintRect } from '../src/game/buildingGeometry';
import { setCurrentPathMap } from '../src/game/pathfinding';
import { testWorldMap } from '../src/test/worldMapFixtures';

/** Walk a settler home one tick at a time, as the human loop does. */
function walkHome(person: ReturnType<typeof human>, home: ReturnType<typeof building>, ticks: number): boolean {
  for (let tick = 0; tick < ticks; tick++) {
    if (commuteHumanToBuilding(person, home, 3)) {
      enterHumanBuilding(person, home);
      return true;
    }
    applyHumanWalkStep(person, 1);
  }
  return false;
}

describe('a settler reaches a building from every side', () => {
  it.each([
    ['north', 0, -100],
    ['south', 0, 100],
    ['east', 100, 0],
    ['west', -100, 0],
  ] as const)('arrives from the %s side instead of walking into the wall', (_label, dx, dy) => {
    const map = testWorldMap({ tilesX: 60, tilesY: 60 });
    const home = building(7, BuildingType.House, { x: 300, y: 300, width: 60, height: 60, occupants: [1] });
    setCurrentPathMap(map, [home]);
    try {
      const door = buildingAccessPoint(home);
      const person = human(1, { x: door.x + dx, y: door.y + dy, residenceBuildingId: home.id });
      expect(walkHome(person, home, 900), `side ${_label}`).toBe(true);
      expect(person.indoorBuildingId).toBe(home.id);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('routes a free-time walk to the porch around the house', () => {
    const map = testWorldMap({ tilesX: 60, tilesY: 60 });
    const home = building(7, BuildingType.House, { x: 300, y: 300, width: 60, height: 60, occupants: [1] });
    setCurrentPathMap(map, [home]);
    try {
      const porch = homeStandPosition(home, 1);
      const person = human(1, { x: home.x, y: home.y - 100, residenceBuildingId: home.id });
      for (let tick = 0; tick < 400; tick++) {
        if (Math.hypot(porch.x - person.x, porch.y - person.y) <= 8) break;
        steerHumanToward(person, porch.x, porch.y, 2, 1, `idle_${home.id}_${person.id}`);
        applyHumanWalkStep(person, 1);
      }
      expect(Math.hypot(porch.x - person.x, porch.y - person.y)).toBeLessThanOrEqual(8.5);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('walks around a wall that blocks the direct line to the door', () => {
    const map = testWorldMap({ tilesX: 60, tilesY: 60 });
    const home = building(7, BuildingType.House, { x: 320, y: 300, width: 60, height: 60, occupants: [1] });
    // A wall stands between the settler and the house, so only a detour can reach the door.
    const wall = building(9, BuildingType.Wall, { x: 280, y: 300, width: 20, height: 160 });
    setCurrentPathMap(map, [home, wall]);
    try {
      const rect = getBuildingFootprintRect(home);
      const person = human(1, { x: rect.left - 140, y: home.y, residenceBuildingId: home.id });
      expect(walkHome(person, home, 900)).toBe(true);
      expect(person.indoorBuildingId).toBe(home.id);
    } finally {
      setCurrentPathMap(null);
    }
  });
});

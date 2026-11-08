import { describe, expect, it } from 'vitest';
import { building, human } from '../src/test/factories';
import { BuildingType } from '../src/game/gameTypes';
import { applyHumanWalkStep, commuteHumanToBuilding, homeStandPosition } from '../src/game/simulation/humanMovement';
import { buildingAccessPoint } from '../src/game/buildingAccess';
import { getBuildingFootprintRect } from '../src/game/buildingGeometry';
import { isGroundWalkableAt, setCurrentPathMap } from '../src/game/pathfinding';
import { testWorldMap } from '../src/test/worldMapFixtures';

describe('home entry geometry', () => {
  it.each([
    ['House', BuildingType.House, 40, 36],
    ['Mansion', BuildingType.Mansion, 64, 52],
    ['LeaderHouse', BuildingType.LeaderHouse, 72, 84],
  ] as const)('puts the %s porch south of the whole footprint', (_label, type, width, height) => {
    const home = building(7, type, { x: 300, y: 200, width, height, occupants: [1, 2, 3] });
    for (const id of [1, 2, 3]) {
      const porch = homeStandPosition(home, id);
      expect(porch.y, `resident ${id}`).toBeGreaterThan(home.y + home.height / 2);
      const person = human(id, { x: porch.x, y: porch.y, residenceBuildingId: home.id });
      expect(commuteHumanToBuilding(person, home, 2, true), `resident ${id}`).toBe(true);
      expect(person.indoorBuildingId, `resident ${id}`).toBe(home.id);
    }
  });

  it('keeps the one doorstep outside the footprint on walkable ground', () => {
    for (const [type, width, height] of [
      [BuildingType.House, 40, 36],
      [BuildingType.Mansion, 64, 52],
      [BuildingType.LeaderHouse, 72, 84],
    ] as const) {
      const home = building(7, type, { x: 300, y: 200, width, height });
      const access = buildingAccessPoint(home);
      const rect = getBuildingFootprintRect(home);
      const outside = access.x < rect.left || access.x > rect.right
        || access.y < rect.top || access.y > rect.bottom;
      expect(outside, `${type} doorstep`).toBe(true);
      expect(isGroundWalkableAt(access.x, access.y), `${type} doorstep ground`).toBe(true);
    }
  });

  it('walks a resident in from every side through the one doorstep', () => {
    const home = building(21, BuildingType.House, { x: 300, y: 200, width: 40, height: 36, occupants: [31] });
    const rect = getBuildingFootprintRect(home);
    const access = buildingAccessPoint(home);
    const approaches = [
      { x: home.x, y: rect.bottom + 60 },
      { x: home.x, y: rect.top - 60 },
      { x: rect.right + 60, y: home.y },
      { x: rect.left - 60, y: home.y },
    ];
    for (const [index, point] of approaches.entries()) {
      const person = human(31 + index, { ...point, residenceBuildingId: home.id });
      let entered = false;
      for (let tick = 0; tick < 600 && !entered; tick++) {
        entered = commuteHumanToBuilding(person, home, 3, true);
        if (!entered) applyHumanWalkStep(person, 1);
      }
      expect(entered, `side ${index}`).toBe(true);
      expect(person.indoorBuildingId, `side ${index}`).toBe(home.id);
      expect(Math.hypot(person.x - access.x, person.y - access.y), `side ${index}`).toBeLessThanOrEqual(24);
    }
  });

  it('moves the doorstep off a south front with no open ground', () => {
    const map = testWorldMap({ tilesX: 40, tilesY: 30 });
    const home = building(5, BuildingType.House, { x: 100, y: 100, width: 40, height: 36 });
    // A wall right in front leaves the south facade no doorstep.
    const wall = building(6, BuildingType.Wall, { x: 100, y: 146, width: 200, height: 20 });
    setCurrentPathMap(map, [home, wall]);
    try {
      const access = buildingAccessPoint(home);
      expect(access.side).not.toBe('south');
      const porch = homeStandPosition(home, 3);
      // Frontage follows the chosen access, never the blocked south facade.
      expect(porch.x).toBeGreaterThanOrEqual(getBuildingFootprintRect(home).right);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('gives every resident a frontage point instead of the same pixel', () => {
    const home = building(9, BuildingType.House, { x: 300, y: 200, width: 48, height: 40, occupants: [11, 12, 13, 14] });
    const points = home.occupants.map((id) => homeStandPosition(home, id));
    expect(new Set(points.map((point) => `${point.x},${point.y}`)).size).toBe(points.length);
    for (const point of points) expect(point.y).toBeGreaterThan(home.y + home.height / 2);
    const access = buildingAccessPoint(home);
    expect(Math.hypot(points[0].x - access.x, points[0].y - access.y)).toBeLessThanOrEqual(20);
  });
});

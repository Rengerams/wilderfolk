import { describe, expect, it } from 'vitest';
import { building, human } from '../src/test/factories';
import { BuildingType } from '../src/game/gameTypes';
import { commuteHumanToBuilding, homeStandPosition, humanBuildingTarget } from '../src/game/simulation/humanMovement';

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

  it('enters from every side without requiring a south porch', () => {
    const home = building(21, BuildingType.House, { x: 300, y: 200, width: 40, height: 36, occupants: [31] });
    const sides = [
      { x: home.x, y: home.y + home.height / 2 + 10 },
      { x: home.x, y: home.y - home.height / 2 - 10 },
      { x: home.x + home.width / 2 + 10, y: home.y },
      { x: home.x - home.width / 2 - 10, y: home.y },
    ];
    for (const [index, point] of sides.entries()) {
      const person = human(31 + index, { ...point, residenceBuildingId: home.id });
      expect(commuteHumanToBuilding(person, home, 2, true), `side ${index}`).toBe(true);
      expect(person.indoorBuildingId, `side ${index}`).toBe(home.id);
    }
  });

  it('gives every resident a frontage point instead of the same pixel', () => {
    const home = building(9, BuildingType.House, { x: 300, y: 200, width: 48, height: 40, occupants: [11, 12, 13, 14] });
    const points = home.occupants.map((id) => homeStandPosition(home, id));
    expect(new Set(points.map((point) => `${point.x},${point.y}`)).size).toBe(points.length);
    for (const point of points) expect(point.y).toBeGreaterThan(home.y + home.height / 2);
    expect(humanBuildingTarget(home, 11, true)).toEqual(points[0]);
  });
});

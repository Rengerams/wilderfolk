import { describe, expect, it } from 'vitest';
import { building, human } from '../src/test/factories';
import { BuildingType, TerrainType } from '../src/game/gameTypes';
import { applyHumanWalkStep, commuteHumanToBuilding, enterHumanBuilding, homeStandPosition, steerHumanToward } from '../src/game/simulation/humanMovement';
import { buildingAccessPoint, buildingAccessPoints, isAtBuildingReach } from '../src/game/buildingAccess';
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
  it('routes a long free-time walk around a thin house instead of hitting its wall', () => {
    const map = testWorldMap({ tilesX: 500, tilesY: 12 });
    const obstacle = building(89, BuildingType.House, { x: 1250, y: 55, width: 10, height: 10 });
    setCurrentPathMap(map, [obstacle]);
    try {
      const person = human(1, { x: 25, y: 55 });
      let arrived = false;
      for (let tick = 0; tick < 1300; tick++) {
        steerHumanToward(person, 4975, 55, 5, 1, `long_leisure_${person.id}`);
        applyHumanWalkStep(person, 1);
        if (Math.hypot(4975 - person.x, 55 - person.y) <= 8) {
          arrived = true;
          break;
        }
      }
      expect(arrived, 'the settler should walk around the distant house').toBe(true);
    } finally {
      setCurrentPathMap(null);
    }
  });

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

  it('rejects an outward doorstep with a wall between it and the facade', () => {
    const map = testWorldMap({ tilesX: 60, tilesY: 60 });
    const home = building(7, BuildingType.House, { x: 300, y: 300, width: 60, height: 60, occupants: [1] });
    const wall = building(9, BuildingType.Wall, { x: 300, y: 340, width: 60, height: 20 });
    setCurrentPathMap(map, [home, wall]);
    try {
      expect(isAtBuildingReach({ x: 300, y: 352 }, home)).toBe(false);
      const door = buildingAccessPoint(home);
      expect(door.side).toBe('east');
      expect(isAtBuildingReach(door, home)).toBe(true);
      const person = human(1, { x: 300, y: 420, residenceBuildingId: home.id });
      expect(walkHome(person, home, 900)).toBe(true);
      expect(Number.isFinite(person.x + person.y + person.vx + person.vy)).toBe(true);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('retains all four entrances on a house whose footprint touches partial path cells', () => {
    const map = testWorldMap({ tilesX: 40, tilesY: 40 });
    const home = building(19, BuildingType.House, {
      x: 146, y: 156, width: 53, height: 47,
    });
    setCurrentPathMap(map, [home]);
    try {
      expect(buildingAccessPoints(home).map((point) => point.side).sort())
        .toEqual(['east', 'north', 'south', 'west']);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('never treats an entrance beyond a river immediately outside the facade as reachable', () => {
    const map = testWorldMap({
      tilesX: 40, tilesY: 40,
      tileType: (x, y) => x >= 29 && x <= 31 && y >= 29 && y <= 31
        && !(x === 30 && y === 30) ? TerrainType.River : undefined,
    });
    const house = building(11, BuildingType.House, {
      x: 305, y: 305, width: 20, height: 20,
    });
    setCurrentPathMap(map, [house]);
    try {
      expect(buildingAccessPoints(house)).toHaveLength(0);
      const person = human(1, { x: 255, y: 305 });
      expect(commuteHumanToBuilding(person, house, 3)).toBe(false);
      expect(person.vx).toBe(0);
      expect(person.vy).toBe(0);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('keeps the south facade closed while allowing an approach from an unobstructed side', () => {
    const map = testWorldMap({ tilesX: 60, tilesY: 60 });
    const home = building(12, BuildingType.House, {
      x: 300, y: 300, width: 60, height: 60, occupants: [1],
    });
    const southWall = building(13, BuildingType.Wall, {
      x: 300, y: 340, width: 60, height: 20,
    });
    setCurrentPathMap(map, [home, southWall]);
    try {
      expect(buildingAccessPoints(home).map((point) => point.side)).not.toContain('south');
      const person = human(1, { x: 300, y: 410, residenceBuildingId: home.id });
      expect(walkHome(person, home, 900)).toBe(true);
      expect(person.indoorBuildingId).toBe(home.id);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('reaches the north facade when a walled house isolates its south entrance', () => {
    const map = testWorldMap({ tilesX: 60, tilesY: 60 });
    const home = building(7, BuildingType.House, { x: 300, y: 300, width: 60, height: 60, occupants: [1] });
    const west = building(8, BuildingType.Wall, { x: 135, y: 300, width: 270, height: 60 });
    const east = building(9, BuildingType.Wall, { x: 465, y: 300, width: 270, height: 60 });
    setCurrentPathMap(map, [home, west, east]);
    try {
      const person = human(1, { x: 300, y: 200, residenceBuildingId: home.id });
      expect(walkHome(person, home, 200)).toBe(true);
      expect(person.indoorBuildingId).toBe(home.id);
      expect(person.y).toBeLessThan(home.y);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('keeps velocity finite at an unreachable fallback doorstep', () => {
    const map = testWorldMap({ tilesX: 60, tilesY: 60 });
    const home = building(7, BuildingType.House, { x: 300, y: 300, width: 60, height: 60 });
    const enclosure = building(9, BuildingType.Wall, { x: 300, y: 300, width: 160, height: 160 });
    setCurrentPathMap(map, [home, enclosure]);
    try {
      const person = human(1, buildingAccessPoint(home));
      expect(commuteHumanToBuilding(person, home, 3)).toBe(false);
      expect([person.vx, person.vy]).toEqual([0, 0]);
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

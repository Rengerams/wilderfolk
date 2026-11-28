import { ROAD_SPEED_MULT } from '../src/game/simulation/movementSteering';
import { isOnWalkableRoadAt, setCurrentPathMap } from '../src/game/pathfinding';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { human, finishedBuilding } from '../src/test/factories';
import { BuildingType, TerrainType, type Building } from '../src/game/gameTypes';
/**
 * Hotel lodging must end at morning checkout, not a full day after check-in (EJ-12).
 */
import { describe, expect, it } from 'vitest';
import { hotelCheckoutTick, steerVisitorToHotel } from '../src/game/hotelStay';
import {
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  getAbsoluteCalendarDay,
  getHourOfDay,
  NIGHT_END,
} from '../src/game/dayCycle';

describe('hotelCheckoutTick', () => {
  it('evening check-in checks out next morning, not next evening', () => {
    const evening = 19 * TICKS_PER_HOUR;
    const until = hotelCheckoutTick(evening);
    expect(getHourOfDay(until)).toBe(NIGHT_END);
    expect(getAbsoluteCalendarDay(until)).toBe(1);
    // Shorter than a full day after check-in (would be evening+TICKS_PER_DAY)
    expect(until - evening).toBeLessThan(TICKS_PER_DAY);
    expect(until).toBe(TICKS_PER_DAY + NIGHT_END * TICKS_PER_HOUR);
  });

  it('late-night check-in still leaves at dawn the same morning cycle', () => {
    // 02:00 is after previous dawn's "next" boundary logic → next 06:00 is same calendar day
    const lateNight = 2 * TICKS_PER_HOUR;
    const until = hotelCheckoutTick(lateNight);
    expect(getHourOfDay(until)).toBe(NIGHT_END);
    expect(getAbsoluteCalendarDay(until)).toBe(0);
    expect(until).toBe(NIGHT_END * TICKS_PER_HOUR);
  });
});

describe('M12 hotel visitor movement', () => {
  it('applies exactly one steered step per tick when routing around blocked terrain', () => {
    // Vertical river at tile column 20 with a single gap at row 20.
    setCurrentPathMap(testWorldMap({ tilesX: 40, tilesY: 40, seed: 912, tileType: (x, y) => (x === 20 && y !== 20) ? TerrainType.River : undefined }), []);
    const h = finishedBuilding(1, BuildingType.Hotel, { x: 300, y: 180, width: 40, height: 30, occupants: [99] });
    const visitor = human(3, { x: 55, y: 55, age: 25, gender: 'female', job: undefined, faction: 'visitor', hotelStayBuildingId: h.id });

    const startX = visitor.x;
    const startY = visitor.y;
    expect(steerVisitorToHotel(visitor, [h], 2)).toBe(true);

    // 'path' only sets the velocity; the walk applies the step itself, exactly once.
    expect(Math.hypot(visitor.vx, visitor.vy)).toBeGreaterThan(0);
    expect(visitor.x - startX).toBeCloseTo(visitor.vx, 6);
    expect(visitor.y - startY).toBeCloseTo(visitor.vy, 6);
  });
});

describe('hotel guest routing and road speed', () => {
  it('uses the same road multiplier as its path planner and moves exactly once', () => {
    const h = finishedBuilding(5, BuildingType.Hotel, { x: 300, y: 180, width: 40, height: 30, occupants: [99] });
    const visitor = human(3, { x: 55, y: 207, age: 25, gender: 'female', job: undefined, faction: 'visitor', hotelStayBuildingId: h.id });
    const road = {
      id: 805, type: BuildingType.Road, x: 190, y: 207,
      width: 350, height: 14, completed: true,
    } as Building;
    setCurrentPathMap(testWorldMap({ tilesX: 60, tilesY: 40, seed: 20261029, tileType: () => (false) ? TerrainType.River : undefined }), [road]);
    try {
      expect(isOnWalkableRoadAt(visitor.x, visitor.y)).toBe(true);
      const before = { x: visitor.x, y: visitor.y };
      expect(steerVisitorToHotel(visitor, [h], 2)).toBe(true);
      expect(Math.hypot(visitor.vx, visitor.vy)).toBeGreaterThan(0);
      expect(visitor.x - before.x).toBeCloseTo(visitor.vx * ROAD_SPEED_MULT, 6);
      expect(visitor.y - before.y).toBeCloseTo(visitor.vy * ROAD_SPEED_MULT, 6);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('walks to a reachable facade when the first doorstep sits in a sealed pocket', () => {
    // River tiles seal the two cells in front of the south door into a pocket that no walker can
    // enter; the east frontage is open ground.
    const pocket = new Set(['9,12', '12,12', '10,13', '11,13']);
    setCurrentPathMap(testWorldMap({ tilesX: 40, tilesY: 40, seed: 20261122, tileType: (x, y) => (pocket.has(`${x},${y}`)) ? TerrainType.River : undefined }), []);
    try {
      const h = finishedBuilding(7, BuildingType.Hotel, { x: 100, y: 100, width: 40, height: 30, occupants: [99] });
      const visitor = human(7, { x: 165, y: 105, age: 25, gender: 'female', job: undefined, faction: 'visitor', hotelStayBuildingId: h.id });
      let entered = false;
      for (let tick = 0; tick < 400 && !entered; tick++) {
        steerVisitorToHotel(visitor, [h], 2);
        entered = visitor.indoorBuildingId === h.id;
      }
      expect(entered).toBe(true);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('does not walk through a sealed river when the hotel is unreachable', () => {
    setCurrentPathMap(testWorldMap({ tilesX: 40, tilesY: 40, seed: 20261030, tileType: (x) => (x === 20) ? TerrainType.River : undefined }), []);
    try {
      const h = finishedBuilding(6, BuildingType.Hotel, { x: 300, y: 180, width: 40, height: 30, occupants: [99] });
      const visitor = human(6, { x: 55, y: 180, age: 25, gender: 'female', job: undefined, faction: 'visitor', hotelStayBuildingId: h.id });
      expect(steerVisitorToHotel(visitor, [h], 2)).toBe(true);
      expect(visitor.x).toBe(55);
      expect(visitor.y).toBe(180);
      expect(visitor.vx).toBe(0);
      expect(visitor.vy).toBe(0);
    } finally {
      setCurrentPathMap(null);
    }
  });
});

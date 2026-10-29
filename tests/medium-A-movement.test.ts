import { personDayRoll } from '../src/game/simRng';
import { WORK_COMMUTE_RUSH as MAX_COMMUTE_SPEED_MULTIPLIER } from '../src/game/commuteReach';
/**
 * Regression tests for the medium-severity movement/cadence findings from
 * BUG_REPORTS/2026-09-13-simulation-logic-audit.md:
 *
 * - M12 hotelStay / M27 humanMovement: the *same* defect wearing two hats. A 2026-09-13 change
 *   made `pathfinding.steerWithPath` write the entity's position as well as its velocity, while
 *   the callers still applied their own step, so pathed walkers advanced twice per tick. The fix
 *   belongs to the owner: the stepper only sets velocity, and each caller applies exactly one step
 *   (the commute leaves it to the human loop, the hotel walk moves the visitor itself). Verified
 *   against the pre-regression contract in `de98bd6` (2026-08-29) and `3b0660f`.
 * - M13 humanHospitalBehavior: the day-stable treatment roll was re-evaluated every
 *   tick, so a patient near a staffed ward was treated on every tick of the day.
 * - M14 humanHospitalBehavior: the routing wrote position in addition to velocity, so the human
 *   loop's single movement apply stepped the settler twice; velocity only now.
 * - M22 pathfinding: a path cached under an origin-independent key was reused from a
 *   different origin, steering the settler back toward the stale path start.
 */
import { describe, expect, it } from 'vitest';
import { steerVisitorToHotel } from '../src/game/hotelStay';
import { tickHumanHospitalPatientCare } from '../src/game/humanHospitalBehavior';
import { getPathGrid, invalidateCommutePathsForWalker, isOnWalkableRoadAt, setCurrentPathMap, steerWithPath } from '../src/game/pathfinding';
import { getCurrentPathfinderTickCounters, resetPathfinderSession, setPathfindingMetricsEnabled } from '../src/game/pathfindingMetrics';
import { applyHumanWalkStep, commuteHumanToBuilding, humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { ROAD_SPEED_MULT } from '../src/game/simulation/movementSteering';
import { COMMUTE_CONFIG } from '../src/game/commuteReach';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { BuildingType, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import type { Building, Entity, WorldMap, WorldState } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';

/** Mirrors tests/pathfinding.test.ts — a real tile map built through the production tile model. */
function makeMap(
  width: number,
  height: number,
  seed: number,
  blocker: (x: number, y: number) => boolean,
): WorldMap {
  return testWorldMap({
    tilesX: width,
    tilesY: height,
    seed,
    tileType: (x, y) => (blocker(x, y) ? TerrainType.River : undefined),
  });
}

/** World-pixel center of a tile. */
function pixel(tileX: number, tileY: number): number {
  return tileX * PATH_CELL + PATH_CELL / 2;
}

function human(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: 'human',
    x,
    y,
    vx: 0,
    vy: 0,
    alive: true,
    age: 25,
    energy: 100,
    maxEnergy: 100,
    gender: 'female',
    isJuvenile: false,
    ...overrides,
  } as Entity;
}

function hotel(id: number, x: number, y: number): Building {
  return {
    id,
    type: BuildingType.Hotel,
    x,
    y,
    width: 40,
    height: 30,
    completed: true,
    occupants: [99],
  } as Building;
}

function hospital(id: number, x: number, y: number, occupants: number[]): Building {
  return {
    id,
    type: BuildingType.Hospital,
    x,
    y,
    width: 40,
    height: 32,
    completed: true,
    occupants,
  } as Building;
}

function makeState(tick: number, entities: Entity[]): WorldState {
  return {
    tick,
    entities,
    resources: { food: 1000 },
    floatingTexts: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

/**
 * First colony day on which both the day-stable treatment roll (salt 840) and the
 * day-stable medicine roll (salt 902) pass for this settler.
 */
function findQualifyingTreatmentDay(entityId: number): number {
  for (let day = 0; day < 2000; day++) {
    const tick = day * TICKS_PER_DAY + (entityId % TICKS_PER_DAY);
    const treatRoll = personDayRoll(entityId, tick, 840);
    const medicineRoll = personDayRoll(entityId, tick, 902);
    if (treatRoll < 0.2 && medicineRoll < 0.25) return day;
  }
  throw new Error(`no qualifying hospital-treatment day for settler ${entityId}`);
}

describe('M12 hotel visitor movement', () => {
  it('applies exactly one steered step per tick when routing around blocked terrain', () => {
    // Vertical river at tile column 20 with a single gap at row 20.
    setCurrentPathMap(makeMap(40, 40, 912, (x, y) => x === 20 && y !== 20), []);
    const h = hotel(1, 300, 180);
    const visitor = human(3, 55, 55, { faction: 'visitor', hotelStayBuildingId: h.id });

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
    const h = hotel(5, 300, 180);
    const visitor = human(3, 55, 207, { faction: 'visitor', hotelStayBuildingId: h.id });
    const road = {
      id: 805, type: BuildingType.Road, x: 190, y: 207,
      width: 350, height: 14, completed: true,
    } as Building;
    setCurrentPathMap(makeMap(60, 40, 20261029, () => false), [road]);
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

  it('does not walk through a sealed river when the hotel is unreachable', () => {
    setCurrentPathMap(makeMap(40, 40, 20261030, (x) => x === 20), []);
    try {
      const h = hotel(6, 300, 180);
      const visitor = human(6, 55, 180, { faction: 'visitor', hotelStayBuildingId: h.id });
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

describe('M14 hospital routing movement', () => {
  it('sets walk velocity without writing position (the human loop applies the step)', () => {
    const patient = human(1, 20, 16, { pregnant: true, energy: 40, maxEnergy: 100 });
    const ward = hospital(5, 400, 0, [2]);
    const state = makeState(0, [patient]);

    tickHumanHospitalPatientCare({
      state,
      entity: patient,
      staffedHospitals: [ward],
      onJobShift: false,
      speed: 2,
    });

    expect(Math.hypot(patient.vx, patient.vy)).toBeGreaterThan(0);
    expect(patient.x).toBe(20);
    expect(patient.y).toBe(16);
  });
});

describe('M13 hospital treatment cadence', () => {
  it('treats a patient at the ward at most once per colony day', () => {
    const ward = hospital(5, -20, -16, [2]); // ward center is (0, 0)
    // Huge maxEnergy keeps the single heal from filling the patient, so every
    // treatment repeats the food cost that makes the cadence observable.
    const patient = human(1, 0, 0, { pregnant: true, energy: 0, maxEnergy: 100_000 });
    const state = makeState(0, [patient]);

    const day = findQualifyingTreatmentDay(patient.id);
    const foodBefore = state.resources.food;
    for (let i = 0; i < TICKS_PER_DAY; i++) {
      state.tick = day * TICKS_PER_DAY + i;
      tickHumanHospitalPatientCare({
        state,
        entity: patient,
        staffedHospitals: [ward],
        onJobShift: false,
        speed: 2,
      });
    }

    // The day-stable gate passing is a once-per-day event, not a licence to treat
    // (skill + 1 food each time) on all 72 ticks of that day.
    expect(foodBefore - state.resources.food).toBe(1);
  });
});

describe('fast road waypoint steering', () => {
  it('crosses ten-pixel road tiles without oscillating at a waypoint or repeatedly searching', () => {
    const road = {
      id: 803, type: BuildingType.Road, x: pixel(20, 15), y: pixel(20, 15),
      width: 30 * PATH_CELL, height: PATH_CELL, completed: true,
    } as Building;
    setCurrentPathMap(makeMap(45, 35, 20261028, () => false), [road]);
    setPathfindingMetricsEnabled(true);
    resetPathfinderSession();
    try {
      const walker = human(803, pixel(4, 18), pixel(4, 18));
      const goalX = pixel(36, 18);
      const goalY = pixel(36, 18);
      const steps: number[] = [];
      let arrived = false;
      for (let tick = 0; tick < 90; tick++) {
        const mode = steerWithPath(walker, goalX, goalY, 28, 'fast-road');
        if (mode === 'arrived') { arrived = true; break; }
        if (mode === 'direct') {
          const dx = goalX - walker.x;
          const dy = goalY - walker.y;
          const dist = Math.hypot(dx, dy);
          walker.vx = dx / dist * Math.min(28, dist / 1.5);
          walker.vy = dy / dist * Math.min(28, dist / 1.5);
        } else {
          expect(mode).toBe('path');
        }
        const roadMult = 1.5;
        steps.push(Math.hypot(walker.vx, walker.vy) * roadMult);
        applyHumanWalkStep(walker, roadMult);
      }
      expect(arrived).toBe(true);
      expect(steps.some((step) => step > PATH_CELL * 2)).toBe(true);
      expect(getCurrentPathfinderTickCounters().findPathCalls).toBeLessThan(15);
    } finally {
      setPathfindingMetricsEnabled(false);
      setCurrentPathMap(null);
    }
  });
});

describe('accepted road detour final approach', () => {
  it('continues on accepted waypoints once closer than the initial search threshold', () => {
    const road = {
      id: 802, type: BuildingType.Road, x: pixel(20, 18), y: pixel(18, 0),
      width: 34 * PATH_CELL, height: PATH_CELL, completed: true,
    } as Building;
    setCurrentPathMap(makeMap(45, 35, 20261027, () => false), [road]);
    try {
      const walker = human(802, pixel(4, 0), pixel(18, 0));
      const targetX = pixel(36, 18);
      const targetY = pixel(18, 0);
      expect(steerWithPath(walker, targetX, targetY, 5, 'accepted-road')).toBe('path');
      let enteredFinalApproach = false;
      for (let step = 0; step < 120; step++) {
        const result = steerWithPath(walker, targetX, targetY, 5, 'accepted-road');
        const remaining = Math.hypot(walker.x - targetX, walker.y - targetY);
        if (remaining < 150 && remaining > 35) {
          expect(result).toBe('path');
          enteredFinalApproach = true;
          break;
        }
        expect(result).toBe('path');
        walker.x += walker.vx;
        walker.y += walker.vy;
      }
      expect(enteredFinalApproach).toBe(true);
    } finally {
      setCurrentPathMap(null);
    }
  });
});

describe('road detour negative caching', () => {
  it('keeps a rejected detour cached as the walker crosses tiles on a clear route', () => {
    const farRoad = {
      id: 801, type: BuildingType.Road, x: pixel(30, 30), y: pixel(30, 30),
      width: PATH_CELL, height: PATH_CELL, completed: true,
    } as Building;
    setCurrentPathMap(makeMap(40, 40, 20261026, () => false), [farRoad]);
    setPathfindingMetricsEnabled(true);
    resetPathfinderSession();
    try {
      const walker = human(801, pixel(2, 0), pixel(5, 0));
      expect(steerWithPath(walker, pixel(35, 0), pixel(5, 0), 5, 'negative-road')).toBe('direct');
      const searches = getCurrentPathfinderTickCounters().findPathCalls;
      expect(searches).toBeGreaterThan(0);
      for (let tile = 3; tile <= 12; tile++) {
        walker.x = pixel(tile, 5);
        expect(steerWithPath(walker, pixel(35, 0), pixel(5, 0), 5, 'negative-road')).toBe('direct');
      }
      expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(searches);
    } finally {
      setPathfindingMetricsEnabled(false);
      setCurrentPathMap(null);
    }
  });
});

describe('M22 path cache origin', () => {
  it('retains routes for hundreds of simultaneous commuters and invalidates topology changes', () => {
    const map = makeMap(40, 40, 934, (x, y) => y === 20 && x !== 35);
    setCurrentPathMap(map, []);
    setPathfindingMetricsEnabled(true);
    resetPathfinderSession();
    try {
      const walkers = Array.from({ length: 300 }, (_, id) => human(id, pixel(5, 0), pixel(35, 0)));
      for (const walker of walkers) {
        expect(steerWithPath(walker, pixel(20, 0), pixel(10, 0), 5, `load_${walker.id}`)).toBe('path');
      }
      const searches = getCurrentPathfinderTickCounters().findPathCalls;
      for (const walker of walkers) {
        expect(steerWithPath(walker, pixel(20, 0), pixel(10, 0), 5, `load_${walker.id}`)).toBe('path');
      }
      expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(searches);
      setCurrentPathMap(makeMap(40, 40, 935, (x, y) => y === 20), []);
      expect(steerWithPath(walkers[0], pixel(20, 0), pixel(10, 0), 5, 'load_0')).toBe('blocked');
      expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(searches + 1);
    } finally {
      setPathfindingMetricsEnabled(false);
      setCurrentPathMap(null);
    }
  });

  it('retries a failed route when the same key moves to another origin or destination', () => {
    setCurrentPathMap(makeMap(40, 40, 936, (x, y) => y === 20), []);
    const walker = human(1, pixel(5, 0), pixel(35, 0));
    expect(steerWithPath(walker, pixel(20, 0), pixel(10, 0), 5, 'retry')).toBe('blocked');
    setPathfindingMetricsEnabled(true);
    resetPathfinderSession();
    try {
      walker.x += PATH_CELL;
      steerWithPath(walker, pixel(20, 0), pixel(10, 0), 5, 'retry');
      expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(1);
      steerWithPath(walker, pixel(22, 0), pixel(10, 0), 5, 'retry');
      expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(2);
    } finally {
      setPathfindingMetricsEnabled(false);
      setCurrentPathMap(null);
    }
  });

  it('recomputes a cached path started from a different origin', () => {
    // Horizontal river at tile row 20 with a single gap at column 35.
    setCurrentPathMap(makeMap(40, 40, 922, (x, y) => y === 20 && x !== 35), []);
    const target = { x: pixel(20, 10), y: pixel(20, 10) };
    const entity = human(7, pixel(5, 35), pixel(5, 35));
    const cacheKey = 'c_7_42_h';

    // First leg: cached from the bottom-left corner.
    expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');

    // Same commute leg begun from a different origin, still needing a path around
    // the river. Reusing the cached waypoints would steer the settler 300px back
    // toward the stale origin instead of toward the target.
    entity.x = pixel(25, 35);
    entity.y = pixel(25, 35);
    expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');

    const toStaleOriginX = pixel(5, 35) - entity.x;
    const toStaleOriginY = pixel(5, 35) - entity.y;
    const steeredBackToOrigin = entity.vx * toStaleOriginX + entity.vy * toStaleOriginY;
    expect(steeredBackToOrigin).toBeLessThanOrEqual(0);
  });
});

describe('path cache reuses the route through forward progress', () => {
  it('does not re-run A* while the settler is still walking the cached route', () => {
    setPathfindingMetricsEnabled(true);
    resetPathfinderSession();
    // A river with one gap keeps the direct line blocked for the whole first stretch of the walk.
    setCurrentPathMap(makeMap(40, 40, 931, (x, y) => y === 20 && x !== 35), []);
    const target = { x: pixel(20, 10), y: pixel(20, 10) };
    const entity = human(7, pixel(5, 35), pixel(5, 35));
    const cacheKey = 'c_7_42_h';

    // First leg computes A* exactly once.
    expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');

    // Walk the route forward: each step must be a cache hit, never a fresh A* run.
    for (let step = 0; step < 12; step++) {
      entity.x += entity.vx;
      entity.y += entity.vy;
      expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');
    }

    const counters = getCurrentPathfinderTickCounters();
    expect(counters.findPathCalls).toBe(1);
    expect(counters.cacheMisses).toBe(1);
    expect(counters.cacheHits).toBeGreaterThan(0);

    setPathfindingMetricsEnabled(false);
    resetPathfinderSession();
  });
});

describe('M27 commute movement', () => {
  it('integrates a pathed commute step exactly once per tick, at the tuned distance', () => {
    // Vertical river at tile column 20 with a single gap at row 20.
    setCurrentPathMap(makeMap(40, 40, 927, (x, y) => x === 20 && y !== 20), []);
    const building = { id: 7, x: 300, y: 150, width: 40, height: 30, completed: true } as Building;
    const entity = human(3, 55, 55);
    const target = humanBuildingTarget(building, entity.id, false);

    const speed = 1;
    const distBefore = Math.hypot(target.x - entity.x, target.y - entity.y);
    // Urgency speed is bounded and this call uses the ordinary walking pace.
    const stepPerTick = speed * 0.88;

    const startX = entity.x;
    const startY = entity.y;
    expect(commuteHumanToBuilding(entity, building, speed, false)).toBe(false);

    // The stepper must leave the entity untouched: the loop's apply is the single integration.
    // (`toBeCloseTo`: the step is set as a velocity and applied by the caller.)
    expect(entity.x).toBeCloseTo(startX, 6);
    expect(entity.y).toBeCloseTo(startY, 6);

    entity.x += entity.vx;
    entity.y += entity.vy;
    const moved = Math.hypot(entity.x - startX, entity.y - startY);

    // Exactly one step per tick — never two (a stepper that also moves the entity).
    expect(moved).toBeCloseTo(Math.min(stepPerTick, distBefore), 6);
  });

  it('caps urgent long-distance walking at the configured maximum', () => {
    setCurrentPathMap(null, []);
    const building = { id: 8, x: 600, y: 600, width: 40, height: 30, completed: true } as Building;
    const entity = human(4, 0, 0);

    expect(commuteHumanToBuilding(entity, building, 1, false, 3.5)).toBe(false);
    expect(Math.hypot(entity.vx, entity.vy)).toBeCloseTo(
      MAX_COMMUTE_SPEED_MULTIPLIER * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO,
      6,
    );
  });
});

describe('water and walls are solid under every walk', () => {
  /** The grid's own verdict for the tile a world point stands in. */
  function blockedAt(map: WorldMap, buildings: Building[], x: number, y: number): boolean {
    const grid = getPathGrid(map, buildings);
    const tx = Math.floor(x / PATH_CELL);
    const ty = Math.floor(y / PATH_CELL);
    return grid.blocked[ty * grid.cols + tx] === 1;
  }

  it('stops a walker at the riverbank instead of letting it ford', () => {
    const map = makeMap(40, 40, 941, (x) => x === 20);
    setCurrentPathMap(map, []);
    const walker = human(3, pixel(19, 10), pixel(10, 10));
    walker.vx = 2;

    for (let tick = 0; tick < 30; tick++) applyHumanWalkStep(walker, 1);

    // Straight east is the river; blocked steps cannot carry the walker into it.
    expect(Math.floor(walker.x / PATH_CELL), 'the settler walked into the river').toBeLessThan(20);
    expect(blockedAt(map, [], walker.x, walker.y), 'the settler stood in the river').toBe(false);
  });

  it('lets a walker already standing on a blocked tile walk off it', () => {
    const map = makeMap(40, 40, 944, (x) => x === 20);
    setCurrentPathMap(map, []);
    // Settlers do end up on water — shoved by a neighbour, snapped to a doorstep, or restored from a
    // save made while they waded. Testing the whole step instead of the ground ahead would freeze
    // them there for good, so the cell they already occupy is not an obstacle to leaving it.
    const walker = human(5, pixel(20, 10) + 2, pixel(10, 10));
    walker.vx = -2;
    for (let tick = 0; tick < 20; tick++) applyHumanWalkStep(walker, 1);

    expect(Math.floor(walker.x / PATH_CELL), 'the settler could not leave the water').toBeLessThan(20);
  });

  it('routes a walker from blocked ground onto walkable ground before continuing', () => {
    const map = makeMap(40, 40, 945, (x, y) => (x === 20 || x === 21) && y !== 20);
    setCurrentPathMap(map, []);
    const walker = human(6, pixel(20, 10), pixel(10, 10));
    const targetX = pixel(25, 10);
    const targetY = pixel(10, 10);

    expect(steerWithPath(walker, targetX, targetY, 2, 'blocked-start')).toBe('path');
    expect(walker.vx, 'the route should first steer toward nearby walkable ground').toBeLessThan(0);

    for (let tick = 0; tick < 20; tick++) {
      applyHumanWalkStep(walker, 1);
      if (!blockedAt(map, [], walker.x, walker.y)) break;
      steerWithPath(walker, targetX, targetY, 2, 'blocked-start');
    }
    expect(blockedAt(map, [], walker.x, walker.y), 'the settler remained on blocked ground').toBe(false);
  });

  it('stops a walker at a wall instead of letting it pass through', () => {
    const map = makeMap(40, 40, 942, () => false);
    const wall: Building = {
      id: 5,
      type: BuildingType.Wall,
      x: pixel(20, 10),
      y: pixel(10, 10),
      width: PATH_CELL,
      height: PATH_CELL,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    } as Building;
    expect(blockedAt(map, [wall], pixel(20, 10), pixel(10, 10)), 'fixture premise: the wall blocks its own tile').toBe(true);
    setCurrentPathMap(map, [wall]);

    const walker = human(4, pixel(19, 10), pixel(10, 10));
    walker.vx = 2;
    for (let tick = 0; tick < 30; tick++) applyHumanWalkStep(walker, 1);

    expect(blockedAt(map, [wall], walker.x, walker.y), 'the settler walked through the wall').toBe(false);
    expect(walker.x, 'the settler should be backed away from the wall after repeated blocked steps')
      .toBeLessThan(wall.x);
  });

  it('moves a persistently stuck walker to nearby walkable ground', () => {
    const map = makeMap(40, 40, 946, (x) => x === 20);
    setCurrentPathMap(map, []);
    const walker = human(7, pixel(19, 10), pixel(10, 10));
    const startX = walker.x;
    walker.vx = 2;

    for (let tick = 0; tick < 20; tick++) applyHumanWalkStep(walker, 1);

    expect(walker.x, 'the walker remained pinned against the obstacle').toBeLessThan(startX);
    expect(blockedAt(map, [], walker.x, walker.y), 'recovery must use walkable ground').toBe(false);
  });

  it('routes a short leg through a gap instead of fording it', () => {
    // River column 20 with a single gap at row 12, and a workplace 20 px east of the settler: a leg
    // under LONG_RANGE_DIST (50), which used to steer straight at the target and straight into the
    // river.
    const map = makeMap(40, 40, 943, (x, y) => x === 20 && y !== 12);
    const buildings: Building[] = [];
    setCurrentPathMap(map, buildings);
    const workplace = { id: 7, x: pixel(21, 10), y: pixel(10, 10) - 25, width: 40, height: 30, completed: true } as Building;
    const walker = human(3, pixel(19, 10), pixel(10, 10));

    let arrived = false;
    let forded = false;
    for (let tick = 0; tick < 600 && !arrived; tick++) {
      arrived = commuteHumanToBuilding(walker, workplace, 1, false);
      applyHumanWalkStep(walker, 1);
      if (blockedAt(map, buildings, walker.x, walker.y)) forded = true;
    }

    expect(forded, 'the settler stood in the river').toBe(false);
    // And it really crossed, through the gap: a walker merely stopped at the bank never arrives.
    expect(arrived, 'the settler never reached the far bank').toBe(true);
    expect(walker.x).toBeGreaterThan(pixel(20, 10));
  });
});

describe('commute approach easing (the doorstep stretch)', () => {
  it('reaches the doorstep without overshooting or exceeding urgent walking pace', () => {
    const building = { id: 9, x: 600, y: 600, width: 60, height: 48, completed: true } as Building;
    const entity = human(5, 0, 0);
    const stand = humanBuildingTarget(building, entity.id, false);
    entity.x = stand.x;
    entity.y = stand.y - 45;
    entity.vx = 0;
    entity.vy = 0;

    const steps: number[] = [];
    let ticks = 0;
    while (Math.hypot(stand.x - entity.x, stand.y - entity.y) > 8 && ticks < 200) {
      commuteHumanToBuilding(entity, building, 1.05, false, 2);
      steps.push(Math.hypot(entity.vx, entity.vy));
      entity.x += entity.vx;
      entity.y += entity.vy;
      ticks++;
    }

    // The urgent pace is capped at twice the configured walk speed and eases near the target.
    expect(ticks).toBeLessThanOrEqual(30);
    expect(ticks).toBeGreaterThanOrEqual(4);
    expect(Math.max(...steps)).toBeLessThanOrEqual(1.05 * MAX_COMMUTE_SPEED_MULTIPLIER);
    expect(steps[0]!).toBeGreaterThan(steps[steps.length - 1]! * 2);
  });
});
describe('blocked commuter path recovery', () => {
  it('invalidates only the stalled settler commute route for replanning', () => {
    const map = makeMap(40, 40, 921, (x, y) => x === 20 && y !== 20);
    setCurrentPathMap(map, []);
    const first = human(9901, pixel(12, 0), pixel(12, 0));
    const second = human(9902, pixel(12, 0), pixel(12, 0));
    const targetX = pixel(28, 0);
    const targetY = pixel(25, 0);
    expect(steerWithPath(first, targetX, targetY, 2, 'c_9901_8_w')).toBe('path');
    expect(steerWithPath(second, targetX, targetY, 2, 'c_9902_8_w')).toBe('path');
    invalidateCommutePathsForWalker(first.id);
    expect(steerWithPath(first, targetX, targetY, 2, 'c_9901_8_w')).toBe('path');
    expect(steerWithPath(second, targetX, targetY, 2, 'c_9902_8_w')).toBe('path');
    setCurrentPathMap(null);
  });
});

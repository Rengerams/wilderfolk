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
import { setCurrentPathMap, steerWithPath } from '../src/game/pathfinding';
import { commuteHumanToBuilding, humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { personDayRoll, TICKS_PER_DAY } from '../src/game/dayCycle';
import { BuildingType, TERRAIN_TILE_SIZE, TerrainType } from '../src/game/gameTypes';
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
  return tileX * TERRAIN_TILE_SIZE + TERRAIN_TILE_SIZE / 2;
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

describe('M22 path cache origin', () => {
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

describe('M27 commute movement', () => {
  it('integrates a pathed commute step exactly once per tick, at the tuned distance', () => {
    // Vertical river at tile column 20 with a single gap at row 20.
    setCurrentPathMap(makeMap(40, 40, 927, (x, y) => x === 20 && y !== 20), []);
    const building = { id: 7, x: 300, y: 150, width: 40, height: 30, completed: true } as Building;
    const entity = human(3, 55, 55);
    const target = humanBuildingTarget(building, entity.id, false);

    const speed = 1;
    const distBefore = Math.hypot(target.x - entity.x, target.y - entity.y);
    // The pathed branch walks `moveSpeed * PATH_STEER_SPEED_RATIO` (0.88) per tick — one step,
    // applied by the human loop; the stepper itself only sets the velocity.
    const stepPerTick = speed * Math.min(12, 1 + distBefore / 40) * 0.88;

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
});

describe('commute approach easing (the doorstep stretch)', () => {
  it('decelerates visibly instead of crawling or snapping', () => {
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
      commuteHumanToBuilding(entity, building, 1.05, false, 3.5);
      steps.push(Math.hypot(entity.vx, entity.vy));
      entity.x += entity.vx;
      entity.y += entity.vy;
      ticks++;
    }

    // A 9-hour shift is 27 ticks. The flat `moveSpeed * 0.12` damping this replaced needed ~49
    // ticks for the same stretch, so workers reached their workplace only when it was time to go
    // home (owner report: "they arrive now when it's time to go home").
    expect(ticks).toBeLessThanOrEqual(12);
    // …but it must still be an *easing*: the first step is several times the last one, and the
    // whole stretch is not covered in a single tick.
    expect(ticks).toBeGreaterThanOrEqual(4);
    expect(steps[0]!).toBeGreaterThan(steps[steps.length - 1]! * 2);
  });
});
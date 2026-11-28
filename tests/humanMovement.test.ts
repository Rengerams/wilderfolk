import { COMMUTE_CONFIG, WORK_COMMUTE_RUSH as MAX_COMMUTE_SPEED_MULTIPLIER } from '../src/game/commuteReach';
import { ROAD_SPEED_MULT } from '../src/game/simulation/movementSteering';
import { buildingAccessPoint, isAtBuildingReach } from '../src/game/buildingAccess';
import { human } from '../src/test/factories';
import { describe, expect, it } from 'vitest';
import { applyHumanWalkStep, commuteHumanToBuilding, commutePathCacheKey, crowdGatherPosition, enterHumanBuilding, homeStandPosition, humanBuildingTarget, nearestActiveMoonHowler, venueGatherPosition, rememberHumanWalkTarget } from '../src/game/simulation/humanMovement';
import { BuildingType, EntityType, TerrainType } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { isActiveMoonHowler } from '../src/game/moonHowler';
import { setCurrentPathMap } from '../src/game/pathfinding';
import type { Building, Entity } from '../src/game/gameTypes';

const building = {
  id: 7,
  x: 100,
  y: 80,
  width: 40,
  height: 30,
} as Building;

function werewolf(id: number, x: number, y: number, active: boolean): Entity {
  return {
    id,
    type: EntityType.Werewolf,
    x,
    y,
    alive: true,
    moonHowlerCursed: active,
  } as Entity;
}

describe('human movement helpers', () => {
  it('keeps the home yard and workplace row anchored near the building centre', () => {
    const home = { id: 1, type: BuildingType.House, x: 400, y: 400, width: 100, height: 60, occupants: [12], completed: true } as Building;
    const stand = homeStandPosition(home, 12);
    expect(Math.abs(stand.x - home.x)).toBeLessThan(40);
    expect(stand.y).toBeGreaterThan(home.y);
    const worker = humanBuildingTarget(home, 12);
    expect(worker.x).toBe(home.x);
    expect(worker.y).toBe(home.y + home.height / 2 + 10);
  });

  it('keeps commute cache keys stable only when both endpoint tiles match', () => {
    const first = commutePathCacheKey(building.id, 101, 81, 200, 120);
    const sameTiles = commutePathCacheKey(building.id, 109, 89, 207, 127);
    const nextStartTile = commutePathCacheKey(building.id, 111, 81, 200, 120);
    const nextTargetTile = commutePathCacheKey(building.id, 101, 81, 216, 120);

    expect(first).toBe(sameTiles);
    expect(nextStartTile).not.toBe(first);
    expect(nextTargetTile).not.toBe(first);
  });

  it('stops a blocked commuter instead of repeatedly walking into a wall', () => {
    const map = testWorldMap({ tilesX: 40, tilesY: 30 });
    const wall = { ...building, id: 8, type: BuildingType.Wall, x: 100, y: 150, width: 10, height: 300, completed: true } as Building;
    const target = { ...building, id: 9, type: BuildingType.House, x: 200, y: 150, width: 20, height: 20 } as Building;
    const person = { id: 1, type: EntityType.Human, x: 50, y: 150, alive: true, vx: 0, vy: 0 } as Entity;
    setCurrentPathMap(map, [wall]);

    expect(commuteHumanToBuilding(person, target, 2)).toBe(false);
    expect([person.vx, person.vy]).toEqual([0, 0]);

    setCurrentPathMap(null);
  });

  it('keeps home stand positions deterministic per resident and building', () => {
    expect(homeStandPosition(building, 3)).toEqual(homeStandPosition(building, 3));
    expect(homeStandPosition(building, 3)).not.toEqual(homeStandPosition(building, 4));
  });

  it('places both leader and spouse outside the Leader’s House footprint', () => {
    const leaderHouse = {
      ...building, id: 1177, type: BuildingType.LeaderHouse, width: 63, height: 53, completed: true,
    } as Building;
    for (const residentId of [346, 8144, 9667, 12766]) {
      const porch = homeStandPosition(leaderHouse, residentId);
      expect(porch.y).toBeGreaterThan(leaderHouse.y + leaderHouse.height / 2);
      expect(Math.abs(porch.x - leaderHouse.x)).toBeLessThan(leaderHouse.width / 2);
      expect(homeStandPosition(leaderHouse, residentId)).toEqual(porch);
    }
  });

  it('keeps the residential porch distinct from a venue gathering arc', () => {
    const leaderHouse = {
      ...building, id: 1177, type: BuildingType.LeaderHouse, width: 63, height: 53, completed: true,
    } as Building;
    for (const residentId of [346, 8144]) {
      const porch = homeStandPosition(leaderHouse, residentId);
      const gathering = venueGatherPosition(leaderHouse, residentId);
      expect(porch.y).toBeGreaterThan(leaderHouse.y + leaderHouse.height / 2);
      expect(gathering.y).toBeGreaterThan(porch.y);
      expect(Math.abs(porch.x - leaderHouse.x)).toBeLessThan(leaderHouse.width / 2);
    }
  });

  it('lets a Leader’s House resident arrive indoors through the porch target', () => {
    const leaderHouse = {
      ...building, id: 1177, type: BuildingType.LeaderHouse, width: 63, height: 53, completed: true,
    } as Building;
    const tomika = {
      id: 346, type: EntityType.Human, alive: true,
      x: leaderHouse.x - 70, y: leaderHouse.y + leaderHouse.height / 2 + 18,
      vx: 0, vy: 0, residenceBuildingId: leaderHouse.id,
    } as Entity;
    setCurrentPathMap(null);
    try {
      for (let tick = 0; tick < 150 && tomika.indoorBuildingId !== leaderHouse.id; tick++) {
        if (commuteHumanToBuilding(tomika, leaderHouse, 3)) enterHumanBuilding(tomika, leaderHouse);
        applyHumanWalkStep(tomika, 1);
      }
      expect(tomika.indoorBuildingId).toBe(leaderHouse.id);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('gives each settler their own place in a venue crowd, in front of the building', () => {
    const venue = { ...building, x: 400, y: 300, width: 60, height: 40 };

    // Deterministic, like every other stand position: no RNG, same answer every time.
    expect(venueGatherPosition(venue, 7)).toEqual(venueGatherPosition(venue, 7));

    // A crowd is many places, not one pixel: 40 settlers must not pile up.
    const spots = Array.from({ length: 40 }, (_, i) => venueGatherPosition(venue, i + 1));
    const distinct = new Set(spots.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
    expect(distinct.size).toBeGreaterThanOrEqual(20);

    // In front of the venue (south of its centre line) and never inside the walls.
    const left = venue.x;
    const right = venue.x + venue.width;
    const top = venue.y;
    const bottom = venue.y + venue.height;
    for (const spot of spots) {
      expect(spot.y).toBeGreaterThan(venue.y + venue.height / 2);
      const insideFootprint = spot.x > left && spot.x < right && spot.y > top && spot.y < bottom;
      expect(insideFootprint).toBe(false);
    }
  });

  it('spreads a festival crowd over many places instead of repeating a small lattice', () => {
    expect(crowdGatherPosition(500, 400, 3)).toEqual(crowdGatherPosition(500, 400, 3));

    const spots = Array.from({ length: 200 }, (_, i) => crowdGatherPosition(500, 400, i + 1));
    const distinct = new Set(spots.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
    expect(distinct.size).toBeGreaterThanOrEqual(150);

    // Nobody stands on top of the stage, and the crowd stays in the neighbourhood rather than spanning it.
    for (const spot of spots) {
      const distance = Math.hypot(spot.x - 500, spot.y - 400);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThan(320);
    }
  });

  it('returns only the nearest active living Moon Howler', () => {
    const target = { id: 1, type: EntityType.Human, x: 0, y: 0, alive: true } as Entity;
    const inactive = werewolf(2, 10, 0, false);
    const activeFar = werewolf(3, 30, 0, true);
    const activeNear = werewolf(4, 5, 0, true);
    const deadNear = { ...werewolf(5, 2, 0, true), alive: false } as Entity;

    expect(isActiveMoonHowler(activeNear)).toBe(true);
    expect(nearestActiveMoonHowler(target, [inactive, activeFar, activeNear, deadNear])?.id).toBe(4);
  });
});

describe('M27 commute movement', () => {
  it('integrates a pathed commute step exactly once per tick, at the tuned distance', () => {
    // Vertical river at tile column 20 with a single gap at row 20.
    setCurrentPathMap(testWorldMap({ tilesX: 40, tilesY: 40, seed: 927, tileType: (x, y) => x === 20 && y !== 20 ? TerrainType.River : undefined }), []);
    const building = { id: 7, x: 300, y: 150, width: 40, height: 30, completed: true } as Building;
    const entity = human(3, { x: 55, y: 55, age: 25, gender: 'female', job: undefined });
    const target = humanBuildingTarget(building, entity.id);

    const speed = 1;
    const distBefore = Math.hypot(target.x - entity.x, target.y - entity.y);
    // Urgency speed is bounded and this call uses the ordinary walking pace.
    const stepPerTick = speed * 0.88;

    const startX = entity.x;
    const startY = entity.y;
    expect(commuteHumanToBuilding(entity, building, speed)).toBe(false);

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
    const entity = human(4, { x: 0, y: 0, age: 25, gender: 'female', job: undefined });

    expect(commuteHumanToBuilding(entity, building, 1, 3.5)).toBe(false);
    expect(Math.hypot(entity.vx, entity.vy)).toBeCloseTo(
      MAX_COMMUTE_SPEED_MULTIPLIER * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO,
      6,
    );
  });
});

describe('commute approach easing (the doorstep stretch)', () => {
  it('reaches the building without overshooting or exceeding urgent walking pace', () => {
    // This fixture explicitly has no terrain map. A preceding movement test may
    // leave another map active; it must not turn these 600px positions into obstacles.
    setCurrentPathMap(null);
    const building = { id: 9, x: 600, y: 600, width: 60, height: 48, completed: true } as Building;
    const entity = human(5, { x: 0, y: 0, age: 25, gender: 'female', job: undefined });
    const access = buildingAccessPoint(building);
    entity.x = access.x;
    entity.y = access.y + 45;
    entity.vx = 0;
    entity.vy = 0;

    const steps: number[] = [];
    let ticks = 0;
    while (!isAtBuildingReach(entity, building) && ticks < 200) {
      commuteHumanToBuilding(entity, building, 1.05, 2);
      steps.push(Math.hypot(entity.vx, entity.vy));
      entity.x += entity.vx;
      entity.y += entity.vy;
      ticks++;
    }

    // The urgent pace is capped at twice the configured walk speed, and the walker stops outside.
    expect(isAtBuildingReach(entity, building)).toBe(true);
    expect(ticks).toBeLessThanOrEqual(30);
    expect(ticks).toBeGreaterThanOrEqual(1);
    expect(Math.max(...steps)).toBeLessThanOrEqual(1.05 * MAX_COMMUTE_SPEED_MULTIPLIER);
    expect(entity.y).toBeGreaterThan(building.y + building.height / 2);
  });
});

describe('final road approach', () => {
  it('does not overshoot a child walk target after applying the road multiplier', () => {
    setCurrentPathMap(null);
    const child = human(9001, { x: 100, y: 100, age: 25, gender: 'female', job: undefined, age: 10, isJuvenile: true, vx: 4, vy: 0 });
    rememberHumanWalkTarget(child, 104, 100, 4, 'child-final-leg');
    applyHumanWalkStep(child, ROAD_SPEED_MULT);
    expect(child.x).toBe(104);
    expect(child.y).toBe(100);
  });
});

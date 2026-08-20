/**
 * Simulation governance invariants — SIMULATION_AUTHORITY.md §5 / §10.
 *
 * The collector is role-aware: `building.occupants` is overloaded by role
 * (workplace staff ↔ homeBuildingId, residence ↔ residenceBuildingId, prison
 * guards+prisoners, construction crews, no-occupant buildings). A settler
 * legitimately appears in one residence AND one workplace occupants list at
 * the same time, so duplicate detection is per-role, never global.
 *
 * Each invariant is exercised with at least one valid and one invalid state.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { BuildingType, EntityType, JobType, LEADER_OCCUPATION } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import {
  assertSimulationInvariants,
  collectSimulationInvariantErrors,
} from '../src/game/simulation/simulationInvariants';
import { createEntity } from '../src/game/entityFactory';
import { createImmigrantSettler } from '../src/game/worldGen';

afterEach(() => {
  vi.restoreAllMocks();
});

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

function state(entities: Entity[], buildings: Building[], leaderId: number | null = null): WorldState {
  return {
    entities,
    buildings,
    villageLeaderId: leaderId,
    year: 5,
    dayInYear: 10,
    tick: 0,
  } as unknown as WorldState;
}

describe('workforce invariants', () => {
  it('accepts a settler assigned to one residence and one workplace', () => {
    const settler = human(1, { homeBuildingId: 2, residenceBuildingId: 10 });
    const house = building(10, BuildingType.House, { occupants: [1] });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    expect(collectSimulationInvariantErrors(state([settler], [house, farm]))).toEqual([]);
  });

  it('reports a human assigned to two workplaces', () => {
    const settler = human(1, { homeBuildingId: 2 });
    const farmA = building(2, BuildingType.Farm, { occupants: [1] });
    const farmB = building(3, BuildingType.Farm, { occupants: [1] });
    const errors = collectSimulationInvariantErrors(state([settler], [farmA, farmB]));
    expect(errors.some((e) => e.includes('multiple workplaces'))).toBe(true);
  });

  it('reports homeBuildingId missing from the workplace occupants list', () => {
    const settler = human(1, { homeBuildingId: 2 });
    const farm = building(2, BuildingType.Farm, { occupants: [] });
    const errors = collectSimulationInvariantErrors(state([settler], [farm]));
    expect(errors.some((e) => e.includes('missing from that workplace'))).toBe(true);
  });

  it('reports a human listed in workplace occupants without the matching homeBuildingId', () => {
    const worker = human(1, { homeBuildingId: 3 });
    const farmA = building(2, BuildingType.Farm, { occupants: [1] });
    const farmB = building(3, BuildingType.Farm, { occupants: [] });
    const errors = collectSimulationInvariantErrors(state([worker], [farmA, farmB]));
    expect(errors.some((e) => e.includes('homeBuildingId is 3'))).toBe(true);
  });

  it('reports a stale homeBuildingId pointing at a demolished building', () => {
    const settler = human(1, { homeBuildingId: 99 });
    expect(
      collectSimulationInvariantErrors(state([settler], [])).some((e) =>
        e.includes('references demolished or missing building'),
      ),
    ).toBe(true);
  });

  it('reports a stale residenceBuildingId pointing at a demolished building', () => {
    const settler = human(1, { residenceBuildingId: 99 });
    expect(
      collectSimulationInvariantErrors(state([settler], [])).some((e) =>
        e.includes('residenceBuildingId 99 references demolished'),
      ),
    ).toBe(true);
  });

  it('reports a stale prisonBuildingId pointing at a demolished building', () => {
    const prisoner = human(1, { prisonBuildingId: 99 });
    expect(
      collectSimulationInvariantErrors(state([prisoner], [])).some((e) =>
        e.includes('prisonBuildingId 99 references demolished'),
      ),
    ).toBe(true);
  });

  it('reports occupants referencing a missing entity', () => {
    const farm = building(2, BuildingType.Farm, { occupants: [42] });
    expect(
      collectSimulationInvariantErrors(state([human(1)], [farm])).some((e) =>
        e.includes('references missing entity 42'),
      ),
    ).toBe(true);
  });

  it('reports occupants referencing a dead entity', () => {
    const dead = human(2, { alive: false });
    const farm = building(2, BuildingType.Farm, { occupants: [2] });
    expect(
      collectSimulationInvariantErrors(state([dead], [farm])).some((e) =>
        e.includes('references dead entity 2'),
      ),
    ).toBe(true);
  });

  it('accepts a construction crew member with no workplace', () => {
    const builder = human(1);
    const site = building(5, BuildingType.House, { completed: false, occupants: [1] });
    expect(collectSimulationInvariantErrors(state([builder], [site]))).toEqual([]);
  });

  it('reports a construction crew member who also holds a workplace', () => {
    const builder = human(1, { homeBuildingId: 2 });
    const site = building(5, BuildingType.House, { completed: false, occupants: [1] });
    const farm = building(2, BuildingType.Farm, { occupants: [] });
    const errors = collectSimulationInvariantErrors(state([builder], [site, farm]));
    expect(errors.some((e) => e.includes('on construction crew') && e.includes('holds workplace'))).toBe(true);
  });

  it('reports occupants on a building that takes no occupants', () => {
    const settler = human(1);
    const road = building(7, BuildingType.Road, { occupants: [1] });
    expect(
      collectSimulationInvariantErrors(state([settler], [road])).some((e) =>
        e.includes('should have no occupants'),
      ),
    ).toBe(true);
  });

  it('accepts a prison holding one guard and one prisoner', () => {
    const guard = human(1, { homeBuildingId: 8 });
    const prisoner = human(2, { prisonBuildingId: 8 });
    const prison = building(8, BuildingType.Prison, { occupants: [1, 2] });
    expect(collectSimulationInvariantErrors(state([guard, prisoner], [prison]))).toEqual([]);
  });
});

describe('pregnancy invariants', () => {
  it('accepts a pregnant human with valid due progress', () => {
    const mother = human(1, { pregnant: true, pregnancyDueProgress: 100, pregnantById: 2 });
    expect(collectSimulationInvariantErrors(state([mother], []))).toEqual([]);
  });

  it('reports a pregnant human without pregnancyDueProgress', () => {
    const mother = human(1, { pregnant: true });
    expect(
      collectSimulationInvariantErrors(state([mother], [])).some((e) =>
        e.includes('pregnant without a valid pregnancyDueProgress'),
      ),
    ).toBe(true);
  });

  it('reports a non-pregnant human retaining pregnancyDueProgress', () => {
    const mother = human(1, { pregnancyDueProgress: 100 });
    expect(
      collectSimulationInvariantErrors(state([mother], [])).some((e) =>
        e.includes('not pregnant but retains pregnancyDueProgress'),
      ),
    ).toBe(true);
  });

  it('reports a non-pregnant human retaining pregnantById', () => {
    const mother = human(1, { pregnantById: 2 });
    expect(
      collectSimulationInvariantErrors(state([mother], [])).some((e) =>
        e.includes('not pregnant but retains pregnantById'),
      ),
    ).toBe(true);
  });

  it('createEntity({pregnant:true}) produces a valid pregnancyDueProgress (immigrant/world-gen spawn path)', () => {
    // Regression for the flaky full-suite failure in demolish.roundtrip.test.ts:
    // worldGen.createImmigrantSettler spawns an expecting wife via createEntity
    // with pregnant:true but no due progress — the constructor must set it so
    // the §5 invariant holds for every spawn path (BUG REPORTS/2026-08-20-immigrant-pregnancy-missing-due-progress.md).
    const wife = createEntity(EntityType.Human, 10, 10, 101, 100, false, {
      gender: 'female',
      pregnant: true,
      pregnancyProgress: 10,
      pregnantById: 100,
      partnerId: 100,
    });
    expect(wife.pregnant).toBe(true);
    expect(wife.pregnancyDueProgress).toBeGreaterThan(0);
    expect(wife.pregnancyDueProgress).toBeGreaterThan(wife.pregnancyProgress ?? 0);
    expect(Number.isFinite(wife.pregnancyDueProgress)).toBe(true);
    expect(collectSimulationInvariantErrors(state([wife], []))).toEqual([]);
  });

  it('an expecting immigrant couple spawned by createImmigrantSettler holds the invariants', () => {
    // Deterministic version of the RNG-gated path that made the full suite
    // flaky: force Math.random below the 0.12 couple gate so the wife is
    // created pregnant, then assert the whole spawn keeps the invariant clean.
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const world = {
      entities: [],
      buildings: [],
      nextEntityId: 100,
      tick: 0,
      width: 400,
      height: 300,
    } as unknown as WorldState;

    const newcomers = createImmigrantSettler(world, 100, 100, 2);
    expect(newcomers).toHaveLength(2);
    const wife = newcomers.find((e) => e.gender === 'female')!;
    expect(wife.pregnant).toBe(true);
    expect(wife.pregnancyDueProgress).toBeGreaterThan(0);
    expect(collectSimulationInvariantErrors(state(newcomers, []))).toEqual([]);
  });
});

describe('Moon Howler invariant', () => {
  it('accepts at most one living cursed howler', () => {
    const cursed = human(1, { moonHowlerCursed: true });
    expect(collectSimulationInvariantErrors(state([cursed], []))).toEqual([]);
  });

  it('reports multiple living cursed howlers', () => {
    const a = human(1, { moonHowlerCursed: true });
    const b = human(2, { moonHowlerCursed: true });
    expect(
      collectSimulationInvariantErrors(state([a, b], [])).some((e) =>
        e.includes('multiple living Moon Howlers'),
      ),
    ).toBe(true);
  });

  it('ignores a dead cursed howler', () => {
    const dead = human(1, { moonHowlerCursed: true, alive: false });
    const cursed = human(2, { moonHowlerCursed: true });
    expect(collectSimulationInvariantErrors(state([dead, cursed], []))).toEqual([]);
  });
});

describe('leader residency invariants', () => {
  it('accepts a leader residing in the completed manor', () => {
    const leader = human(1, { occupation: LEADER_OCCUPATION, residenceBuildingId: 9 });
    const manor = building(9, BuildingType.LeaderHouse, { occupants: [1] });
    expect(
      collectSimulationInvariantErrors(state([leader], [manor], 1)),
    ).toEqual([]);
  });

  it('accepts a living elected leader during temporary Moon Howler form', () => {
    const transformedLeader = human(1, {
      type: EntityType.Werewolf,
      moonHowlerCursed: true,
      occupation: LEADER_OCCUPATION,
    });
    expect(collectSimulationInvariantErrors(state([transformedLeader], [], 1))).toEqual([]);
  });

  it('reports a villageLeaderId that references no living acting head', () => {
    const deadLeader = human(1, { alive: false });
    expect(
      collectSimulationInvariantErrors(state([deadLeader], [], 1)).some((e) =>
        e.includes('does not reference a living acting village head'),
      ),
    ).toBe(true);
  });

  it('reports a leader not residing in the manor when one exists', () => {
    const leader = human(1, { occupation: LEADER_OCCUPATION, residenceBuildingId: 12 });
    const manor = building(9, BuildingType.LeaderHouse);
    const cottage = building(12, BuildingType.House, { occupants: [1] });
    const errors = collectSimulationInvariantErrors(state([leader], [manor, cottage], 1));
    expect(errors.some((e) => e.includes("not residing in the Leader's House"))).toBe(true);
  });

  it('accepts a leader with no manor built', () => {
    const leader = human(1, { occupation: LEADER_OCCUPATION, residenceBuildingId: 12 });
    const cottage = building(12, BuildingType.House, { occupants: [1] });
    expect(collectSimulationInvariantErrors(state([leader], [cottage], 1))).toEqual([]);
  });
});

describe('assertion wrapper and purity', () => {
  it('assertSimulationInvariants throws with the error list on violation', () => {
    const a = human(1, { moonHowlerCursed: true });
    const b = human(2, { moonHowlerCursed: true });
    expect(() => assertSimulationInvariants(state([a, b], []))).toThrow(
      /Simulation invariants violated/,
    );
  });

  it('assertSimulationInvariants passes on a clean state', () => {
    const settler = human(1, { homeBuildingId: 2, residenceBuildingId: 10 });
    const house = building(10, BuildingType.House, { occupants: [1] });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    expect(() =>
      assertSimulationInvariants(state([settler], [house, farm])),
    ).not.toThrow();
  });

  it('collector never mutates state (pure function)', () => {
    const settler = human(1, { homeBuildingId: 2 });
    const farmA = building(2, BuildingType.Farm, { occupants: [1] });
    const farmB = building(3, BuildingType.Farm, { occupants: [1] });
    const world = state([settler], [farmA, farmB]);
    const before = JSON.stringify(world);

    const errors = collectSimulationInvariantErrors(world);
    expect(errors.length).toBeGreaterThan(0);

    expect(JSON.stringify(world)).toBe(before);
    expect(world.buildings[0].occupants).toEqual([1]);
    expect(world.buildings[1].occupants).toEqual([1]);
  });
});

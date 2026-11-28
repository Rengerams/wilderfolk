/**
 * Housing invariants over generated colonies: what the pipeline promises the world, not how it
 * computes it. Every assertion reads settlement state, never a private helper.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, Season, LEADER_OCCUPATION } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { LAYER_ASSIGN_INTERVAL, LAYER_ASSIGN_PHASE_TICK, tickLayerAssign } from '../src/game/tickLayerAssign';
import { getOpenBeds, getOpenPlayerBeds, getPopulationGrowthReport } from '../src/game/populationGrowth';
import {
  assignMissingResidences,
  type HousingReport,
} from '../src/game/housingPipeline';
import {
  buildResidenceOccupancy,
  getResidenceCapacity,
  isLeaderHouseResidence,
  isResidenceOccupantEntity,
} from '../src/game/housingModel';
import { buildHousingColony } from '../src/test/housingColony';
import type { HousingColony } from '../src/test/housingColony';
import { building, human } from '../src/test/factories';

function assignment(colony: HousingColony): Map<number, number | undefined> {
  return new Map(colony.humans.map((person) => [person.id, person.residenceBuildingId]));
}

function run(colony: HousingColony, humans = colony.humans): HousingReport {
  return assignMissingResidences(humans, colony.buildings, colony.humans);
}

function unhoused(colony: HousingColony): number[] {
  return colony.humans.filter((person) => person.residenceBuildingId == null).map((person) => person.id);
}

/** Capacity, links, manor exclusivity and the derived roster — the settlement's own consistency. */
function settlementProblems(colony: HousingColony): string[] {
  const problems: string[] = [];
  const homes = new Map(colony.buildings.map((home) => [home.id, home]));
  const occupancy = buildResidenceOccupancy(colony.humans);

  for (const person of colony.humans) {
    const homeId = person.residenceBuildingId;
    if (homeId == null) continue;
    const home = homes.get(homeId);
    if (!home || !home.completed) problems.push(`#${person.id} lives in non-home #${homeId}`);
    else if (isLeaderHouseResidence(home)) problems.push(`#${person.id} lives in the manor`);
  }
  for (const house of colony.houses) {
    const count = occupancy.get(house.id) ?? 0;
    if (count > getResidenceCapacity(house)) {
      problems.push(`#${house.id} holds ${count} of ${getResidenceCapacity(house)} beds`);
    }
  }

  const implied = new Map<number, number[]>();
  for (const person of colony.humans) {
    if (!isResidenceOccupantEntity(person)) continue;
    const homeId = person.residenceBuildingId;
    if (homeId == null) continue;
    const ids = implied.get(homeId) ?? [];
    ids.push(person.id);
    implied.set(homeId, ids);
  }
  for (const home of colony.buildings) {
    if (home.type === BuildingType.Prison || !home.completed) continue;
    const expected = implied.get(home.id) ?? [];
    if (home.occupants.join(',') !== expected.join(',')) {
      problems.push(`#${home.id} roster [${home.occupants}] does not match [${expected}]`);
    }
  }
  return problems;
}

describe('generated housing colonies', () => {
  it('settles every generated colony lawfully and consistently', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const colony = buildHousingColony(seed);
      const report = run(colony);

      expect(report.violations, `seed ${seed} audit`).toEqual([]);
      expect(settlementProblems(colony), `seed ${seed} settlement`).toEqual([]);
    }
  });

  it('settles the same colony the same way on identical input', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const first = buildHousingColony(seed);
      run(first);
      const second = buildHousingColony(seed);
      run(second);

      expect(assignment(second), `seed ${seed}`).toEqual(assignment(first));
    }
  });

  it('settles the same colony the same way whatever order the settlers arrive in', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const first = buildHousingColony(seed);
      run(first);

      const second = buildHousingColony(seed);
      run(second, [...second.humans].reverse());

      expect(assignment(second), `seed ${seed}`).toEqual(assignment(first));
    }
  });

  it('reports every settler whose home the run changed', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const colony = buildHousingColony(seed);
      const before = assignment(colony);

      const report = run(colony);
      const reported = new Set(report.relocations.flatMap((relocation) => relocation.members));

      for (const person of colony.humans) {
        if (before.get(person.id) === person.residenceBuildingId) continue;
        expect(reported.has(person.id), `seed ${seed} settler #${person.id}`).toBe(true);
      }
    }
  });

  it('keeps a prisoner’s bed reserved and never moves them', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const colony = buildHousingColony(seed);
      const reserved = new Map(colony.prisoners.map((prisoner) => [prisoner.id, prisoner.residenceBuildingId]));

      run(colony);

      for (const [id, home] of reserved) {
        const prisoner = colony.humans.find((person) => person.id === id) as Entity;
        expect(prisoner.residenceBuildingId, `seed ${seed} prisoner #${id}`).toBe(home);
      }
    }
  });

  it('houses a family the capacity phase split while beds remain', () => {
    const colony = buildHousingColony(2);
    run(colony);
    expect(unhoused(colony)).toEqual([]);
  });

  it('leaves a settled colony unchanged on a second run', () => {
    const colony = buildHousingColony(2);
    run(colony);
    expect(run(colony).relocations).toEqual([]);
  });

  it('never overfills a home when a household cannot fit', () => {
    const home = building(1, BuildingType.House);
    const residents = [1, 2, 3, 4, 5].map((id) => human(id, { residenceBuildingId: home.id }));
    const movers = [11, 12, 13, 14].map((id) => human(id));
    const humans = [...residents, ...movers];

    const report = assignMissingResidences(humans, [home], humans);

    expect(report.violations).toEqual([]);
    expect(buildResidenceOccupancy(humans).get(home.id)).toBe(getResidenceCapacity(home));
    expect(movers.filter((person) => person.residenceBuildingId == null)).toHaveLength(3);
  });
});

/** Day zero's final daily sweep: the weekly safety-audit branch runs on ticks whose day index is 0 mod 7. */
const WEEKLY_AUDIT_TICK = LAYER_ASSIGN_PHASE_TICK + LAYER_ASSIGN_INTERVAL * 3;

function worldWith(entities: Entity[], buildings: WorldState['buildings'], tick: number): WorldState {
  return {
    entities,
    buildings,
    tick,
    year: 0,
    dayInYear: tick,
    season: Season.Spring,
    eventLog: [],
    villageLeaderId: null,
    width: 1000,
    height: 1000,
    humanPopulation: entities.length,
    totalBuildingsCompleted: buildings.length,
    resources: { wood: 1000, stone: 1000, food: 10000, gold: 1000, iron: 1000 },
  } as unknown as WorldState;
}

/** The context `gameTick` assembles for the assignment layer; `newEntities` is this tick's spawns. */
function assignContext(world: WorldState, humans: Entity[], newEntities: Entity[] = []): TickContext {
  const typed = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) typed[type] = [];
  for (const entity of humans) typed[entity.type].push(entity);
  return {
    width: world.width,
    height: world.height,
    hourOfDay: 9,
    season: world.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType: typed,
    aliveEntities: humans,
    newEntities,
    updatedBuildings: world.buildings,
    roadBuildings: [],
    playerHumans: humans,
    entityById: new Map(humans.map((entity) => [entity.id, entity])),
    buildingById: new Map(world.buildings.map((site) => [site.id, site])),
    predators: [],
  } as TickContext;
}

describe('same-tick newcomers reach the assignment pulse', () => {
  it('seats a newborn the birth tick could not fit in the mother’s full home', () => {
    const house = building(1, BuildingType.House);
    const mansion = building(2, BuildingType.Mansion);
    const mother = human(10, { residenceBuildingId: house.id, gender: 'female' });
    const father = human(11, { residenceBuildingId: house.id, partnerId: mother.id });
    mother.partnerId = father.id;
    const children = [12, 13, 14, 15].map((id) => human(id, {
      residenceBuildingId: house.id, motherId: mother.id, fatherId: father.id,
      isJuvenile: true, age: 5,
    }));
    mother.childrenIds = [12, 13, 14, 15];
    const newborn = human(900, {
      motherId: mother.id, fatherId: father.id, isJuvenile: true, age: 0,
    });
    const existing = [mother, father, ...children];
    const world = worldWith(existing, [house, mansion], LAYER_ASSIGN_PHASE_TICK);
    // `playerHumans` and `byType` are the tick-start list, so the newborn travels only in newEntities.
    const context = assignContext(world, existing, [newborn]);

    tickLayerAssign(world, context);

    expect(newborn.residenceBuildingId, 'the same pulse seats the newborn with the family').toBe(mansion.id);
    expect(mother.residenceBuildingId).toBe(mansion.id);
    expect(mother.residenceBuildingId).toBe(newborn.residenceBuildingId);
  });

  it('seats a settler spawned into the tick context before the pulse', () => {
    const house = building(1, BuildingType.House);
    const arrival = human(900);
    const world = worldWith([], [house], LAYER_ASSIGN_PHASE_TICK);

    tickLayerAssign(world, assignContext(world, [], [arrival]));

    expect(arrival.residenceBuildingId).toBe(house.id);
  });
});

describe('the weekly audit observes the housing invariant report', () => {
  it('names a minor left without a home while their custodian is housed', () => {
    const house = building(1, BuildingType.House);
    const mother = human(10, { residenceBuildingId: house.id, gender: 'female' });
    const child = human(11, { motherId: mother.id, isJuvenile: true, age: 6 });
    const tenants = [12, 13, 14, 15, 16].map((id) => human(id, { residenceBuildingId: house.id }));
    const world = worldWith([mother, child, ...tenants], [house], WEEKLY_AUDIT_TICK);

    tickLayerAssign(world, assignContext(world, [mother, child, ...tenants]));

    expect(mother.residenceBuildingId).toBe(house.id);
    expect(child.residenceBuildingId).toBeUndefined();
    const auditLine = world.eventLog.find((entry) => entry.message.startsWith('Housing audit'));
    expect(auditLine, 'the weekly audit writes its violations to the chronicle').toBeDefined();
    expect(auditLine?.message).toContain(`child #${child.id} has no home`);
  });

  it("accepts a separated leader's minor living with that parent in the manor", () => {
    const manor = building(0, BuildingType.LeaderHouse);
    const home = building(565, BuildingType.House);
    const mother = human(2383, {
      age: 18, gender: 'female', occupation: LEADER_OCCUPATION, residenceBuildingId: manor.id,
      childrenIds: [4913], pastPartnerTicks: { 2552: 88330 },
    });
    const father = human(2552, {
      age: 18, gender: 'male', residenceBuildingId: home.id, childrenIds: [4913],
      pastPartnerTicks: { 2383: 88330 },
    });
    const child = human(4913, {
      age: 3, isJuvenile: true, motherId: mother.id, fatherId: father.id, residenceBuildingId: manor.id,
    });
    const people = [mother, father, child];
    const world = worldWith(people, [manor, home], WEEKLY_AUDIT_TICK);
    world.villageLeaderId = mother.id;

    tickLayerAssign(world, assignContext(world, people));

    expect(child.residenceBuildingId).toBe(mother.residenceBuildingId);
    expect(father.residenceBuildingId).toBe(home.id);
    expect(world.eventLog.some((entry) => entry.message.startsWith('Housing audit'))).toBe(false);
  });

  it('audits custodial separation for a protected manor family', () => {
    const manor = building(1, BuildingType.LeaderHouse);
    const cottage = building(2, BuildingType.House);
    const leader = human(10, { residenceBuildingId: manor.id });
    const child = human(11, { motherId: leader.id, isJuvenile: true, age: 6, residenceBuildingId: cottage.id });

    // The leader is protected from ordinary assignment, so only the child is movable.
    const report = assignMissingResidences([child], [manor, cottage], [leader, child]);

    expect(child.residenceBuildingId).toBe(cottage.id);
    expect(report.violations).toContain(`child #${child.id} lives apart from custodian #${leader.id}`);
  });
});

describe('the growth report counts assignable beds', () => {
  it('states the Leader’s House reservation instead of promising its free beds', () => {
    const manor = building(1, BuildingType.LeaderHouse);
    const leader = human(10, { residenceBuildingId: manor.id });
    const homeless = [human(11), human(12)];
    const state = worldWith([leader, ...homeless], [manor], 10) as unknown as WorldState & { maxHumanPopulation: number };
    state.maxHumanPopulation = 100;

    expect(getOpenBeds(state)).toBe(17);
    expect(getOpenPlayerBeds(state)).toBe(0);

    const report = getPopulationGrowthReport(state);
    const text = report.reasons.join(' ');

    expect(text).not.toContain('empty beds and');
    expect(text).toContain('Leader\'s House bed');
    expect(text).toContain('2 settlers without a bed');
    expect(report.tone).toBe('warn');
  });
});

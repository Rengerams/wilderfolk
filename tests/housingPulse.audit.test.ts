/**
 * Home of the pulse contracts: same-tick newcomers reach the assignment pulse, the weekly audit
 * observes the pipeline's invariant report, and the growth report counts only assignable beds.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, Season } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { LAYER_ASSIGN_INTERVAL, LAYER_ASSIGN_PHASE_TICK, tickLayerAssign } from '../src/game/tickLayerAssign';
import { assignMissingResidences } from '../src/game/housingPipeline';
import { getOpenBeds, getOpenPlayerBeds, getPopulationGrowthReport } from '../src/game/populationGrowth';
import { building, human } from '../src/test/factories';

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

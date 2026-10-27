/**
 * Every residence writer respects capacity, not only the daily assign pass.
 *
 * Measured on the 360-day gate (seed 12345, `--trace-housing`): 424 residence writes crossed
 * `getResidenceCapacity`, 399 of them from `syncPartnerResidence`'s couple-only fallback and 25 from
 * the divorce path. Both wrote the whole household into a home picked for the couple alone, and the
 * birth path inherited the mother's bed unconditionally — the "7 of 6" the gate samples.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { syncPartnerResidence } from '../src/game/residencyReconciliation';
import { pickLeastCrowdedResidence } from '../src/game/residencySelection';
import { tryDailyAmicableDivorce } from '../src/game/simulation/humanRelationships';
import { getResidenceCapacity, isResidenceBuilding } from '../src/game/residencyOccupancy';
import { LIFECYCLE_CONFIG, tickPregnancyAndBirth } from '../src/game/simulation/humanLifecycle';
import { seededRandomForRun } from '../src/game/simRng';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';

const FIXTURE_SEED = 20261008;

function residence(id: number): Building {
  const house = createBuilding(BuildingType.House, 400, 400, id);
  house.completed = true;
  return house;
}

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  const human = createEntity(EntityType.Human, 400, 400, id, 200);
  human.alive = true;
  human.isJuvenile = false;
  human.age = 30;
  human.faction = undefined;
  human.partnerId = undefined;
  human.childrenIds = [];
  human.motherId = undefined;
  human.fatherId = undefined;
  human.residenceBuildingId = undefined;
  return Object.assign(human, overrides);
}

function child(id: number, motherId: number, residenceBuildingId?: number): Entity {
  return settler(id, { isJuvenile: true, age: 6, motherId, residenceBuildingId });
}

/** Occupants per residence by the same rule the assign pass counts with. */
function heldByResidence(humans: Entity[]): Map<number, number> {
  const held = new Map<number, number>();
  for (const human of humans) {
    if (!human.alive) continue;
    const id = human.residenceBuildingId;
    if (id == null) continue;
    held.set(id, (held.get(id) ?? 0) + 1);
  }
  return held;
}

function expectWithinCapacity(residences: Building[], humans: Entity[]): void {
  const held = heldByResidence(humans);
  for (const house of residences) {
    expect(held.get(house.id) ?? 0, `house #${house.id} is over capacity`).toBeLessThanOrEqual(
      getResidenceCapacity(house),
    );
  }
}

describe('a residence never holds more settlers than it has beds', () => {
  it('pins the fixture premise: a level-1 House has six beds', () => {
    expect(getResidenceCapacity(residence(1))).toBe(6);
  });

  it('moves the whole household together when one home has room for all of them', () => {
    const houses = [residence(1), residence(2)];
    const mother = settler(20, { residenceBuildingId: 1 });
    const father = settler(21, { residenceBuildingId: 1 });
    mother.partnerId = father.id;
    father.partnerId = mother.id;
    const daughter = child(22, mother.id, 1);
    mother.childrenIds = [daughter.id];
    const housemate = settler(30, { residenceBuildingId: 1 });
    const humans = [mother, father, daughter, housemate];

    syncPartnerResidence(mother, father, houses, humans);

    // The empty house takes the couple and their minor child; nobody is left in the old home.
    expect(mother.residenceBuildingId).toBe(2);
    expect(father.residenceBuildingId).toBe(2);
    expect(daughter.residenceBuildingId).toBe(2);
    expect(housemate.residenceBuildingId).toBe(1);
    expectWithinCapacity(houses, humans);
  });

  it('never overfills a home when no home fits the whole family', () => {
    const houses = [residence(1), residence(2)];
    // House 1 holds three strangers plus the mother and one child (5 of 6).
    const mother = settler(20, { residenceBuildingId: 1 });
    const atHome = child(22, 20, 1);
    const father = settler(21, { residenceBuildingId: 2 });
    const away = child(23, 20, 2);
    mother.partnerId = father.id;
    father.partnerId = mother.id;
    mother.childrenIds = [atHome.id, away.id];
    const humans = [
      mother, father, atHome, away,
      settler(30, { residenceBuildingId: 1 }),
      settler(31, { residenceBuildingId: 1 }),
      settler(32, { residenceBuildingId: 1 }),
      settler(40, { residenceBuildingId: 2 }),
      settler(41, { residenceBuildingId: 2 }),
      settler(42, { residenceBuildingId: 2 }),
      settler(43, { residenceBuildingId: 2 }),
    ];

    // Household of four fits nowhere (5 + 4 and 6 + 4 both exceed six beds), so only the couple may
    // move — the old fallback wrote the children in too and left house 1 holding seven.
    syncPartnerResidence(mother, father, houses, humans);

    expect(heldByResidence(humans).get(1)).toBe(getResidenceCapacity(houses[0]));
    // The child with no bed left still lives with the other parent; the assign pass owns the rest.
    expect(away.residenceBuildingId).toBe(2);
    expectWithinCapacity(houses, humans);
  });
  it('refuses a home with room for only one of two movers', () => {
    const houses = [residence(1)];
    const mover = settler(20, { residenceBuildingId: 1 });
    const partner = settler(21);
    // House 1 is exactly full and already holds one of the pair: the second mover has no bed, so a
    // discount that subtracts the resident mover twice would accept it and overfill the home.
    const humans = [mover, partner, settler(10, { residenceBuildingId: 1 })];
    for (let id = 11; id <= 14; id++) humans.push(settler(id, { residenceBuildingId: 1 }));

    expect(pickLeastCrowdedResidence(humans, houses, 2, {}, undefined, [mover, partner]))
      .toBeUndefined();
  });

  it('does not move a spouse into a full home the other spouse already lives in', () => {
    const houses = [residence(1), residence(2)];
    const atHome = settler(500, { residenceBuildingId: 1 });
    const away = settler(501, { residenceBuildingId: 2 });
    atHome.partnerId = away.id;
    away.partnerId = atHome.id;
    const humans = [atHome, away];
    // Both homes are exactly full, and house 1 already holds one of the couple.
    for (let id = 510; id <= 514; id++) humans.push(settler(id, { residenceBuildingId: 1 }));
    for (let id = 520; id <= 524; id++) humans.push(settler(id, { residenceBuildingId: 2 }));

    syncPartnerResidence(atHome, away, houses, humans);

    expect(atHome.residenceBuildingId).toBe(1);
    expect(away.residenceBuildingId).toBe(2);
    expectWithinCapacity(houses, humans);
  });
});

describe('a divorce moves a child only into a home that has a bed for them', () => {
  it('leaves a child with the other parent when the custodian’s home is full', () => {
    const houses = [residence(1), residence(2)];
    const mother = settler(301, { gender: 'female', relationshipStatus: 'married', residenceBuildingId: 1 });
    const father = settler(302, { gender: 'male', relationshipStatus: 'married', residenceBuildingId: 2 });
    mother.partnerId = father.id;
    father.partnerId = mother.id;
    // The child lives with the father; the mother's home is exactly full without them.
    const daughter = child(303, mother.id, 2);
    daughter.fatherId = father.id;
    const others = [
      settler(310, { residenceBuildingId: 1 }),
      settler(311, { residenceBuildingId: 1 }),
      settler(312, { residenceBuildingId: 1 }),
      settler(313, { residenceBuildingId: 1 }),
      settler(314, { residenceBuildingId: 1 }),
    ];
    const humans = [mother, father, daughter, ...others];
    const state = initGame({ seed: FIXTURE_SEED });
    state.buildings = houses;
    state.entities = humans;
    state.tick = TICKS_PER_DAY;

    tryDailyAmicableDivorce(
      state,
      mother,
      new Map(humans.map((human) => [human.id, human])),
      houses,
      humans,
      () => 0,
    );

    expect(father.partnerId, 'the fixture did not reach the divorce path').toBeUndefined();
    expect(daughter.residenceBuildingId).toBe(2);
    expectWithinCapacity(houses, humans);
  });
});

describe('a newborn takes the mother’s bed only when one is free', () => {
  const MOTHER_ID = 201;
  const FATHER_ID = 202;
  const NEWBORN_ID = 900;

  const birthRoll = (part: string, tick: number): number =>
    seededRandomForRun(`birth:${MOTHER_ID}:${tick}:${part}`);

  function liveBirthTick(): number {
    for (let tick = 1; tick <= 20000; tick++) {
      if (birthRoll('stillborn', tick) >= LIFECYCLE_CONFIG.STILLBORN_CHANCE) return tick;
    }
    throw new Error('no tick produces a live birth in this fixture');
  }

  function mother(pregnant: boolean): Entity {
    return settler(MOTHER_ID, {
      gender: 'female',
      age: 28,
      partnerId: pregnant ? FATHER_ID : undefined,
      pregnant,
      pregnantById: FATHER_ID,
      pregnancyProgress: 9,
      pregnancyDueProgress: 10,
      relationshipStatus: 'expecting',
    });
  }

  /** A world whose house holds `housemates` settlers besides the mother. */
  function birthWorld(housemates: number): { state: WorldState; ctx: TickContext; mother: Entity; house: Building } {
    const house = residence(1);
    const state = initGame({ seed: FIXTURE_SEED });
    const motherEntity = mother(true);
    motherEntity.residenceBuildingId = house.id;
    const others: Entity[] = [motherEntity];
    for (let index = 0; index < housemates; index++) {
      others.push(settler(210 + index, { residenceBuildingId: house.id }));
    }
    state.entities = others;
    state.buildings = [house];
    state.villageLeaderId = null;
    state.nextEntityId = NEWBORN_ID;
    state.tick = liveBirthTick();

    const typed = {} as Record<EntityType, Entity[]>;
    for (const type of Object.values(EntityType)) typed[type] = [];
    for (const entity of others) typed[entity.type].push(entity);
    const entityById = new Map(others.map((entity) => [entity.id, entity]));
    const ctx: TickContext = {
      width: state.width,
      height: state.height,
      hourOfDay: 8,
      season: state.season,
      grassMult: 1,
      reproMult: 1,
      winterPenalty: 1,
      canHeat: true,
      byType: typed,
      aliveEntities: others,
      newEntities: [],
      updatedBuildings: [house],
      roadBuildings: [],
      playerHumans: others,
      entityById,
      buildingById: new Map([[house.id, house]]),
      predators: [],
    };
    return { state, ctx, mother: motherEntity, house };
  }

  function runBirth(state: WorldState, ctx: TickContext, motherEntity: Entity): Entity | undefined {
    tickPregnancyAndBirth(state, ctx, motherEntity, {
      livingHumanAt: (id) => {
        const entity = id == null ? undefined : ctx.entityById.get(id);
        return entity?.alive && entity.type === EntityType.Human ? entity : undefined;
      },
    });
    return ctx.newEntities.find((entity) => entity.id === NEWBORN_ID);
  }

  it('seats the newborn when the house still has a bed', () => {
    const cap = getResidenceCapacity(residence(1));
    const { state, ctx, mother: motherEntity, house } = birthWorld(cap - 2);

    const newborn = runBirth(state, ctx, motherEntity);

    expect(newborn).toBeDefined();
    expect(newborn?.residenceBuildingId).toBe(house.id);
    expect(isResidenceBuilding(house)).toBe(true);
  });

  it('leaves the newborn unassigned when the house is already full', () => {
    const cap = getResidenceCapacity(residence(1));
    const { state, ctx, mother: motherEntity, house } = birthWorld(cap - 1);

    const newborn = runBirth(state, ctx, motherEntity);

    expect(newborn).toBeDefined();
    expect(newborn?.residenceBuildingId).toBeUndefined();
    expect(heldByResidence([...state.entities, newborn!]).get(house.id)).toBe(cap);
  });
});

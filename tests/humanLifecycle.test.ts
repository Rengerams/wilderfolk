/**
 * Lifecycle golden contracts — the birth owner must leave valid pregnancy,
 * lineage, event, and same-tick index state on every outcome.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { tickPregnancyAndBirth } from '../src/game/simulation/humanLifecycle';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { createEntity } from '../src/game/entityFactory';

const MATERNAL_ID = 1;
const FATHER_ID = 2;
const HUSBAND_ID = 3;
const NEWBORN_ID = 100;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 100,
    maxEnergy: 100,
    age: 28,
    birthYear: -28,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: id === MATERNAL_ID ? 'female' : 'male',
    name: id === MATERNAL_ID ? 'Maren' : id === FATHER_ID ? 'Erik' : 'Ivar',
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    relationshipStatus: 'married',
    childrenIds: [],
    reproductionCooldown: 0,
    ...overrides,
  } as Entity;
}

function byType(entities: Entity[]): Record<EntityType, Entity[]> {
  const buckets = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) buckets[type] = [];
  for (const entity of entities) buckets[entity.type].push(entity);
  return buckets;
}

function makeFixture(entities: Entity[], deer: Entity[] = []): {
  state: WorldState;
  ctx: TickContext;
  mother: Entity;
} {
  const state = initGame();
  const mother = entities.find((entity) => entity.id === MATERNAL_ID)!;
  state.entities = entities;
  state.villageLeaderId = null;
  state.nextEntityId = NEWBORN_ID;
  state.tick = 72;
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const typed = byType([...entities, ...deer]);
  typed[EntityType.Deer] = deer;
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
    aliveEntities: entities,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: entities,
    entityById,
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
    predators: [],
  };
  return { state, ctx, mother };
}

function runBirth(state: WorldState, ctx: TickContext, mother: Entity): void {
  tickPregnancyAndBirth(state, ctx, mother, {
    livingHumanAt: (id) => {
      const entity = id == null ? undefined : ctx.entityById.get(id);
      return entity?.alive && entity.type === EntityType.Human ? entity : undefined;
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('human lifecycle golden contracts', () => {
  it('creates one ordinary newborn and clears every completed-pregnancy field in the same tick', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const father = human(FATHER_ID);
    const mother = human(MATERNAL_ID, {
      partnerId: FATHER_ID,
      pregnant: true,
      pregnantById: FATHER_ID,
      pregnancyProgress: 9,
      pregnancyDueProgress: 10,
      relationshipStatus: 'expecting',
    });
    const { state, ctx } = makeFixture([mother, father]);

    runBirth(state, ctx, mother);

    const child = ctx.newEntities.find((entity) => entity.type === EntityType.Human);
    expect(child).toBeDefined();
    expect(child?.id).toBe(NEWBORN_ID);
    expect(child?.motherId).toBe(MATERNAL_ID);
    expect(child?.fatherId).toBe(FATHER_ID);
    expect(child?.age).toBe(0);
    expect(ctx.entityById.get(NEWBORN_ID)).toBe(child);
    expect(mother.childrenIds).toContain(NEWBORN_ID);
    expect(father.childrenIds).toContain(NEWBORN_ID);
    expect(mother.pregnant).toBe(false);
    expect(mother.pregnancyProgress).toBe(0);
    expect(mother.pregnancyDueProgress).toBeUndefined();
    expect(mother.pregnantById).toBeUndefined();
    expect(mother.relationshipStatus).toBe('married');
    expect(collectSimulationInvariantErrors({ ...state, entities: [...state.entities, ...ctx.newEntities] })).toEqual([]);
  });

  it('records a stillbirth without creating a child and still clears pregnancy state', () => {
    const mother = human(MATERNAL_ID, {
      pregnant: true,
      pregnancyProgress: 9,
      pregnancyDueProgress: 10,
      relationshipStatus: 'expecting',
    });
    const { state, ctx } = makeFixture([mother]);
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0); // birth position angle
    random.mockReturnValueOnce(0); // stillbirth (no deer means no Wildkin roll)

    runBirth(state, ctx, mother);

    expect(ctx.newEntities).toEqual([]);
    expect(mother.pregnant).toBe(false);
    expect(mother.pregnancyDueProgress).toBeUndefined();
    expect(mother.pregnantById).toBeUndefined();
    expect(mother.griefUntilTick).toBeGreaterThan(state.tick);
    expect(state.eventLog.some((event) => event.type === 'death' && event.message.includes('stillborn'))).toBe(true);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });

  it('creates a Wildkin instead of a human child when the rare ecological birth path wins', () => {
    const deer = {
      id: 90,
      type: EntityType.Deer,
      x: 110,
      y: 100,
      alive: true,
    } as Entity;
    const mother = human(MATERNAL_ID, {
      pregnant: true,
      pregnancyProgress: 9,
      pregnancyDueProgress: 10,
      relationshipStatus: 'expecting',
    });
    const { state, ctx } = makeFixture([mother], [deer]);
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0); // birth position angle
    random.mockReturnValueOnce(0); // Wildkin chance

    runBirth(state, ctx, mother);

    expect(ctx.newEntities).toHaveLength(1);
    expect(ctx.newEntities[0]?.type).toBe(EntityType.Wildkin);
    expect(mother.childrenIds).toEqual([]);
    expect(mother.pregnant).toBe(false);
    expect(state.eventLog.some((event) => event.type === 'birth' && event.message.includes('Wildkin'))).toBe(true);
    expect(collectSimulationInvariantErrors({ ...state, entities: [...state.entities, ...ctx.newEntities] })).toEqual([]);
  });

  it('records biological lineage and a bastard outcome when the husband is not the biological father', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const father = human(FATHER_ID, { relationshipStatus: 'single' });
    const husband = human(HUSBAND_ID, { relationshipStatus: 'expecting' });
    const mother = human(MATERNAL_ID, {
      partnerId: HUSBAND_ID,
      pregnant: true,
      pregnantById: FATHER_ID,
      pregnancyProgress: 9,
      pregnancyDueProgress: 10,
      relationshipStatus: 'expecting',
    });
    const { state, ctx } = makeFixture([mother, father, husband]);

    runBirth(state, ctx, mother);

    const child = ctx.newEntities.find((entity) => entity.type === EntityType.Human)!;
    expect(child.isBastard).toBe(true);
    expect(child.fatherId).toBe(FATHER_ID);
    expect(child.motherId).toBe(MATERNAL_ID);
    expect(father.childrenIds).toContain(child.id);
    expect(husband.childrenIds).not.toContain(child.id);
    expect(state.eventLog.some((event) => event.type === 'birth' && event.message.includes('bastard'))).toBe(true);
    expect(state.eventLog.some((event) => event.type === 'scandal' && event.message.includes('may not be'))).toBe(true);
  });

  it('gives a spawned pregnant immigrant a finite due progress above current progress', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const immigrant = createEntity(EntityType.Human, 10, 10, 40, 100, false, {
      gender: 'female',
      partnerId: 41,
      pregnant: true,
      pregnantById: 41,
      pregnancyProgress: 15,
    });

    expect(immigrant.pregnant).toBe(true);
    expect(immigrant.pregnancyDueProgress).toBeGreaterThan(immigrant.pregnancyProgress ?? 0);
    expect(Number.isFinite(immigrant.pregnancyDueProgress)).toBe(true);
    expect(collectSimulationInvariantErrors({ entities: [immigrant], buildings: [] } as WorldState)).toEqual([]);
  });
});

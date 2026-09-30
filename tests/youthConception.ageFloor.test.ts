/**
 * Youth conception age floor — ages 12 and 13 are eligible (owner decision, 2026-09-13).
 *
 * The youth-love minimum age is 12 (`YOUTH_LOVE_MIN_AGE` in
 * `simulation/humanRelationships.ts`), so the youth-conception gate has to admit the
 * same ages: `YOUTH_CONCEPTION_MULTIPLIERS` now carries 12 and 13 entries (0.25, the
 * same base value 14 already used) and `HUMAN_FERTILITY_START` is 12.
 *
 * These tests pin the floor (11 still cannot conceive, so the window did not silently
 * widen further) and prove that a 12/13 pregnancy remains reachable *only* through an
 * existing mutual youth-love pair — the ownership rule in
 * `docs/archive/SIMULATION_AUTHORITY.md` §5 ("At ages 12–17 it requires the documented
 * mutual youth-love, nearby, energy, and reduced-probability gate").
 *
 * SCOPE — writer-level tests: they build a synthetic `WorldState` around `initGame()`,
 * place the pair by hand, and call the conception owner directly. Conception rolls are
 * stateless per settler and *day* (`personDayRoll`), so a passing branch is forced by
 * choosing the day rather than by stubbing randomness.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tryDailyConception } from '../src/game/simulation/humanRelationships';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/humanSchedule';
import {
  HUMAN_FERTILITY_START,
  getFemaleFertility,
  getYouthConceptionMultiplier,
} from '../src/game/dayCycle';

const MOTHER_ID = 1;
const FATHER_ID = 2;
const FIXTURE_SEED = 20240913;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age: 12,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: id === MOTHER_ID ? 'female' : 'male',
    name: id === MOTHER_ID ? 'Maren' : 'Erik',
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function byType(entities: Entity[]): Record<EntityType, Entity[]> {
  const buckets = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) buckets[type] = [];
  for (const entity of entities) buckets[entity.type].push(entity);
  return buckets;
}

/** A colony-day fixture: a complete valid world from `initGame()` plus the pair under test. */
function makeFixture(entities: Entity[]): { state: WorldState; ctx: TickContext; mother: Entity } {
  const state = initGame({ seed: FIXTURE_SEED });
  const mother = entities.find((entity) => entity.id === MOTHER_ID)!;
  state.entities = entities;
  state.villageLeaderId = null;
  state.tick = TICKS_PER_DAY;
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const ctx: TickContext = {
    width: state.width,
    height: state.height,
    hourOfDay: 8,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType: byType(entities),
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

/** A day whose youth-conception roll (salt 604) is far below any real chance product. */
function passingYouthDay(): number {
  for (let day = 1; day <= 20000; day++) {
    if (personDayRoll(MOTHER_ID, day * TICKS_PER_DAY, 604) < 0.0008) return day;
  }
  throw new Error('no day produces a passing youth-conception roll');
}

/** Mutual youth-love pair at the given age, standing together. */
function youthPair(age: number): Entity[] {
  return [
    human(MOTHER_ID, { age, youthLovePartnerId: FATHER_ID }),
    human(FATHER_ID, { age, youthLovePartnerId: MOTHER_ID }),
  ];
}

describe('the fertility window opens at the youth-love age (12), not below', () => {
  it('reports fertility and a reduced conception multiplier from 12', () => {
    expect(HUMAN_FERTILITY_START).toBe(12);
    expect(getFemaleFertility(11)).toBe(0);
    expect(getFemaleFertility(12)).toBeGreaterThan(0);

    expect(getYouthConceptionMultiplier(11)).toBe(0);
    expect(getYouthConceptionMultiplier(12)).toBe(0.25);
    expect(getYouthConceptionMultiplier(13)).toBe(0.25);
    expect(getYouthConceptionMultiplier(14)).toBe(0.25);
    expect(getYouthConceptionMultiplier(17)).toBe(0.70);
    expect(getYouthConceptionMultiplier(18)).toBe(1);
  });
});

describe('a 12 or 13 year old can conceive only through a mutual youth-love pair', () => {
  it('conceives at age 12 and at age 13 on a passing day', () => {
    for (const age of [12, 13]) {
      const { state, ctx, mother } = makeFixture(youthPair(age));
      state.tick = passingYouthDay() * TICKS_PER_DAY;

      expect(tryDailyConception(state, ctx, mother)).toBe(true);
      expect(mother.pregnant).toBe(true);
      expect(mother.pregnantById).toBe(FATHER_ID);
      expect(state.eventLog.filter((event) => event.type === 'conception')).toHaveLength(1);
    }
  });

  it('does not conceive below the floor, even with a mutual link and a passing roll', () => {
    const { state, ctx, mother } = makeFixture(youthPair(11));
    state.tick = passingYouthDay() * TICKS_PER_DAY;

    expect(getFemaleFertility(11)).toBe(0);
    expect(tryDailyConception(state, ctx, mother)).toBe(false);
    expect(mother.pregnant).toBeUndefined();
  });

  it('does not conceive at 12 without a mutual youth-love link', () => {
    const oneSided = makeFixture([
      human(MOTHER_ID, { age: 12, youthLovePartnerId: FATHER_ID }),
      human(FATHER_ID, { age: 12 }),
    ]);
    oneSided.state.tick = passingYouthDay() * TICKS_PER_DAY;
    expect(tryDailyConception(oneSided.state, oneSided.ctx, oneSided.mother)).toBe(false);
    expect(oneSided.mother.pregnant).toBeUndefined();

    const unlinked = makeFixture([human(MOTHER_ID, { age: 12 }), human(FATHER_ID, { age: 12 })]);
    unlinked.state.tick = passingYouthDay() * TICKS_PER_DAY;
    expect(tryDailyConception(unlinked.state, unlinked.ctx, unlinked.mother)).toBe(false);
    expect(unlinked.mother.pregnant).toBeUndefined();
  });
});

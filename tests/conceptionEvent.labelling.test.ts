/**
 * Writer-level tests: the conception owner must emit the `conception` event type, never `'birth'`,
 * because every `'birth'` consumer treats the event as a delivered child.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tryDailyConception } from '../src/game/simulation/humanRelationships';
import { LIFECYCLE_CONFIG, tickPregnancyAndBirth } from '../src/game/simulation/humanLifecycle';
import { collectDashboard } from '../src/game/dashboardData';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { TICKS_PER_DAY, ticksForDays } from '../src/game/dayCycleClock';

import { seededRandomForRun, personDayRoll } from '../src/game/simRng';
import { byType } from '../src/test/factories';

const MOTHER_ID = 1;
const FATHER_ID = 2;
const NEWBORN_ID = 100;
/** Fixed so the delivery's seeded birth rolls (below) are reproducible. */
const FIXTURE_SEED = 20240913;

/**
 * A tick whose real stillbirth roll clears `LIFECYCLE_CONFIG.STILLBORN_CHANCE`, i.e. a live delivery.
 */
function liveBirthTick(): number {
  for (let tick = 1; tick <= 20000; tick++) {
    if (
      seededRandomForRun(`birth:${MOTHER_ID}:${tick}:stillborn`)
      >= LIFECYCLE_CONFIG.STILLBORN_CHANCE
    ) {
      return tick;
    }
  }
  throw new Error('no tick produces a live birth');
}

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 200,
    maxEnergy: 200,
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
    gender: id === MOTHER_ID ? 'female' : 'male',
    name: id === MOTHER_ID ? 'Maren' : 'Erik',
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    ...overrides,
  } as Entity;
}

/**
 * A colony-day fixture: `initGame({ skipTerrain: true })` plus both settlers, who share a spot so
 * only the probability roll decides.
 */
function makeFixture(entities: Entity[]): { state: WorldState; ctx: TickContext; mother: Entity } {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const mother = entities.find((entity) => entity.id === MOTHER_ID)!;
  state.entities = entities;
  state.villageLeaderId = null;
  state.nextEntityId = NEWBORN_ID;
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

function eventTypes(state: WorldState): string[] {
  return state.eventLog.map((event) => event.type);
}

/**
 * Conception rolls are stateless per settler and day (`personDayRoll(id, tick, salt)`), so a branch
 * is forced by choosing the day; day→tick goes through `ticksForDays`.
 */
function dayWhere(predicate: (day: number) => boolean): number {
  for (let day = 1; day <= 5000; day++) {
    if (predicate(day)) return day;
  }
  throw new Error('no day produces the wanted conception roll');
}
/** A day whose conception roll is far below any real chance product. */
const conceptionDay = (salt: number): number =>
  dayWhere((day) => personDayRoll(MOTHER_ID, ticksForDays(day), salt) < 0.001);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('conception is labelled as its own event type', () => {
  it('logs a married conception as `conception`, never as `birth`', () => {
    const father = human(FATHER_ID, { partnerId: MOTHER_ID, relationshipStatus: 'married' });
    const mother = human(MOTHER_ID, { partnerId: FATHER_ID, relationshipStatus: 'married' });
    const { state, ctx } = makeFixture([mother, father]);
    state.tick = ticksForDays(conceptionDay(603));

    expect(tryDailyConception(state, ctx, mother)).toBe(true);
    expect(mother.pregnant).toBe(true);

    const conception = state.eventLog.filter((event) => event.type === 'conception');
    expect(conception).toHaveLength(1);
    expect(conception[0]?.message).toBe('Maren Vale and Erik Vale are expecting a child');
    expect(eventTypes(state)).not.toContain('birth');
  });

  it('logs a youth-love conception as `conception`, never as `birth`', () => {
    const youthFather = human(FATHER_ID, {
      age: 16,
      isJuvenile: true,
      relationshipStatus: 'single',
      youthLovePartnerId: MOTHER_ID,
    });
    const youthMother = human(MOTHER_ID, {
      age: 16,
      isJuvenile: true,
      relationshipStatus: 'single',
      youthLovePartnerId: FATHER_ID,
    });
    const { state, ctx } = makeFixture([youthMother, youthFather]);
    state.tick = ticksForDays(conceptionDay(604));

    expect(tryDailyConception(state, ctx, youthMother)).toBe(true);
    expect(youthMother.pregnant).toBe(true);
    expect(youthMother.pregnancyFromYouthLove).toBe(true);

    expect(state.eventLog.filter((event) => event.type === 'conception')).toHaveLength(1);
    expect(eventTypes(state)).not.toContain('birth');
  });

  it('keeps the youth-conception origin through a save and load even after a breakup', () => {
    const youthFather = human(FATHER_ID, {
      age: 16,
      isJuvenile: true,
      relationshipStatus: 'single',
      youthLovePartnerId: MOTHER_ID,
    });
    const youthMother = human(MOTHER_ID, {
      age: 16,
      isJuvenile: true,
      relationshipStatus: 'single',
      youthLovePartnerId: FATHER_ID,
    });
    const { state, ctx } = makeFixture([youthMother, youthFather]);
    state.tick = ticksForDays(conceptionDay(604));
    expect(tryDailyConception(state, ctx, youthMother)).toBe(true);
    expect(youthMother.pregnancyFromYouthLove).toBe(true);

    youthMother.youthLovePartnerId = undefined;
    youthFather.youthLovePartnerId = undefined;
    const saved = structuredClone(buildSaveData(state, createInitialView(state.width, state.height)));
    const result = loadGameFromParsedOutcome(saved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = result.world.entities.find((e) => e.id === MOTHER_ID);
    expect(restored?.pregnant).toBe(true);
    expect(restored?.pregnantById).toBe(FATHER_ID);
    expect(restored?.pregnancyFromYouthLove).toBe(true);
  });

  it('counts an expectation separately from births in the council report', () => {
    const father = human(FATHER_ID, { partnerId: MOTHER_ID, relationshipStatus: 'married' });
    const mother = human(MOTHER_ID, { partnerId: FATHER_ID, relationshipStatus: 'married' });
    const { state, ctx } = makeFixture([mother, father]);
    const conceptionAt = conceptionDay(603);
    state.tick = ticksForDays(conceptionAt);
    expect(tryDailyConception(state, ctx, mother)).toBe(true);

    // The council report summarises the last *finished* day, so the day the
    // expectation was logged must already be closed when the report is read.
    state.tick = ticksForDays(conceptionAt + 1);
    const lifeEvents = collectDashboard(state).council.find((line) => line.label === 'Life events');

    expect(lifeEvents?.value).toContain('Births 0');
    expect(lifeEvents?.value).toContain('Expecting 1');
  });
});

describe('a delivery is still labelled as a birth', () => {
  it('writes `birth` for the delivered child and no expectation event', () => {
    const father = human(FATHER_ID, { partnerId: MOTHER_ID, relationshipStatus: 'expecting' });
    const mother = human(MOTHER_ID, {
      partnerId: FATHER_ID,
      relationshipStatus: 'expecting',
      pregnant: true,
      pregnantById: FATHER_ID,
      pregnancyProgress: 9,
      pregnancyDueProgress: 10,
    });
    const { state, ctx } = makeFixture([mother, father]);
    state.tick = liveBirthTick();

    tickPregnancyAndBirth(state, ctx, mother, {
      livingHumanAt: (id) => {
        const entity = id == null ? undefined : ctx.entityById.get(id);
        return entity?.alive && entity.type === EntityType.Human ? entity : undefined;
      },
    });

    expect(ctx.newEntities.some((entity) => entity.type === EntityType.Human)).toBe(true);
    const births = state.eventLog.filter((event) => event.type === 'birth');
    expect(births).toHaveLength(1);
    expect(births[0]?.message).toContain('was born');
    expect(eventTypes(state)).not.toContain('conception');
    expect(
      collectSimulationInvariantErrors({ ...state, entities: [...state.entities, ...ctx.newEntities] }),
    ).toEqual([]);
  });
});

describe('the live-delivery fixture follows the stillbirth owner', () => {
  it('returns a tick that clears the owner threshold', () => {
    const tick = liveBirthTick();
    expect(seededRandomForRun(`birth:${MOTHER_ID}:${tick}:stillborn`)).toBeGreaterThanOrEqual(
      LIFECYCLE_CONFIG.STILLBORN_CHANCE,
    );
  });

  it('compares against STILLBORN_CHANCE rather than a literal', () => {
    // Source guard: the helper's own body must name the owner. Without this case the detached
    // `>= 0.5` copy is invisible, because today it picks the same live-birth tick (duplication G2).
    const source = readFileSync(
      resolve(process.cwd(), 'tests/conceptionEvent.labelling.test.ts'),
      'utf8',
    );
    const start = source.indexOf('function liveBirthTick');
    const end = source.indexOf("throw new Error('no tick produces a live birth')");
    expect(start, 'fixture premise: the helper is still in this file').toBeGreaterThan(-1);
    expect(end, 'fixture premise: the helper still throws when no tick works').toBeGreaterThan(start);
    const helper = source.slice(start, end);
    expect(helper, 'the helper no longer asks the owner for the threshold').toContain(
      'LIFECYCLE_CONFIG.STILLBORN_CHANCE',
    );
    expect(helper, 'the magic stillbirth literal is back').not.toMatch(/>=\s*0\.\d/);
  });
});
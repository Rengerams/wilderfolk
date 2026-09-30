/**
 * Low-severity batch 3 — Moon Howler lifecycle, one-Howler ownership, birth residence
 * consistency, and youth-love death cleanup.
 *
 * Regression coverage for:
 *   - `transformToWerewolfForm` must detach the cursed settler from the building
 *     occupants lists it clears the ids from (L48 / the debug-command route);
 *   - the debug curse command is a curse route and must obey §5's one-Howler colony gate
 *     (no second living cursed Moon Howler, no second spawn path);
 *   - `tickMoonHowlerCycle`'s injectable rng must reach the Church rite (L49);
 *   - the hour-granular full-moon gate must fire the nightfall card once per moon, not on
 *     all TICKS_PER_HOUR ticks of hour 20, and the replacement roll once per moon;
 *   - a newborn gets `residenceBuildingId`, so it must be visible to the assign layer
 *     before the daily invariant collector runs;
 *   - death cleanup must not leave a one-sided youth-love link (§5).
 *
 * Moon Howler fixtures follow tests/moonHowler.test.ts; the birth fixture follows
 * tests/humanLifecycle.test.ts (the birth rolls are seeded, so the tick is picked by search).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { DAYS_PER_MOON_CYCLE, NIGHT_START } from '../src/game/dayCycleConstants';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { countActiveMoonHowlerCurses, tickMoonHowlerCycle } from '../src/game/moonHowler';
import { spawnMoonHowlerDebug } from '../src/game/settlerInteractionActions';
import { killHuman, reconcileOrphanedMarriages } from '../src/game/humanLifecycleCleanup';
import { LIFECYCLE_CONFIG, tickPregnancyAndBirth } from '../src/game/simulation/humanLifecycle';
import { tickLayerAssign } from '../src/game/tickLayerAssign';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { resetSimRng, seededRandomForRun } from '../src/game/simRng';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { byType, finishedBuilding, human as sharedHuman } from '../src/test/factories';

const FIXTURE_SEED = 20240913;
const FULL_MOON_DAY = DAYS_PER_MOON_CYCLE;
const FULL_MOON_NIGHTFALL_TICK = FULL_MOON_DAY * TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR;

const FARM_ID = 300;
const HOUSE_ID = 500;
const CHURCH_ID = 700;
const CLERIC_ID = 90;
const MATERNAL_ID = 1;
const FATHER_ID = 2;
const NEWBORN_ID = 100;

afterEach(() => {
  vi.restoreAllMocks();
  resetSimRng();
});

/** This file's settlers stand at (100, 100) and default to male; the shared factory does neither. */
const human = (id: number, overrides: Partial<Entity> = {}): Entity =>
  sharedHuman(id, { x: 100, y: 100, gender: 'male', ...overrides });

/** Real world state (initGame) with the fixture entities/buildings and a chosen tick. */
function moonState(entities: Entity[], buildings: Building[], tick: number): WorldState {
  const state = initGame({ seed: FIXTURE_SEED });
  state.entities = entities;
  state.buildings = buildings;
  state.villageLeaderId = null;
  state.nextEntityId = 10_000;
  state.tick = tick;
  state.bigNews = [];
  state.eventLog = [];
  state.notifications = [];
  state.floatingTexts = [];
  return state;
}

function sevenAdults(): Entity[] {
  return Array.from({ length: 7 }, (_, i) => human(i + 1, { gender: i % 2 === 0 ? 'male' : 'female' }));
}

describe('debug Moon Howler curse (L48 + one-Howler ownership)', () => {
  it('detaches the cursed settler from every occupants list it clears ids from', () => {
    const settler = human(1, { homeBuildingId: FARM_ID, residenceBuildingId: HOUSE_ID });
    const farm = finishedBuilding(FARM_ID, BuildingType.Farm, { occupants: [1] });
    const house = finishedBuilding(HOUSE_ID, BuildingType.House, { occupants: [1] });
    const state = moonState([settler], [farm, house], FULL_MOON_NIGHTFALL_TICK);

    const cursed = spawnMoonHowlerDebug(state);

    const howler = cursed.entities.find((entity) => entity.moonHowlerCursed);
    expect(howler).toBeDefined();
    expect(howler?.type).toBe(EntityType.Werewolf);
    expect(howler?.homeBuildingId).toBeUndefined();
    expect(howler?.residenceBuildingId).toBeUndefined();
    // The command clones the world, so inspect the buildings it returned.
    const farmAfter = cursed.buildings.find((b) => b.id === FARM_ID);
    const houseAfter = cursed.buildings.find((b) => b.id === HOUSE_ID);
    expect(farmAfter?.occupants).not.toContain(howler?.id);
    expect(houseAfter?.occupants).not.toContain(howler?.id);
    // §5 workplace/residence: no assignment id may point at a building that lists the settler
    // (and no occupants list may keep a settler whose ids were cleared).
    expect(collectSimulationInvariantErrors(cursed)).toEqual([]);
  });

  it('cannot create a second living cursed Moon Howler while one stalks the valley', () => {
    const existing = human(1, { moonHowlerCursed: true });
    const state = moonState([existing, ...sevenAdults()], [], FULL_MOON_NIGHTFALL_TICK);

    const after = spawnMoonHowlerDebug(state);

    expect(countActiveMoonHowlerCurses(after.entities)).toBe(1);
    expect(after.entities.filter((entity) => entity.moonHowlerCursed)).toHaveLength(1);
    expect(collectSimulationInvariantErrors(after)).toEqual([]);
  });
});

describe('Moon Howler cadence + injected RNG', () => {
  it('runs the Church rite on the injected stream, not raw Math.random (L49)', () => {
    // The howler is already in werewolf form and hunting, 80px from the priest, so the rite
    // reaches its roll without a transform/nudge changing the geometry.
    const cursed = human(1, {
      type: EntityType.Werewolf,
      moonHowlerCursed: true,
      name: 'Bjorn',
      surname: 'Moonborn',
      x: 400,
      y: 320,
    });
    const cleric = human(CLERIC_ID, {
      name: 'Ingrid',
      gender: 'female',
      job: JobType.Priest,
      occupation: 'priest',
      homeBuildingId: CHURCH_ID,
      x: 320,
      y: 320,
    });
    const church = finishedBuilding(CHURCH_ID, BuildingType.Church, {
      occupants: [CLERIC_ID],
      x: 300,
      y: 300,
      width: 50,
      height: 56,
    });
    const state = moonState([cursed, ...sevenAdults(), cleric], [church], FULL_MOON_NIGHTFALL_TICK);
    const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));

    // Raw randomness would cure (0.1 < 0.35). The injected stream says flee, so a curse that
    // survives proves tickMoonHowlerCycle forwarded its rng into the rite.
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    tickMoonHowlerCycle(
      state,
      state.entities,
      state.buildings,
      FULL_MOON_DAY,
      NIGHT_START,
      entityById,
      undefined,
      () => 0.99,
    );

    expect(cursed.moonHowlerCursed).toBe(true);
    expect(state.eventLog.some((event) => event.message.includes('failed to break'))).toBe(true);
    expect(cleric.alive).toBe(true);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });

  it('announces full-moon nightfall once per moon, not on every tick of hour 20', () => {
    const survivor = human(1, { moonHowlerCursed: true });
    const state = moonState([survivor, ...sevenAdults().filter((h) => h.id !== 1)], [], FULL_MOON_NIGHTFALL_TICK);
    const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));

    for (let offset = 0; offset < TICKS_PER_HOUR; offset++) {
      state.tick = FULL_MOON_NIGHTFALL_TICK + offset;
      tickMoonHowlerCycle(
        state,
        state.entities,
        [],
        FULL_MOON_DAY,
        NIGHT_START,
        entityById,
        undefined,
        () => 0.99,
      );
    }

    const nightfallCards = state.bigNews.filter((news) => news.title.includes('Full Moon'));
    expect(nightfallCards).toHaveLength(1);
  });

  it('decides the rare replacement roll once, on the first tick of the nightfall hour', () => {
    const state = moonState(sevenAdults(), [], FULL_MOON_NIGHTFALL_TICK);
    const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));
    let draws = 0;
    const rng = (): number => {
      draws += 1;
      return 0.99; // fail the replacement roll
    };

    for (let offset = 0; offset < TICKS_PER_HOUR; offset++) {
      state.tick = FULL_MOON_NIGHTFALL_TICK + offset;
      tickMoonHowlerCycle(state, state.entities, [], FULL_MOON_DAY, NIGHT_START, entityById, undefined, rng);
    }

    // One roll per full moon: the gate (and the population scans behind it) runs once.
    expect(draws).toBe(1);
    expect(countActiveMoonHowlerCurses(state.entities)).toBe(0);
  });
});

describe('birth vs the residence invariant', () => {
  const birthRoll = (part: string, tick: number): number =>
    seededRandomForRun(`birth:${MATERNAL_ID}:${tick}:${part}`);

  function liveBirthTick(): number {
    for (let tick = 1; tick <= 20_000; tick++) {
      if (birthRoll('stillborn', tick) >= LIFECYCLE_CONFIG.STILLBORN_CHANCE) return tick;
    }
    throw new Error('no tick produces a live birth');
  }

  function birthFixture(): { state: WorldState; ctx: TickContext; mother: Entity; house: Building } {
    const state = initGame({ seed: FIXTURE_SEED });
    const house = finishedBuilding(HOUSE_ID, BuildingType.House, {
      occupants: [MATERNAL_ID, FATHER_ID],
      width: 40,
      height: 40,
    });
    const mother = human(MATERNAL_ID, {
      gender: 'female',
      name: 'Maren',
      surname: 'Vale',
      partnerId: FATHER_ID,
      relationshipStatus: 'expecting',
      residenceBuildingId: HOUSE_ID,
      pregnant: true,
      pregnantById: FATHER_ID,
      pregnancyProgress: 9,
      pregnancyDueProgress: 10,
      reproductionCooldown: 0,
    });
    const father = human(FATHER_ID, {
      name: 'Erik',
      surname: 'Vale',
      partnerId: MATERNAL_ID,
      relationshipStatus: 'expecting',
      residenceBuildingId: HOUSE_ID,
    });
    state.entities = [mother, father];
    state.buildings = [house];
    state.villageLeaderId = null;
    state.nextEntityId = NEWBORN_ID;
    state.tick = liveBirthTick();

    const ctx: TickContext = {
      width: state.width,
      height: state.height,
      hourOfDay: 8,
      season: state.season,
      grassMult: 1,
      reproMult: 1,
      winterPenalty: 1,
      canHeat: true,
      byType: byType([mother, father]),
      aliveEntities: [mother, father],
      newEntities: [],
      updatedBuildings: state.buildings,
      roadBuildings: [],
      playerHumans: [mother, father],
      entityById: new Map([[MATERNAL_ID, mother], [FATHER_ID, father]]),
      buildingById: new Map([[house.id, house]]),
      predators: [],
    };
    return { state, ctx, mother, house };
  }

  it('leaves a daily-tick newborn inside its residence occupants for the assign layer', () => {
    const { state, ctx, mother, house } = birthFixture();

    tickPregnancyAndBirth(state, ctx, mother, {
      livingHumanAt: (id) => {
        const entity = id == null ? undefined : ctx.entityById.get(id);
        return entity?.alive && entity.type === EntityType.Human ? entity : undefined;
      },
    });

    const child = ctx.newEntities.find((entity) => entity.type === EntityType.Human);
    expect(child).toBeDefined();
    expect(child?.residenceBuildingId).toBe(HOUSE_ID);

    // The assign layer runs later the same tick on every daily boundary (72 % 18 === 0) and is
    // the residence-occupants owner; it must see the newborn it has to list.
    tickLayerAssign(state, ctx);

    expect(house.occupants).toContain(child?.id);
    expect(
      collectSimulationInvariantErrors({ ...state, entities: [...state.entities, ...ctx.newEntities] }),
    ).toEqual([]);
  });
});

describe('death cleanup vs the youth-love invariant', () => {
  it('clears the survivor half of a youth-love link when the sweetheart dies', () => {
    const sweetheart = human(1, {
      gender: 'female',
      age: 15,
      isJuvenile: true,
      youthLovePartnerId: 2,
      youthLoveProgress: 40,
      youthLoveStartedDay: 3,
    });
    const dying = human(2, {
      gender: 'male',
      age: 15,
      isJuvenile: true,
      youthLovePartnerId: 1,
      youthLoveProgress: 40,
      youthLoveStartedDay: 3,
    });
    const world = moonState([sweetheart, dying], [], 0);
    const entityById = new Map<number, Entity>([[1, sweetheart], [2, dying]]);

    killHuman(dying, [], entityById, world.tick);

    expect(sweetheart.youthLovePartnerId).toBeUndefined();
    expect(sweetheart.youthLoveProgress).toBeUndefined();
    expect(sweetheart.youthLoveStartedDay).toBeUndefined();
    // §5: a youth-love link joins two living settlers, so no one-sided link may survive.
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });
});

describe('reconcileOrphanedMarriages uses the Moon Howler partner owner rule', () => {
  it('keeps a marriage to a settler temporarily in Moon Howler form', () => {
    const wife = human(1, { gender: 'female', partnerId: 2, relationshipStatus: 'married' });
    const were = human(2, {
      gender: 'male',
      partnerId: 1,
      relationshipStatus: 'married',
      type: EntityType.Werewolf,
      moonHowlerCursed: true,
    });

    reconcileOrphanedMarriages([wife, were]);

    expect(wife.partnerId).toBe(2);
    expect(wife.relationshipStatus).toBe('married');
  });

  it('clears a marriage whose partner row is gone', () => {
    const wife = human(1, { gender: 'female', partnerId: 99, relationshipStatus: 'married' });

    reconcileOrphanedMarriages([wife]);

    expect(wife.partnerId).toBeUndefined();
    expect(wife.relationshipStatus).toBe('single');
  });
});
/**
 * Daily affair gossip produces a rumour, never an unwitnessed "caught in the act".
 *
 * `tryDailyAffairGossip` used to pick its exposure reason with
 * `pickAffairExposureReason`, which discarded its arguments and returned `'caught'` on a
 * flat 22% roll gated only by the existence of a staffed prison. `exposeAffair` treats
 * `'caught'` very differently from `'rumor'`: it logs "X was caught with Y", **arrests both
 * partners**, and calls `tryDivorceOnCaughtCheater(..., caughtInAct = true)`, which skips the
 * `isSpouseNearby` gate and forces `divorceChance = 1`. A merely gossiped-about pair could
 * therefore be jailed and forcibly divorced while the Chronicle claimed they were caught.
 *
 * The caught-in-the-act verdict is a *spatial* event and already lives in
 * `tryExposeCaughtAffair` — that path checks `isSpouseNearby(cheater) || isSpouseNearby(paramour)
 * || walkInAtHome` and returns early without a witness. The daily gossip path now passes
 * `'rumor'` unconditionally, which is what `SIMULATION_AUTHORITY.md` §4 requires of the
 * new-calendar-day owner.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/humanSchedule';
import { exposeAffair, tryDailyAffairGossip } from '../src/game/simulation/humanRelationships';

const CHEATER_ID = 1;
const PARAMOUR_ID = 2;
const SPOUSE_ID = 3;
const GUARD_ID = 4;
const PRISON_X = 2000;
const PRISON_Y = 2000;
const FIXTURE_SEED = 20240913;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age: 30,
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
    gender: id === PARAMOUR_ID ? 'male' : 'female',
    name: `H${id}`,
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

function makePrison(): Building {
  const cfg = BUILDING_CONFIGS[BuildingType.Prison];
  return {
    id: 900,
    type: BuildingType.Prison,
    x: PRISON_X,
    y: PRISON_Y,
    width: cfg.width,
    height: cfg.height,
    occupants: [GUARD_ID],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
  } as never;
}

/** A day whose established-pair gossip roll (salt 602) passes. */
function gossipDay(): number {
  for (let day = 1; day <= 5000; day++) {
    if (personDayRoll(CHEATER_ID, day * TICKS_PER_DAY, 602) < 0.12) return day;
  }
  throw new Error('no day produces a passing gossip roll');
}

/**
 * An established, mutual affair with a staffed prison standing and the spouses far away —
 * i.e. exactly the situation where the old flat roll could arrest and divorce the pair.
 */
function makeWorld(): {
  state: WorldState;
  cheater: Entity;
  paramour: Entity;
  entityById: Map<number, Entity>;
  buildings: Building[];
} {
  const state = initGame({ seed: FIXTURE_SEED });
  const cheater = human(CHEATER_ID, {
    relationshipStatus: 'married',
    partnerId: SPOUSE_ID,
    affairPartnerId: PARAMOUR_ID,
    affairProgress: 100,
  });
  const paramour = human(PARAMOUR_ID, {
    gender: 'male',
    affairPartnerId: CHEATER_ID,
    affairProgress: 100,
  });
  const spouse = human(SPOUSE_ID, { x: 3000, y: 3000, relationshipStatus: 'married', partnerId: CHEATER_ID });
  const guard = human(GUARD_ID, {
    job: JobType.PrisonGuard,
    homeBuildingId: 900,
    x: PRISON_X,
    y: PRISON_Y,
  });
  const prison = makePrison();
  state.entities = [cheater, paramour, spouse, guard];
  state.buildings = [prison];
  state.tick = gossipDay() * TICKS_PER_DAY + 30;
  return {
    state,
    cheater,
    paramour,
    entityById: new Map(state.entities.map((e) => [e.id, e])),
    buildings: state.buildings,
  };
}

describe('affair gossip is a rumour, not an unwitnessed arrest', () => {
  it('exposes the pair as a rumour and never jails or divorces them', () => {
    const { state, cheater, paramour, entityById, buildings } = makeWorld();
    const reputationBefore = state.villageReputation;

    tryDailyAffairGossip(
      state,
      cheater,
      entityById,
      buildings,
      new Map(buildings.map((b) => [b.id, b])),
      1, // full-strength church → the 0.22 gossip chance
      state.entities,
    );

    const scandals = state.eventLog.filter((event) => event.type === 'scandal');
    expect(scandals).toHaveLength(1);
    expect(scandals[0].message.startsWith('Whispers spread about')).toBe(true);
    expect(scandals[0].message).not.toContain('was caught with');

    // The 'caught' verdict is what arrests and forces the divorce; neither may happen here.
    expect(cheater.prisonBuildingId).toBeUndefined();
    expect(paramour.prisonBuildingId).toBeUndefined();
    expect(cheater.relationshipStatus).toBe('married');
    expect(cheater.partnerId).toBe(SPOUSE_ID);
    expect(state.villageReputation).toBeLessThan(reputationBefore);

    // The affair pair is cleared either way — the scandal ends the affair.
    expect(cheater.affairPartnerId).toBeUndefined();
    expect(paramour.affairPartnerId).toBeUndefined();
  });
});

/**
 * A jailing raises one toast that is gone four notifications later, so a player who is not watching
 * the corner misses a rare event entirely. The card (`bigNews`) is the notice that waits, and it
 * must appear for exactly the offenders who were actually jailed.
 */
describe('a jailing raises a card the player cannot miss', () => {
  function makeCaughtWorld(seed: number, withGuard: boolean): ReturnType<typeof makeWorld> {
    const world = makeWorld();
    world.state = initGame({ seed });
    // `initGame` builds a real world; this fixture keeps only the pair, the spouse and the prison.
    world.state.entities = withGuard
      ? [world.cheater, world.paramour, human(SPOUSE_ID, { x: 3000, y: 3000 }), human(GUARD_ID, { job: JobType.PrisonGuard, homeBuildingId: 900 })]
      : [world.cheater, world.paramour, human(SPOUSE_ID, { x: 3000, y: 3000 })];
    world.state.buildings = [makePrison()];
    world.state.tick = gossipDay() * TICKS_PER_DAY + 30;
    world.entityById = new Map(world.state.entities.map((e) => [e.id, e]));
    world.buildings = world.state.buildings;
    return world;
  }

  it('raises exactly one card per jailed offender, and jails someone', () => {
    let jailed = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { state, cheater, paramour, entityById, buildings } = makeCaughtWorld(seed, true);
      exposeAffair(state, cheater, paramour, 'caught', entityById, buildings, state.entities);

      const jailedNow = [cheater, paramour].filter((e) => e.prisonBuildingId === 900).length;
      const cards = state.bigNews.filter((news) => news.title === '⛓️ Jailed for scandal').length;
      expect(cards).toBe(jailedNow);
      jailed += jailedNow;
    }
    // Without this the assertion above holds vacuously on a seed set that never arrests.
    expect(jailed).toBeGreaterThan(0);
  });

  it('jails nobody and raises no card while the prison has no guard', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const { state, cheater, paramour, entityById, buildings } = makeCaughtWorld(seed, false);
      exposeAffair(state, cheater, paramour, 'caught', entityById, buildings, state.entities);
      expect(cheater.prisonBuildingId).toBeUndefined();
      expect(paramour.prisonBuildingId).toBeUndefined();
      expect(state.bigNews).toHaveLength(0);
    }
  });

  it('says why nothing happened when the prison has no guard, and only once', () => {
    const { state, cheater, paramour, entityById, buildings } = makeCaughtWorld(1, false);
    const notice = () =>
      state.eventLog.filter((event) => event.message.includes('the prison has no guard on duty'));

    exposeAffair(state, cheater, paramour, 'caught', entityById, buildings, state.entities);
    expect(notice()).toHaveLength(1);

    // A second scandal must not repeat it: the player has already been told.
    const second = makeCaughtWorld(2, false);
    second.state.eventLog = state.eventLog;
    exposeAffair(second.state, second.cheater, second.paramour, 'caught', second.entityById, second.buildings, second.state.entities);
    expect(notice()).toHaveLength(1);
  });
});
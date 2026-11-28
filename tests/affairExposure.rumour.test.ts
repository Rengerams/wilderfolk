import { scenarioSettler, scenarioBuilding, scenarioWorld } from './helpers/humanScenario';
import { isPlayerHuman } from '../src/game/playerHuman';
/**
 * Daily affair gossip produces a rumour; the caught-in-the-act verdict stays with
 * `tryExposeCaughtAffair`, the only path that checks for a witness.
 */
import { personDayRoll, resetSimRng } from '../src/game/simRng';
import { describe, expect, it, afterEach } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';

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
    energy: 0,
    maxEnergy: 0,
    needs: { nutrition: 80, rest: 85, stamina: 100 },
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
function makeWorld(seed = FIXTURE_SEED): {
  state: WorldState;
  cheater: Entity;
  paramour: Entity;
  entityById: Map<number, Entity>;
  buildings: Building[];
} {
  const state = initGame({ skipTerrain: true, seed });
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
    workerBuildingId: 900,
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
 * A jailing's toast is transient; the `bigNews` card is the notice that waits, and it must
 * appear for exactly the offenders who were actually jailed.
 */
describe('a jailing raises a card the player cannot miss', () => {
  function makeCaughtWorld(seed: number, withGuard: boolean): ReturnType<typeof makeWorld> {
    const world = makeWorld(seed);
    // `initGame` builds a real world; this fixture keeps only the pair, the spouse and the prison.
    world.state.entities = withGuard
      ? [world.cheater, world.paramour, human(SPOUSE_ID, { x: 3000, y: 3000 }), human(GUARD_ID, { job: JobType.PrisonGuard, workerBuildingId: 900 })]
      : [world.cheater, world.paramour, human(SPOUSE_ID, { x: 3000, y: 3000 })];
    world.state.buildings = [makePrison()];
    world.state.tick = gossipDay() * TICKS_PER_DAY + 30;
    world.entityById = new Map(world.state.entities.map((e) => [e.id, e]));
    world.buildings = world.state.buildings;
    return world;
  }

  it('raises exactly one card per jailed offender, and jails someone', () => {
    let jailed = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      const { state, cheater, paramour, entityById, buildings } = makeCaughtWorld(seed, true);
      exposeAffair(state, cheater, paramour, 'caught', entityById, buildings, state.entities);

      const jailedNow = [cheater, paramour].filter((e) => e.prisonBuildingId === 900).length;
      const cards = state.bigNews.filter((news) => news.title === '⛓️ Jailed for scandal').length;
      expect(cards).toBe(jailedNow);
      jailed += jailedNow;
    }
    // Without this the assertion above holds vacuously on a seed set that never arrests.
    expect(jailed).toBeGreaterThan(0);
    // Eight independent seeded worlds are enough to cover a successful arrest without 80 world generations.
  }, 45_000);

  it('jails nobody and raises no card while the prison has no guard', () => {
    for (let seed = 1; seed <= 4; seed += 1) {
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

describe('Witnessed affair exposure regression', () => {
  afterEach(resetSimRng);

  describe('L62 — caught-in-the-act divorce is the only caught path', () => {
    /** A colony day whose caught-divorce roll sits above the 0.7 soft chance. */
    function tickAboveSoftChance(cheaterId: number): number {
      for (let day = 1; day < 5000; day++) {
        const tick = day * TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
        if (personDayRoll(cheaterId, tick, 608) >= 0.7) return tick;
      }
      throw new Error('no tick above the soft divorce chance');
    }

    it('divorces deterministically on "caught" and never on gossip "rumor"', () => {
      const state = scenarioWorld();
      const house = scenarioBuilding(2, BuildingType.House);
      const prison = scenarioBuilding(9, BuildingType.Prison, { x: 300, y: 300 });
      const cheater = scenarioSettler(10, {
        gender: 'female',
        relationshipStatus: 'married',
        partnerId: 11,
        prisonBuildingId: prison.id,
        prisonSentenceCrime: 'scandal',
        prisonerUntilTick: state.tick + 500,
      });
      const spouse = scenarioSettler(11, { gender: 'male', relationshipStatus: 'married', partnerId: 10, residenceBuildingId: house.id });
      const paramour = scenarioSettler(12, { gender: 'male', relationshipStatus: 'single' });
      paramour.affairPartnerId = cheater.id;
      cheater.affairPartnerId = paramour.id;
      prison.occupants = [cheater.id];
      state.buildings = [house, prison];
      state.entities = [cheater, spouse, paramour];
      state.tick = tickAboveSoftChance(cheater.id);

      const entityById = new Map(state.entities.map((e) => [e.id, e]));
      const playerHumans = state.entities.filter(isPlayerHuman);

      // Gossip exposure never reaches the divorce rule.
      exposeAffair(state, cheater, paramour, 'rumor', entityById, state.buildings, playerHumans);
      expect(spouse.partnerId).toBe(10);
      expect(cheater.partnerId).toBe(11);

      // A witnessed caught-in-the-act divorce ignores the 0.7 soft chance entirely:
      // only `tryExposeCaughtAffair` can pass 'caught', and it requires a witness first.
      expect(personDayRoll(cheater.id, state.tick, 608)).toBeGreaterThanOrEqual(0.7);
      cheater.affairPartnerId = paramour.id;
      paramour.affairPartnerId = cheater.id;
      cheater.scandalCooldownUntilTick = undefined;
      paramour.scandalCooldownUntilTick = undefined;
      exposeAffair(state, cheater, paramour, 'caught', entityById, state.buildings, playerHumans);
      expect(spouse.partnerId).toBeUndefined();
      expect(cheater.partnerId).toBeUndefined();
    });
  });
});

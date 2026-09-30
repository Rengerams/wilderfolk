/**
 * F5 — Settlement Memory and Legacy Goals (`Roadmap_V0_6.4.1.MD`).
 *
 * Every goal is a projection of a record the simulation already writes, so these tests drive the
 * real producers — the calendar rollover inside `gameTick`, the election-promise judgement, and the
 * church exorcism rite — instead of setting a goal flag, and each goal gets one
 * adjacent-but-wrong negative control.
 */
import { describe, expect, it } from 'vitest';
import { gameTick } from '../src/game/gameTick';
import { initGame } from '../src/game/worldGen';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';
import { DAYS_PER_SEASON } from '../src/game/gameConstants';
import {
  EVAL_DAY_OFFSET,
  GRANARY_FOOD_REQUIREMENT,
  recordElectionPromises,
  tickElectionPromises,
} from '../src/game/electionPromises';
import { tickMoonHowlerCycle } from '../src/game/moonHowler';
import { LEGACY_SHORTAGE_RECOVERY_FOOD, collectLegacyGoals } from '../src/game/legacyGoals';
import type { LegacyGoalId, LegacyGoalStatus } from '../src/game/legacyGoals';
import { BuildingType, EntityType, JobType, Season } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { getSeason } from '../src/game/simHelpers';
import { building } from '../src/test/factories';

function goal(state: WorldState, id: LegacyGoalId): LegacyGoalStatus {
  const found = collectLegacyGoals(state).find((entry) => entry.id === id);
  if (!found) throw new Error(`legacy goal '${id}' is missing from the owner's table`);
  return found;
}

/** The tick before day 0 of year 1, run through the real `gameTick` rollover. */
function closeFirstYear(state: WorldState): void {
  state.tick = TICKS_PER_DAY * DAYS_PER_YEAR - 1;
  state.dayInYear = DAYS_PER_YEAR - 1;
  gameTick(state);
}

/** Satisfy every promise option, so whichever two the owner records are kept. */
function satisfyEveryPromiseTarget(state: WorldState): void {
  state.resources.food = GRANARY_FOOD_REQUIREMENT;
  for (let i = 0; i < 5; i++) {
    state.buildings.push(building(7000 + i, BuildingType.Wall));
  }
  state.villageForge = {
    activeOrder: null,
    progress: 0,
    completed: { iron_spears: true, iron_shields: true, iron_pickaxes: true },
  };
}

/** The promise owner's real path: recorded on election day, judged at the evaluation day. */
function recordAndJudgePromises(state: WorldState, year: number): void {
  state.year = year;
  state.dayInYear = 0;
  recordElectionPromises(state, year);
  state.dayInYear = EVAL_DAY_OFFSET;
  tickElectionPromises(state);
}

/** A world holding only a staffed Church, a priest, and a cursed Moon Howler in rite range. */
function exorcismWorld(): { state: WorldState; entities: Entity[]; buildings: Building[] } {
  const state = initGame();
  const settler = state.entities.find((e) => e.type === EntityType.Human && e.alive);
  if (!settler) throw new Error('the starting world has no living settler');

  const priest: Entity = {
    ...settler,
    id: 9000,
    name: 'Ingrid',
    surname: 'Priestess',
    job: JobType.Priest,
    occupation: 'priest',
    alive: true,
    x: 100,
    y: 100,
    homeBuildingId: 8000,
  };
  const howler: Entity = {
    ...settler,
    id: 9001,
    name: 'Bjorn',
    surname: 'Cursed',
    type: EntityType.Werewolf,
    moonHowlerCursed: true,
    alive: true,
    x: 150,
    y: 100,
  };
  const church: Building = {
    ...building(8000, BuildingType.Church),
    occupants: [9000],
    x: 90,
    y: 90,
    width: 50,
    height: 56,
  };
  // The cycle reads the world as well as the arrays, so keep all three in agreement.
  const entities = [priest, howler];
  state.entities = entities;
  state.buildings = [church];
  return { state, entities, buildings: [church] };
}

/** The production path for a cure: a full-moon night through `tickMoonHowlerCycle`. */
function runCureNight(roll: number): WorldState {
  const world = exorcismWorld();
  tickMoonHowlerCycle(
    world.state,
    world.entities,
    world.buildings,
    0, // full-moon colony day
    22, // NIGHT_START
    new Map(world.entities.map((e) => [e.id, e])),
    undefined,
    () => roll,
  );
  return world.state;
}

describe('legacy goals: the owner table', () => {
  it('lists one row per goal and reads the world without writing to it', () => {
    const state = initGame();
    expect(collectLegacyGoals(state).map((entry) => entry.id)).toEqual([
      'winter_survived',
      'promise_kept',
      'howler_cured',
      'shortage_recovered',
    ]);

    const before = {
      tick: state.tick,
      year: state.year,
      food: state.resources.food,
      logLength: state.eventLog.length,
      yearlyStatsLength: state.yearlyStats.length,
      storyFlags: JSON.stringify(state.storyFlags ?? {}),
    };
    collectLegacyGoals(state);
    expect({
      tick: state.tick,
      year: state.year,
      food: state.resources.food,
      logLength: state.eventLog.length,
      yearlyStatsLength: state.yearlyStats.length,
      storyFlags: JSON.stringify(state.storyFlags ?? {}),
    }).toEqual(before);
  });

  it('starts a settled valley with nothing achieved', () => {
    const state = initGame();
    expect(collectLegacyGoals(state).every((entry) => !entry.achieved)).toBe(true);
  });
});

describe('legacy goal: surviving winter', () => {
  it('flips when the calendar closes its first full year', () => {
    const state = initGame();
    expect(state.year).toBe(0);
    expect(goal(state, 'winter_survived').achieved).toBe(false);

    closeFirstYear(state);

    expect(state.year).toBe(1);
    const status = goal(state, 'winter_survived');
    expect(status.achieved).toBe(true);
    expect(status.evidence).toContain('1 calendar year');
  });

  it('is not achieved by standing in the middle of the first winter', () => {
    const state = initGame();
    state.dayInYear = DAYS_PER_SEASON * 3 + 30; // day 300 — deep in winter, year still 0
    state.tick = TICKS_PER_DAY * state.dayInYear;

    expect(getSeason(state.dayInYear)).toBe(Season.Winter);
    expect(state.year).toBe(0);
    expect(goal(state, 'winter_survived').achieved).toBe(false);
  });
});

describe('legacy goal: a promise kept', () => {
  it('flips on the promise owner’s kept verdict', () => {
    const state = initGame();
    expect(goal(state, 'promise_kept').achieved).toBe(false);

    satisfyEveryPromiseTarget(state);
    recordAndJudgePromises(state, 4);

    expect(state.eventLog.some((e) => e.message.includes('2/2 kept'))).toBe(true);
    const status = goal(state, 'promise_kept');
    expect(status.achieved).toBe(true);
    expect(status.evidence).toContain('2 of 2');
  });

  it('is not achieved by a recorded promise, nor by a 0/2 verdict', () => {
    const recorded = initGame();
    recordElectionPromises(recorded, 4); // campaign promises recorded, not yet judged
    expect(recorded.eventLog.some((e) => e.message.includes('Campaign promises recorded'))).toBe(true);
    expect(goal(recorded, 'promise_kept').achieved).toBe(false);

    const failed = initGame();
    failed.resources.food = 0; // no target met — the verdict is 0/2 kept
    recordAndJudgePromises(failed, 4);
    expect(failed.eventLog.some((e) => e.message.includes('0/2 kept'))).toBe(true);
    expect(goal(failed, 'promise_kept').achieved).toBe(false);
  });

  it('keeps the achievement when a later term is judged 0/2', () => {
    const state = initGame();
    satisfyEveryPromiseTarget(state);
    recordAndJudgePromises(state, 4);
    expect(goal(state, 'promise_kept').achieved).toBe(true);

    state.resources.food = 0; // the next term breaks every promise target
    state.buildings = state.buildings.filter((b) => b.type !== BuildingType.Wall);
    state.villageForge = { activeOrder: null, progress: 0, completed: {} };
    recordAndJudgePromises(state, 6);

    expect(state.eventLog.some((e) => e.message.includes('0/2 kept'))).toBe(true);
    expect(goal(state, 'promise_kept').achieved).toBe(true);
  });
});

describe('legacy goal: curing a Moon Howler', () => {
  it('flips when the church rite breaks the curse', () => {
    const state = runCureNight(0.1); // below the 0.35 cure weight

    expect(state.entities.some((e) => e.moonHowlerCursed === true)).toBe(false);
    expect(state.eventLog.some((e) => e.message.includes('was cured of the Moon Howler curse'))).toBe(true);

    const status = goal(state, 'howler_cured');
    expect(status.achieved).toBe(true);
    expect(status.evidence).toContain('cured of the Moon Howler curse');
  });

  it('is not achieved by a rite that failed and left the curse standing', () => {
    const state = runCureNight(0.9); // above cure + kill weight → the priest flees

    expect(state.entities.some((e) => e.moonHowlerCursed === true)).toBe(true);
    expect(state.eventLog.some((e) => e.message.includes('remains cursed'))).toBe(true);
    expect(goal(state, 'howler_cured').achieved).toBe(false);
  });
});

describe('legacy goal: recovering from shortage', () => {
  it('flips once a lean year has closed and the larder is restocked', () => {
    const state = initGame();
    state.resources.food = 0;

    closeFirstYear(state);
    const leanYear = state.yearlyStats[state.yearlyStats.length - 1];
    expect(leanYear?.year).toBe(0);
    expect(leanYear?.resources.food).toBe(0);

    state.resources.food = 0; // the shortage has not been recovered from yet
    expect(goal(state, 'shortage_recovered').achieved).toBe(false);

    state.resources.food = LEGACY_SHORTAGE_RECOVERY_FOOD;
    const status = goal(state, 'shortage_recovered');
    expect(status.achieved).toBe(true);
    // The lean year is stored as year 0 (above) and reads as Year 1 on screen.
    expect(status.evidence).toContain('Year 1');
  });

  it('is not achieved while the larder is empty but no year closed lean', () => {
    const state = initGame();
    state.resources.food = 0;

    expect(state.yearlyStats).toHaveLength(0);
    expect(goal(state, 'shortage_recovered').achieved).toBe(false);
  });

  it('is not achieved by a year that closed lean but never empty', () => {
    const state = initGame();
    state.resources.food = 10; // low, but the larder never ran out

    closeFirstYear(state);
    const leanYear = state.yearlyStats[state.yearlyStats.length - 1];
    expect(leanYear?.resources.food).toBe(10);

    state.resources.food = LEGACY_SHORTAGE_RECOVERY_FOOD;
    expect(goal(state, 'shortage_recovered').achieved).toBe(false);
  });
});

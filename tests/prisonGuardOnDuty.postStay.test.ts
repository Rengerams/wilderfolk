/**
 * A settler on a shift keeps the post his work commute gave him.
 *
 * Regression, from the owner's live Y3 D3 colony: "ok there 8 guards but still all prisoners escape".
 * A Prison is not an `ordinaryWorkplace`, so `socialBlockedByJob` is false there and `socialTime` is
 * true on a prison guard's own shift. The free-time "Married couples proximity" walk then overwrote
 * the velocity the work commute had just set, and sent the on-duty guard off to his wife: he walked
 * away from the prison, `tickPrisonPresence` found nobody on the post, and every such hour carried an
 * escape roll. 16 of the 28 prison guards in the owner's save are married and every one of them was
 * more than 15 px from their partner — so this fired for the whole watch, on every shift.
 *
 * This is an integration witness on purpose: the defect is the *order* of two velocity writers inside
 * one `gameTick`, so a unit test of either writer alone cannot see it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { gameTick } from '../src/game/gameTick';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { getHourOfDay } from '../src/game/dayCycleClock';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { invalidateEntityByIdMap, rebuildEntityByIdMap } from '../src/game/entityIndex';
import { resetSimRng } from '../src/game/simRng';

/** The Prison sits far enough east that its row is clearly separated from the wife's position. */
const PRISON_ID = 10;
const PRISON_X = 1600;
const PRISON_Y = 400;
const GUARD_ID = 514;
const WIFE_ID = 900;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    reproductionCooldown: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    ...overrides,
  };
}

function building(id: number, type: BuildingType, x: number, y: number, occupants: number[]): Building {
  return {
    id,
    type,
    x,
    y,
    width: 48,
    height: 42,
    occupants,
    completed: true,
    level: 1,
  } as unknown as Building;
}

/** A real, fully-initialised world — the defenceless fixture omitted fields `gameTick` requires. */
function worldState(entities: Entity[], buildings: Building[], tick: number): WorldState {
  const state = initGame({ seed: 4242 });
  state.entities = entities;
  state.buildings = buildings;
  state.tick = tick;
  state.paused = false;
  // `initGame` indexed its own settlers; replacing `entities` outright leaves that map stale, and a
  // stale map reads as "no living guard" to `prisonGuardIds` (the roster then comes back empty and
  // there is no shift to defend). `rebuildEntityByIdMap` is the documented test hook for this.
  invalidateEntityByIdMap(state);
  rebuildEntityByIdMap(state);
  return state;
}

afterEach(() => {
  resetSimRng();
});

describe('an on-duty prison guard is not walked off his post by his marriage', () => {
  it('walks toward his post, not toward his absent wife', () => {
    // 09:00 — two hours into the morning shift (07:00-16:00), so the guard is on duty *now* and still
    // walking in. That is the window the defect lives in: the work commute sets his velocity every
    // tick and the free-time marriage walk overwrote it in the same tick.
    const tick = 9 * (TICKS_PER_DAY / 24);
    // The post stands east of him and the wife stands west, so the two walks point opposite ways.
    const guard = human(GUARD_ID, {
      job: JobType.PrisonGuard,
      homeBuildingId: PRISON_ID,
      residenceBuildingId: PRISON_ID,
      x: PRISON_X - 90,
      y: PRISON_Y + 20,
      gender: 'female',
      // Every condition of the marriage-proximity walk, which is what makes this a real repro:
      // married, not pregnant, off reproduction cooldown, and more than 15 px from the partner.
      // `gender: 'female'` is load-bearing: the walk only ever moves a female settler, which is
      // exactly the owner's colony — 16 of its 28 prison guards are married and nearly all are women.
      relationshipStatus: 'married',
      partnerId: WIFE_ID,
      reproductionCooldown: 0,
    });
    const wife = human(WIFE_ID, {
      x: PRISON_X - 400,
      y: PRISON_Y + 20,
      gender: 'male',
      relationshipStatus: 'married',
      partnerId: GUARD_ID,
    });
    const house = building(20, BuildingType.House, PRISON_X - 420, PRISON_Y, [WIFE_ID]);
    const prison = building(PRISON_ID, BuildingType.Prison, PRISON_X, PRISON_Y, [GUARD_ID]);
    const state = worldState([guard, wife], [house, prison], tick);

    expect(getHourOfDay(tick), 'the guard should be inside his morning shift').toBe(9);

    const post = humanBuildingTarget(prison, GUARD_ID, false);
    const before = Math.hypot(post.x - guard.x, post.y - guard.y);
    const wifeBefore = Math.hypot(wife.x - guard.x, wife.y - guard.y);

    gameTick(state);

    const after = Math.hypot(post.x - guard.x, post.y - guard.y);
    const wifeAfter = Math.hypot(wife.x - guard.x, wife.y - guard.y);
    // The witness is the walk's *direction*: while he is on duty his distance to the post must close,
    // and it must not close to his wife instead. Before the fix he drifted away from the post and
    // toward her on the same tick (measured 66.91 -> 66.87 px to the post, 310.00 -> 309.68 to her).
    expect(
      after,
      `the on-duty guard did not close on his post (${before.toFixed(2)} px -> ${after.toFixed(2)} px); `
        + 'a free-time social walk is overwriting his work commute',
    ).toBeLessThan(before);
    expect(
      wifeAfter,
      `the on-duty guard closed on his WIFE instead of his post (${wifeBefore.toFixed(2)} px -> ${wifeAfter.toFixed(2)} px)`,
    ).toBeGreaterThanOrEqual(wifeBefore);
  });
});

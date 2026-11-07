/**
 * A settler on a shift keeps the post his work commute gave him: the free-time marriage walk must not
 * overwrite the on-duty guard's velocity, so a prison guard stays within reach of the prison.
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
import { prisonGuardIds } from '../src/game/prisonGuardDuty';
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
  // This test isolates the guard's competing velocity writers, not terrain relocation.
  state.worldMap = null;
  // Replacing `entities` leaves `initGame`'s entity map stale, and `prisonGuardIds` would read an
  // empty roster; `rebuildEntityByIdMap` is the documented test hook.
  invalidateEntityByIdMap(state);
  rebuildEntityByIdMap(state);
  return state;
}

afterEach(() => {
  resetSimRng();
});

describe('an on-duty prison guard is not walked off his post by his marriage', () => {
  it('walks toward his post, not toward his absent wife', () => {
    // 09:00 — two hours into the 07:00-16:00 shift, so the guard is on duty now and still walking in,
    // which is where the work commute and the free-time walk compete for his velocity.
    const tick = 9 * (TICKS_PER_DAY / 24);
    // The post stands east of him and the wife stands west, so the two walks point opposite ways.
    const guard = human(GUARD_ID, {
      job: JobType.PrisonGuard,
      workerBuildingId: PRISON_ID,
      residenceBuildingId: PRISON_ID,
      x: PRISON_X - 90,
      y: PRISON_Y + 20,
      gender: 'female',
      // Every condition of the marriage-proximity walk: married, not pregnant, off reproduction
      // cooldown, over 15 px from the partner, and female — the only gender the walk moves.
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
    // The witness is direction: on duty, his distance to the post must close and must not close to
    // his wife instead.
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

  it('starts a weekend commute before the shift, even while off-screen', () => {
    // Saturday, 05:00: this guard's morning shift starts at 07:00. The colony workweek is over, but
    // the prison rota is not. Keep the camera far away and choose a tick outside the throttle pulse.
    const tick = 5 * TICKS_PER_DAY + 5 * (TICKS_PER_DAY / 24);
    const guard = human(GUARD_ID, {
      job: JobType.PrisonGuard,
      workerBuildingId: PRISON_ID,
      residenceBuildingId: 21,
      x: 80,
      y: PRISON_Y + 20,
    });
    const house = building(21, BuildingType.House, 60, PRISON_Y, []);
    const prison = building(PRISON_ID, BuildingType.Prison, PRISON_X, PRISON_Y, [GUARD_ID]);
    const state = worldState([guard], [house, prison], tick);
    const post = humanBuildingTarget(prison, GUARD_ID, false);
    const before = Math.hypot(post.x - guard.x, post.y - guard.y);

    gameTick(state, { minX: 5_000, maxX: 6_000, minY: 5_000, maxY: 6_000 });

    const after = Math.hypot(post.x - guard.x, post.y - guard.y);
    expect(after, 'the weekend guard should start walking before his 07:00 shift').toBeLessThan(before);
  });

});

describe('legacy prison crews are reduced to the closest stable watch crew', () => {
  it('keeps the closest three guards when a save exceeds the current four-post cap', () => {
    const prison = building(PRISON_ID, BuildingType.Prison, PRISON_X, PRISON_Y, [1, 2, 3, 4, 5]);
    const guards = [
      human(1, { job: JobType.PrisonGuard, workerBuildingId: PRISON_ID, x: 800, y: 800 }),
      human(2, { job: JobType.PrisonGuard, workerBuildingId: PRISON_ID, x: PRISON_X + 26, y: PRISON_Y + 25 }),
      human(3, { job: JobType.PrisonGuard, workerBuildingId: PRISON_ID, x: PRISON_X + 36, y: PRISON_Y + 25 }),
      human(4, { job: JobType.PrisonGuard, workerBuildingId: PRISON_ID, x: PRISON_X + 46, y: PRISON_Y + 25 }),
      human(5, { job: JobType.PrisonGuard, workerBuildingId: PRISON_ID, x: PRISON_X + 56, y: PRISON_Y + 25 }),
    ];
    const state = worldState(guards, [prison], 0);

    expect(prisonGuardIds(state, prison.occupants)).toEqual([2, 3, 4]);
  });
});

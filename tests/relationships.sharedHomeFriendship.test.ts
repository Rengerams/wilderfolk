/**
 * F2 of the 2026-09-16 lifecycle/social audit (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`):
 * the daily friendship pass grouped the "shared home" bump by `homeBuildingId`, which is the
 * **workplace** in this codebase — so cohabitants never grew closer while coworkers in one building
 * were counted twice (workplace and job type).
 *
 * The fix keeps the workplace and job-type sources and adds the missing residence source, so the
 * documented rule ("friendships grow from shared work, home and childhood") is implemented without
 * removing the friendship growth that already existed.
 *
 * Fixtures come from `src/test/factories.ts`, the one entity factory the suite shares: the local
 * `settler()` this file used to carry ended in `as Entity`, which is how a missing required field
 * reaches the engine as `undefined` without the compiler noticing.
 */
import { describe, expect, it } from 'vitest';
import { JobType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import {
  FRIEND_CLOSE_THRESHOLD,
  MAX_CLOSE_FRIENDS_PER_SETTLER,
  advanceSocialRelationships,
  friendCount,
  friendshipScore,
} from '../src/game/relationships';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';
import { human } from '../src/test/factories';

function state(): WorldState {
  return {
    entities: [],
    buildings: [],
    tick: TICKS_PER_DAY,
    year: 1,
    dayInYear: 1,
    eventLog: [],
    notifications: [],
    bigNews: [],
    storyFlags: {},
    pendingStoryEvents: [],
    resources: {},
    floatingTexts: [],
    nextFloatingTextId: 1,
    villageReputation: 0,
  } as unknown as WorldState;
}

describe('daily friendship sources (F2)', () => {
  it('grows friendship between settlers who share a house', () => {
    const a = human(1, { residenceBuildingId: 10, homeBuildingId: 20, job: JobType.Farmer });
    const b = human(2, { residenceBuildingId: 10, homeBuildingId: 30, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBeGreaterThan(0);
    expect(friendshipScore(b, a.id)).toBe(friendshipScore(a, b.id));
  });

  it('still grows friendship between coworkers who share a workplace building', () => {
    const a = human(1, { residenceBuildingId: 10, homeBuildingId: 20, job: JobType.Farmer });
    const b = human(2, { residenceBuildingId: 30, homeBuildingId: 20, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBeGreaterThan(0);
  });

  it('leaves settlers who share neither home nor work as strangers', () => {
    const a = human(1, { residenceBuildingId: 10, homeBuildingId: 20, job: JobType.Farmer });
    const b = human(2, { residenceBuildingId: 30, homeBuildingId: 40, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBe(0);
  });

  it('does not treat the jobless as sharing a trade', () => {
    // `Settler` is the absence of a job. With nothing else in common they are strangers; keying the
    // job group on that value made every unemployed settler in the colony a "coworker".
    const a = human(1, { residenceBuildingId: 10, homeBuildingId: 20, job: JobType.Settler });
    const b = human(2, { residenceBuildingId: 30, homeBuildingId: 40, job: JobType.Settler });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBe(0);
  });

  it('reaches members past the pair budget instead of bonding the same head every day', () => {
    // 41 cohabitants is one more than PAIR_BUDGET (40), so a head-sliced window always left the
    // same settler out and they could never gain a bond from the group. Update this count if the
    // budget moves.
    const people = Array.from({ length: 41 }, (_, i) =>
      human(i + 1, { residenceBuildingId: 10, job: JobType.Settler }),
    );
    const world = state();
    world.entities = people;
    const tail = people[people.length - 1];

    for (let day = 1; day <= people.length; day++) {
      world.tick = TICKS_PER_DAY * day;
      advanceSocialRelationships(world, people);
    }

    expect(Object.keys(tail.friendships ?? {}).length).toBeGreaterThan(0);
  });
});

/**
 * The ceiling on close bonds. Feuds always had one (`MAX_LIVE_FEUDS_PER_SETTLER`) and
 * friendships never did, so every pair that ever shared a home or a job reached the close
 * threshold: a measured 90-settler colony ended with one settler holding 54 close friends, and
 * the owner's 641-settler village read as "everyone became friends".
 */
describe('close friendships are capped per settler', () => {
  it('stops a settler at MAX_CLOSE_FRIENDS_PER_SETTLER even when the whole house is in reach', () => {
    // Twelve settlers share one residence, so the pulse bumps all 66 pairs; without a ceiling
    // every settler would end up close to the other 11.
    const people = Array.from({ length: 12 }, (_, i) =>
      human(i + 1, { residenceBuildingId: 10 }),
    );
    const world = state();
    world.entities = people;

    // The bump is 0.6/day, so FRIEND_CLOSE_THRESHOLD (60) is reached on day 100.
    for (let day = 0; day < DAYS_PER_YEAR; day++) advanceSocialRelationships(world, people);

    for (const p of people) {
      expect(friendCount(p), `settler ${p.id} close friends`).toBeLessThanOrEqual(
        MAX_CLOSE_FRIENDS_PER_SETTLER,
      );
    }
    // Non-vacuity: the ceiling must not be satisfied by refusing every bond.
    const close = people.reduce((sum, p) => sum + friendCount(p), 0);
    expect(close, 'some close bonds formed').toBeGreaterThan(0);
  });

  it('does not prune bonds a loaded save already holds above the ceiling', () => {
    // An 11-settler house whose first settler carries ten standing close bonds — the shape a
    // save written before the ceiling has. The pass must leave them and simply stop adding.
    // Scored relative to the threshold, so retuning it does not silently make these un-close.
    const closeScore = FRIEND_CLOSE_THRESHOLD + 10;
    const friends = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`friend_${i + 2}`, closeScore]),
    );
    const loaded = human(1, { residenceBuildingId: 10, friendships: friends });
    const others = Array.from({ length: 10 }, (_, i) =>
      human(i + 2, { residenceBuildingId: 10, friendships: { friend_1: closeScore } }),
    );
    const newcomer = human(99, { residenceBuildingId: 10 });
    const world = state();
    const everyone = [loaded, ...others, newcomer];
    world.entities = everyone;

    advanceSocialRelationships(world, everyone);

    expect(friendCount(loaded), 'the ten standing bonds survive').toBe(10);
    // Warming an un-close bond is still allowed; only a *new close* bond is refused.
    expect(friendshipScore(newcomer, loaded.id)).toBeGreaterThan(0);
    expect(friendCount(newcomer), 'the newcomer takes on no close bond').toBe(0);
  });
});

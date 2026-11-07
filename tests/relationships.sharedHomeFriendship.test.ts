/**
 * Friendships grow from shared work, home and childhood: the daily pass must bump cohabitants
 * by residence as well as by workplace and job type.
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
    const a = human(1, { residenceBuildingId: 10, workerBuildingId: 20, job: JobType.Farmer });
    const b = human(2, { residenceBuildingId: 10, workerBuildingId: 30, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBeGreaterThan(0);
    expect(friendshipScore(b, a.id)).toBe(friendshipScore(a, b.id));
  });

  it('still grows friendship between coworkers who share a workplace building', () => {
    const a = human(1, { residenceBuildingId: 10, workerBuildingId: 20, job: JobType.Farmer });
    const b = human(2, { residenceBuildingId: 30, workerBuildingId: 20, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBeGreaterThan(0);
  });

  it('leaves settlers who share neither home nor work as strangers', () => {
    const a = human(1, { residenceBuildingId: 10, workerBuildingId: 20, job: JobType.Farmer });
    const b = human(2, { residenceBuildingId: 30, workerBuildingId: 40, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBe(0);
  });

  it('does not treat the jobless as sharing a trade', () => {
    // `Settler` is the absence of a job. With nothing else in common they are strangers; keying the
    // job group on that value made every unemployed settler in the colony a "coworker".
    const a = human(1, { residenceBuildingId: 10, workerBuildingId: 20, job: JobType.Settler });
    const b = human(2, { residenceBuildingId: 30, workerBuildingId: 40, job: JobType.Settler });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBe(0);
  });

  it('reaches members past the pair budget instead of bonding the same head every day', () => {
    // 41 cohabitants is one more than PAIR_BUDGET, so a head-sliced window would leave the same
    // settler out; update this count if the budget moves.
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
 * Close friendships are capped per settler at `MAX_CLOSE_FRIENDS_PER_SETTLER`, as live feuds
 * are, so a colony cannot make everyone a close friend.
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

  it('reconciles loaded saves above the close-friend ceiling', () => {
    // A loaded save above the ceiling: one settler holds ten close bonds and the pass must keep
    // the six strongest. Scores are relative to the threshold so retuning it keeps them close.
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

    expect(friendCount(loaded), 'loaded bonds obey the six-friend ceiling').toBe(MAX_CLOSE_FRIENDS_PER_SETTLER);
    // Warming an un-close bond is still allowed; only a *new close* bond is refused.
    expect(friendshipScore(newcomer, loaded.id)).toBeGreaterThan(0);
    expect(friendCount(newcomer), 'the newcomer takes on no close bond').toBe(0);
  });
});

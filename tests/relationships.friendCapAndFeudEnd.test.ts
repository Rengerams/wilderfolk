/**
 * Owner rulings: a settler holds at most six friends, and a feud that starts must end visibly.
 */
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import {
  FRIEND_CLOSE_THRESHOLD,
  MAX_CLOSE_FRIENDS_PER_SETTLER,
  advanceSocialRelationships,
  feudScore,
  friendCount,
  reconcileCloseFriendships,
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

function messages(world: WorldState, needle: string): number {
  return world.eventLog.filter((event) => event.message.includes(needle)).length;
}

function closePairAgreement(people: ReturnType<typeof human>[]): string[] {
  const broken: string[] = [];
  for (const a of people) {
    for (const b of people) {
      if (a.id === b.id) continue;
      const ab = friendshipScore(a, b.id);
      const ba = friendshipScore(b, a.id);
      if (ab !== ba) broken.push(`${a.id}->${b.id}=${ab} vs ${b.id}->${a.id}=${ba}`);
    }
  }
  return broken;
}

describe('six friends per settler', () => {
  it('holds the ceiling and keeps both sides of every close bond in agreement', () => {
    const people = Array.from({ length: 20 }, (_, i) => human(i + 1, { residenceBuildingId: 10 }));
    const world = state();
    world.entities = people;

    for (let day = 0; day < DAYS_PER_YEAR; day++) advanceSocialRelationships(world, people);

    for (const p of people) {
      expect(friendCount(p), `settler ${p.id} close friends`).toBeLessThanOrEqual(
        MAX_CLOSE_FRIENDS_PER_SETTLER,
      );
    }
    expect(closePairAgreement(people)).toEqual([]);

    const close = people.reduce((sum, p) => sum + friendCount(p), 0);
    expect(close, 'close bonds did form').toBeGreaterThan(0);
    const scores = people.flatMap((p) => Object.values(p.friendships ?? {}));
    expect(Math.max(...scores)).toBeGreaterThan(FRIEND_CLOSE_THRESHOLD);
  });
});

describe('legacy friendship reconciliation', () => {
  it('keeps the strongest six mutual friends and demotes surplus bonds symmetrically', () => {
    const people = Array.from({ length: 9 }, (_, i) => human(i + 1));
    const central = people[0];
    people.slice(1).forEach((other, i) => {
      const strength = 70 + i;
      central.friendships = { ...central.friendships, [`friend_${other.id}`]: strength };
      other.friendships = { ...other.friendships, [`friend_${central.id}`]: strength };
    });
    reconcileCloseFriendships(people);
    expect(friendCount(central)).toBe(6);
    expect(friendshipScore(central, 2)).toBe(59);
    expect(friendshipScore(people[1], 1)).toBe(59);
    expect(friendshipScore(central, 9)).toBe(77);
    expect(closePairAgreement(people)).toEqual([]);
    reconcileCloseFriendships(people);
    expect(friendCount(central)).toBe(6);
  });

  it('repairs an imported over-cap state on the next social update', () => {
    const people = Array.from({ length: 9 }, (_, i) => human(i + 1));
    const central = people[0];
    for (const other of people.slice(1)) {
      central.friendships = { ...central.friendships, [`friend_${other.id}`]: 80 };
      other.friendships = { ...other.friendships, [`friend_${central.id}`]: 80 };
    }
    const world = state();
    world.entities = people;
    advanceSocialRelationships(world, people, undefined, () => 0.99);
    expect(friendCount(central)).toBeLessThanOrEqual(MAX_CLOSE_FRIENDS_PER_SETTLER);
    expect(closePairAgreement(people)).toEqual([]);
  });
});

describe('a feud that starts is announced as settled', () => {
  it('opens a mutual feud from the daily pulse, then logs its end', () => {
    const a = human(1, { name: 'Asha', residenceBuildingId: 10, traits: ['fierce'] });
    const b = human(2, { name: 'Bo', residenceBuildingId: 10, traits: ['stoic'] });
    const world = state();

    advanceSocialRelationships(world, [a, b], undefined, () => 0);
    expect(feudScore(a, b.id)).toBeGreaterThan(0);
    expect(feudScore(a, b.id)).toBe(feudScore(b, a.id));
    expect(messages(world, 'feud is brewing'), 'the start is announced').toBe(1);

    for (let day = 0; day < 200; day++) advanceSocialRelationships(world, [a, b], undefined, () => 0.99);

    expect(a.feuds?.['feud_2'], 'the feud reached zero and was pruned').toBeUndefined();
    expect(b.feuds?.['feud_1']).toBeUndefined();
    const settled = messages(world, 'have settled their feud');
    expect(settled, 'the end is announced').toBe(1);
    expect(world.eventLog.some((e) => e.message.includes('Asha') && e.message.includes('Bo'))).toBe(true);
  });

  it('settles every feud its own drift opened over a year apart from new ones', () => {
    const people = Array.from({ length: 30 }, (_, i) =>
      human(i + 1, { residenceBuildingId: 10, traits: [i % 2 === 0 ? 'fierce' : 'stoic'] }),
    );
    const world = state();
    world.entities = people;

    advanceSocialRelationships(world, people, undefined, () => 0);
    const started = messages(world, 'feud is brewing');
    for (let day = 0; day < 150; day++) advanceSocialRelationships(world, people, undefined, () => 0.99);

    expect(started, 'the pulse opened feuds').toBeGreaterThan(0);
    expect(messages(world, 'have settled their feud'), `started ${started}`).toBe(started);
  });
});

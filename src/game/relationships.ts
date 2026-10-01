import type { Entity, SettlerTrait, WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { logEvent } from './eventLog';
import { playerHumansFrom } from './playerHuman';
import { getSimRng } from './simRng';

const FRIEND_PREFIX = 'friend_';
const FEUD_PREFIX = 'feud_';

const RELATIONSHIP_RNG_OWNER = 'relationships';

export const FRIEND_CLOSE_THRESHOLD = 60;

const friendKey = (id: number) => `${FRIEND_PREFIX}${id}`;
const feudKey = (id: number) => `${FEUD_PREFIX}${id}`;

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

const GROUP_SAMPLE_SIZE = 40;

const FEUD_ROLL_BUDGET = 20_000;

const MAX_LIVE_FEUDS_PER_SETTLER = 3;

export const MAX_CLOSE_FRIENDS_PER_SETTLER = 6;

const FRIENDSHIP_GROUP_BUMP = 0.6;
const FRIENDSHIP_CHILDHOOD_BUMP = 0.3;
export const FRIENDSHIP_DECAY_PER_DAY = 0.1;

const FEUD_DECAY_PER_DAY = 0.4;
const FEUD_ENERGY_DRAIN = 0.15;
const NOTABLE_FEUD_PEAK = 60;
const FEUD_BREWING_THRESHOLD = 30;

const INCOMPATIBLE_PAIR_FEUD_CHANCE_PER_DAY = 0.00005;
const INCOMPATIBLE_PAIR_FEUD_AMOUNT = 30;

const TRAIT_CLASHES: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
  ['brave', 'timid'],
  ['gregarious', 'timid'],
  ['gregarious', 'stoic'],
  ['fierce', 'stoic'],
  ['chivalrous', 'fierce'],
];

function traitClashCount(a: Entity, b: Entity): number {
  const aTraits = a.traits;
  const bTraits = b.traits;
  if (!aTraits?.length || !bTraits?.length) return 0;
  let clashes = 0;
  for (const [x, y] of TRAIT_CLASHES) {
    if ((aTraits.includes(x) && bTraits.includes(y)) || (aTraits.includes(y) && bTraits.includes(x))) {
      clashes++;
    }
  }
  return clashes;
}

function tradeOf(e: Entity): Entity['job'] | null {
  return e.job && e.job !== JobType.Settler ? e.job : null;
}

function sharesContext(a: Entity, b: Entity): boolean {
  if (a.residenceBuildingId != null && a.residenceBuildingId === b.residenceBuildingId) return true;
  if (a.homeBuildingId != null && a.homeBuildingId === b.homeBuildingId) return true;
  const trade = tradeOf(a);
  if (trade != null && trade === tradeOf(b)) return true;
  if (a.childhoodFriendsIds?.includes(b.id) || b.childhoodFriendsIds?.includes(a.id)) return true;
  return false;
}

function sampleGroup(group: Entity[], rng: () => number): Entity[] {
  if (group.length <= GROUP_SAMPLE_SIZE) return group;
  const offset = Math.floor(rng() * group.length);
  const out = new Array<Entity>(GROUP_SAMPLE_SIZE);
  for (let k = 0; k < GROUP_SAMPLE_SIZE; k++) out[k] = group[(offset + k) % group.length];
  return out;
}

function pushToGroup<K>(groups: Map<K, Entity[]>, key: K, e: Entity): void {
  const arr = groups.get(key);
  if (arr) arr.push(e);
  else groups.set(key, [e]);
}

export function friendshipScore(e: Entity, otherId: number): number {
  return e.friendships?.[friendKey(otherId)] ?? 0;
}

export function feudScore(e: Entity, otherId: number): number {
  return e.feuds?.[feudKey(otherId)] ?? 0;
}

export function hurtFriendship(a: Entity, b: Entity, amount: number): void {
  if (a.id === b.id || amount <= 0) return;
  a.friendships = a.friendships || {};
  b.friendships = b.friendships || {};
  const aKey = friendKey(b.id);
  const bKey = friendKey(a.id);
  a.friendships[aKey] = Math.max(0, (a.friendships[aKey] ?? 0) - amount);
  b.friendships[bKey] = Math.max(0, (b.friendships[bKey] ?? 0) - amount);
}

export function friendCount(e: Entity): number {
  if (!e.friendships) return 0;
  let count = 0;
  for (const val of Object.values(e.friendships)) {
    if (val >= FRIEND_CLOSE_THRESHOLD) count++;
  }
  return count;
}

export interface BondCensus {
  closeBonds: number;
  withFriend: number;
  isolated: number;
}

export function bondCensus(people: Entity[]): BondCensus {
  let closeBonds = 0;
  let withFriend = 0;
  for (const p of people) {
    let mine = 0;
    const friendships = p.friendships;
    if (friendships) {
      for (const key in friendships) {
        if (!hasOwn(friendships, key)) continue;
        if (friendships[key] < FRIEND_CLOSE_THRESHOLD) continue;
        mine += 1;
        const otherId = Number(key.substring(FRIEND_PREFIX.length));
        if (p.id < otherId) closeBonds += 1;
      }
    }
    if (mine > 0) withFriend += 1;
  }
  return { closeBonds, withFriend, isolated: people.length - withFriend };
}

export function activeFeudCount(e: Entity): number {
  if (!e.feuds) return 0;
  let count = 0;
  for (const val of Object.values(e.feuds)) {
    if (val > 0) count++;
  }
  return count;
}

export function advanceSocialRelationships(
  state: WorldState,
  allAlive: Entity[],
  peopleForPass?: Entity[],
  rng: () => number = getSimRng(RELATIONSHIP_RNG_OWNER),
): void {
  const people = peopleForPass ?? playerHumansFrom(allAlive);
  if (people.length < 2) return;

  const byId = new Map(people.map((e) => [e.id, e]));
  const aliveIds = new Set(allAlive.map((e) => e.id));

  const residenceGroups = new Map<number, Entity[]>();
  const workplaceGroups = new Map<number, Entity[]>();
  const jobGroups = new Map<string, Entity[]>();
  for (const p of people) {
    if (p.residenceBuildingId != null) pushToGroup(residenceGroups, p.residenceBuildingId, p);
    if (p.homeBuildingId != null) pushToGroup(workplaceGroups, p.homeBuildingId, p);
    const trade = tradeOf(p);
    if (trade != null) pushToGroup(jobGroups, trade, p);
  }

  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const bumpedPairs = new Set<string>();
  const feudRolledPairs = new Set<string>();
  let feudRollsLeft = FEUD_ROLL_BUDGET;

  const liveFeudsById = new Map<number, number>();
  const closeFriendsById = new Map<number, number>();
  for (const p of people) {
    const feuds = activeFeudCount(p);
    if (feuds > 0) liveFeudsById.set(p.id, feuds);
    const friends = friendCount(p);
    if (friends > 0) closeFriendsById.set(p.id, friends);
  }

  const bumpFriendship = (a: Entity, b: Entity, amt: number) => {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (bumpedPairs.has(key)) return;
    bumpedPairs.add(key);

    if (feudScore(a, b.id) > 0) return;

    const before = friendshipScore(a, b.id);
    const next = Math.min(100, before + amt);
    if (before < FRIEND_CLOSE_THRESHOLD && next >= FRIEND_CLOSE_THRESHOLD) {
      if ((closeFriendsById.get(a.id) ?? 0) >= MAX_CLOSE_FRIENDS_PER_SETTLER) return;
      if ((closeFriendsById.get(b.id) ?? 0) >= MAX_CLOSE_FRIENDS_PER_SETTLER) return;
      closeFriendsById.set(a.id, (closeFriendsById.get(a.id) ?? 0) + 1);
      closeFriendsById.set(b.id, (closeFriendsById.get(b.id) ?? 0) + 1);
    }

    a.friendships = a.friendships || {};
    b.friendships = b.friendships || {};
    a.friendships[friendKey(b.id)] = next;
    b.friendships[friendKey(a.id)] = next;
  };

  const driftIntoFeud = (a: Entity, b: Entity) => {
    if (a.id === b.id || feudRollsLeft <= 0) return;
    const key = pairKey(a.id, b.id);
    if (feudRolledPairs.has(key)) return;
    feudRolledPairs.add(key);
    feudRollsLeft--;

    if (feudScore(a, b.id) > 0) return;
    if ((liveFeudsById.get(a.id) ?? 0) >= MAX_LIVE_FEUDS_PER_SETTLER) return;
    if ((liveFeudsById.get(b.id) ?? 0) >= MAX_LIVE_FEUDS_PER_SETTLER) return;

    const clashes = traitClashCount(a, b);
    if (clashes === 0) return;
    if (rng() >= clashes * INCOMPATIBLE_PAIR_FEUD_CHANCE_PER_DAY) return;

    startFeud(state, a, b, INCOMPATIBLE_PAIR_FEUD_AMOUNT);
    liveFeudsById.set(a.id, (liveFeudsById.get(a.id) ?? 0) + 1);
    liveFeudsById.set(b.id, (liveFeudsById.get(b.id) ?? 0) + 1);
  };

  for (const group of [...residenceGroups.values(), ...workplaceGroups.values(), ...jobGroups.values()]) {
    if (group.length < 2) continue;
    const sample = sampleGroup(group, rng);
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        bumpFriendship(sample[i], sample[j], FRIENDSHIP_GROUP_BUMP);
        driftIntoFeud(sample[i], sample[j]);
      }
    }
  }

  for (const p of people) {
    for (const fId of p.childhoodFriendsIds ?? []) {
      const f = byId.get(fId);
      if (f) bumpFriendship(p, f, FRIENDSHIP_CHILDHOOD_BUMP);
    }
  }

  for (const p of people) {
    const feuds = p.feuds;
    if (!feuds) continue;

    for (const key in feuds) {
      if (!hasOwn(feuds, key)) continue;
      const otherId = Number(key.substring(FEUD_PREFIX.length));
      if (Number.isNaN(otherId)) continue;

      const other = byId.get(otherId);
      if (!other) {
        if (!aliveIds.has(otherId)) {
          delete feuds[key];
          if (p.feudPeaks) delete p.feudPeaks[key];
        }
        continue;
      }

      const otherKey = feudKey(p.id);

      if (p.id > otherId) {
        if (!other.feuds || !hasOwn(other.feuds, otherKey)) {
          other.feuds = other.feuds || {};
          other.feuds[otherKey] = feuds[key];
        }
        continue;
      }

      const next = Math.max(0, feuds[key] - FEUD_DECAY_PER_DAY);

      if (next <= 0) {
        const peak = Math.max(p.feudPeaks?.[key] ?? 0, other.feudPeaks?.[otherKey] ?? 0);
        delete feuds[key];
        if (other.feuds) delete other.feuds[otherKey];
        if (p.feudPeaks) delete p.feudPeaks[key];
        if (other.feudPeaks) delete other.feudPeaks[otherKey];

        if (peak >= NOTABLE_FEUD_PEAK) {
          logEvent(state, 'event', `${p.name ?? 'A settler'} and ${other.name ?? 'another settler'} have settled their feud`);
        }
      } else {
        feuds[key] = next;
        other.feuds = other.feuds || {};
        other.feuds[otherKey] = next;

        p.energy = Math.max(0, (p.energy ?? 0) - FEUD_ENERGY_DRAIN);
        other.energy = Math.max(0, (other.energy ?? 0) - FEUD_ENERGY_DRAIN);
      }
    }
  }

  for (const p of people) {
    const friendships = p.friendships;
    if (!friendships) continue;

    for (const key in friendships) {
      if (!hasOwn(friendships, key)) continue;
      const otherId = Number(key.substring(FRIEND_PREFIX.length));
      if (Number.isNaN(otherId)) continue;

      const other = byId.get(otherId);
      if (!other) {
        if (!aliveIds.has(otherId)) delete friendships[key];
        continue;
      }
      if (p.id > otherId) continue;
      if (sharesContext(p, other)) continue;

      const next = Math.max(0, friendships[key] - FRIENDSHIP_DECAY_PER_DAY);
      const otherKey = friendKey(p.id);
      if (next <= 0) {
        delete friendships[key];
        if (other.friendships) delete other.friendships[otherKey];
      } else {
        friendships[key] = next;
        other.friendships = other.friendships || {};
        other.friendships[otherKey] = next;
      }
    }
  }

  for (const p of people) {
    const strongCount = friendCount(p);
    if (strongCount === 0) continue;
    const maxEnergy = p.maxEnergy ?? 100;
    const boost = Math.min(2, strongCount * 0.8);
    p.energy = Math.min(maxEnergy, (p.energy ?? 0) + boost);
  }
}

export function startFeud(state: WorldState, wronged: Entity, wrongdoer: Entity, amount = 25): void {
  if (wronged.id === wrongdoer.id) return;

  wronged.feuds = wronged.feuds || {};
  wrongdoer.feuds = wrongdoer.feuds || {};
  wronged.feudPeaks = wronged.feudPeaks || {};
  wrongdoer.feudPeaks = wrongdoer.feudPeaks || {};

  const wrongedKey = feudKey(wrongdoer.id);
  const wrongdoerKey = feudKey(wronged.id);

  const wrongedBefore = wronged.feuds[wrongedKey] ?? 0;
  const wrongdoerBefore = wrongdoer.feuds[wrongdoerKey] ?? 0;

  const newWrongedScore = Math.min(100, wrongedBefore + amount);
  const newWrongdoerScore = Math.min(100, wrongdoerBefore + amount);

  wronged.feuds[wrongedKey] = newWrongedScore;
  wrongdoer.feuds[wrongdoerKey] = newWrongdoerScore;

  wronged.feudPeaks[wrongedKey] = Math.max(wronged.feudPeaks[wrongedKey] ?? 0, newWrongedScore);
  wrongdoer.feudPeaks[wrongdoerKey] = Math.max(wrongdoer.feudPeaks[wrongdoerKey] ?? 0, newWrongdoerScore);

  hurtFriendship(wronged, wrongdoer, amount);

  if (wrongedBefore < FEUD_BREWING_THRESHOLD && newWrongedScore >= FEUD_BREWING_THRESHOLD) {
    logEvent(state, 'scandal', `A feud is brewing between ${wronged.name ?? 'a settler'} and ${wrongdoer.name ?? 'another settler'}`);
  }
}
import type { Entity, SettlerTrait, WorldState } from './gameTypes';
import { logEvent } from './eventLog';
import { playerHumansFrom } from './playerHuman';
import { getSimRng } from './simRng';

/**
 * Relationship webs (Phase 7) — friendships grow from shared work, home and childhood; feuds come
 * from a wrong or from clashing traits that share a home, workplace or job. Both move daily energy.
 */

const FRIEND_PREFIX = 'friend_';
const FEUD_PREFIX = 'feud_';

/** This module's own simRng stream (docs/SIM_RNG_GUIDELINES.md). */
const RELATIONSHIP_RNG_OWNER = 'relationships';

/** A friendship at or above this is "close": it lifts daily energy and reads as a
 *  friend in the UI. Named because it was a bare `60` in four places. */
export const FRIEND_CLOSE_THRESHOLD = 60;

const friendKey = (id: number) => `${FRIEND_PREFIX}${id}`;
const feudKey = (id: number) => `${FEUD_PREFIX}${id}`;

/** Cap all-pairs friendship bumps per shared group — a pathological group (e.g. the
 * whole colony sharing one home) must not cost O(H²) per day. */
const PAIR_BUDGET = 40;

/** Cap on daily drift-feud pair rolls. Must clear a real colony's scan (~10.6k pairs at 500
 *  settlers), or the groups the pulse reaches last stop rolling and feuds skew to housemates. */
const FEUD_ROLL_BUDGET = 20_000;

/** Live feuds one settler may carry from drift; a wrong is never refused by this cap. */
const MAX_LIVE_FEUDS_PER_SETTLER = 3;

/** Daily chance per clashing trait pair that co-located settlers drift into a feud: about 0.2
 *  starts a day at 500 settlers, which the 0.4/day fade holds near a dozen live feuds. */
const INCOMPATIBLE_PAIR_FEUD_CHANCE_PER_DAY = 0.00005;

/** 30 = the score a drift feud opens at: it clears `startFeud`'s "brewing" log and lasts ~75 days. */
const INCOMPATIBLE_PAIR_FEUD_AMOUNT = 30;

/** Trait pairs that rub two settlers the wrong way; each clash adds one to the daily feud chance. */
const TRAIT_CLASHES: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
  ['brave', 'timid'],
  ['gregarious', 'timid'],
  ['gregarious', 'stoic'],
  ['fierce', 'stoic'],
  ['chivalrous', 'fierce'],
];

/** How many documented trait clashes two settlers carry between them. */
function traitClashCount(a: Entity, b: Entity): number {
  const aTraits = a.traits;
  const bTraits = b.traits;
  if (!aTraits?.length || !bTraits?.length) return 0;
  let clashes = 0;
  for (let i = 0; i < TRAIT_CLASHES.length; i++) {
    const pair = TRAIT_CLASHES[i];
    const x = pair[0];
    const y = pair[1];
    if ((aTraits.includes(x) && bTraits.includes(y)) || (aTraits.includes(y) && bTraits.includes(x))) {
      clashes++;
    }
  }
  return clashes;
}

export function friendshipScore(e: Entity, otherId: number): number {
  return e.friendships?.[friendKey(otherId)] ?? 0;
}

export function feudScore(e: Entity, otherId: number): number {
  return e.feuds?.[feudKey(otherId)] ?? 0;
}

/**
 * Damages the friendship between two settlers (both directions, symmetric like
 * the daily bump). Used for social wrongs such as a famine foot-bite: the
 * victim is not amused. Floors at 0; never pushes below zero.
 */
export function hurtFriendship(a: Entity, b: Entity, amount: number): void {
  if (a.id === b.id || amount <= 0) return;
  a.friendships = a.friendships || {};
  b.friendships = b.friendships || {};
  const aKey = friendKey(b.id);
  const bKey = friendKey(a.id);
  a.friendships[aKey] = Math.max(0, (a.friendships[aKey] ?? 0) - amount);
  b.friendships[bKey] = Math.max(0, (b.friendships[bKey] ?? 0) - amount);
}

/** Number of strong friendships (score ≥ 60) — for UI badges. */
export function friendCount(e: Entity): number {
  if (!e.friendships) return 0;
  let count = 0;
  for (const val of Object.values(e.friendships)) {
    if (val >= FRIEND_CLOSE_THRESHOLD) count++;
  }
  return count;
}

/**
 * How the colony's friendships stand, for the yearly record.
 *
 * Routine friendship is a background process and belongs in a periodic total, not
 * in the event log: an exported 2 000-event chronicle from a real village was
 * **1 197 lines of "X and Y have become friends"** — 60 % of the log — which also
 * buried the leadership election the player was looking for. The owner's ruling:
 * a total once a year is fine.
 */
export interface BondCensus {
  /** Distinct pairs whose friendship has reached the close threshold. */
  closeBonds: number;
  /** Settlers holding at least one close bond. */
  withFriend: number;
  /** Settlers holding none at all — the number that *should* be non-zero. */
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
        if (!Object.prototype.hasOwnProperty.call(friendships, key)) continue;
        if (friendships[key] < FRIEND_CLOSE_THRESHOLD) continue;
        mine += 1;
        // Count each pair once: the lower id owns the pair.
        const otherId = Number(key.substring(FRIEND_PREFIX.length));
        if (p.id < otherId) closeBonds += 1;
      }
    }
    if (mine > 0) withFriend += 1;
  }
  return { closeBonds, withFriend, isolated: people.length - withFriend };
}

/** Number of live feuds (score > 0). */
export function activeFeudCount(e: Entity): number {
  if (!e.feuds) return 0;
  let count = 0;
  for (const val of Object.values(e.feuds)) {
    if (val > 0) count++;
  }
  return count;
}

/** Daily pulse — friendships, feuds, and their energy effects. */
export function advanceSocialRelationships(
  state: WorldState,
  allAlive: Entity[],
  /**
   * `playerHumansFrom(allAlive)` for a caller that needs the same list more than once in one pass.
   * Must be derived from `allAlive`: the daily layer passes `allAlive` (which includes this tick's
   * newborns) rather than `ctx.playerHumans`, which is the tick-start list.
   */
  peopleForPass?: Entity[],
  /** Overridable for tests; production always draws from this module's own stream. */
  rng: () => number = getSimRng(RELATIONSHIP_RNG_OWNER),
): void {
  const people = peopleForPass ?? playerHumansFrom(allAlive);
  if (people.length < 2) return;

  const byId = new Map(people.map((e) => [e.id, e]));
  const residenceGroups = new Map<number, Entity[]>();
  const workplaceGroups = new Map<number, Entity[]>();
  const jobGroups = new Map<string, Entity[]>();

  for (const p of people) {
    // Field naming trap: in this codebase `homeBuildingId` is the **workplace**
    // (`residencyOccupancy.hasWorkAssignment` = `homeBuildingId != null`) and
    // `residenceBuildingId` is the home. The only "home" group used to be keyed on
    // `homeBuildingId`, so the residence half of the documented rule ("friendships grow from
    // shared work, home and childhood") had no implementation at all — two settlers sharing a
    // House gained nothing (`BUG_REPORTS/2026-09-16-shared-home-friendship-keyed-on-the-workplace.md`).
    // Both documented sources now exist: residence, workplace building, and job type.
    if (p.residenceBuildingId != null) {
      const arr = residenceGroups.get(p.residenceBuildingId) || [];
      arr.push(p);
      residenceGroups.set(p.residenceBuildingId, arr);
    }
    if (p.homeBuildingId != null) {
      const arr = workplaceGroups.get(p.homeBuildingId) || [];
      arr.push(p);
      workplaceGroups.set(p.homeBuildingId, arr);
    }
    if (p.job) {
      const arr = jobGroups.get(p.job) || [];
      arr.push(p);
      jobGroups.set(p.job, arr);
    }
  }

  const seenPairs = new Set<string>();
  const processedFeuds = new Set<string>(); // Track feuds to avoid double-energy drain
  const feudRolledPairs = new Set<string>();
  let feudRollsLeft = FEUD_ROLL_BUDGET;

  // Live feuds per settler, counted once so the drift roll below is a Map lookup per pair.
  const liveFeudsById = new Map<number, number>();
  for (const p of people) {
    const held = activeFeudCount(p);
    if (held > 0) liveFeudsById.set(p.id, held);
  }

  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  
  const bumpFriendship = (a: Entity, b: Entity, amt: number) => {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (seenPairs.has(key)) return;
    
    seenPairs.add(key);

    // A live feud blocks the friendship this grouping would otherwise grow.
    if (feudScore(a, b.id) > 0) return;
    
    a.friendships = a.friendships || {};
    b.friendships = b.friendships || {};
    
    const before = a.friendships[friendKey(b.id)] ?? 0;
    const next = Math.min(100, before + amt);
    
    a.friendships[friendKey(b.id)] = next;
    b.friendships[friendKey(a.id)] = next;
  };

  /** Incompatible-pair source: co-located settlers whose traits clash may drift into a feud. */
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

  // Shared home, shared workplace and shared job draw people together (bounded to PAIR_BUDGET members)
  for (const group of [...residenceGroups.values(), ...workplaceGroups.values(), ...jobGroups.values()]) {
    if (group.length < 2) continue;
    const capped = group.length > PAIR_BUDGET ? group.slice(0, PAIR_BUDGET) : group;
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        bumpFriendship(capped[i], capped[j], 0.6);
        driftIntoFeud(capped[i], capped[j]);
      }
    }
  }

  // Childhood school bonds stay warm.
  for (const p of people) {
    for (const fId of p.childhoodFriendsIds ?? []) {
      const f = byId.get(fId);
      if (f) bumpFriendship(p, f, 0.3);
    }
  }

  // Feuds decay slowly; while live they drain both sides.
  for (const p of people) {
    const feuds = p.feuds;
    if (!feuds) continue;
    
    // 🚀 OPTIMIZED: Use for...in to avoid Object.entries allocation
    for (const key in feuds) {
      if (!feuds.hasOwnProperty(key)) continue;
      
      const otherId = Number(key.substring(FEUD_PREFIX.length));
      if (isNaN(otherId)) continue;

      const other = byId.get(otherId);

      // A counterpart who is gone is not an enemy any more: prune the record for **both**
      // sides, exactly as the friendship pass below does. This deletion used to sit below the
      // lead-only guard, so a survivor with the higher id kept `feud_<deadId>` forever — never
      // decayed, never deleted, never able to log "settled their feud"
      // (`BUG_REPORTS/2026-09-16-feud-against-a-removed-settler-never-pruned.md`).
      if (!other) {
        delete feuds[key];
        continue;
      }

      // Only process each pair once (lower ID takes responsibility for decay and energy).
      if (p.id > otherId) continue;

      const currentScore = feuds[key];

      const nextScore = Math.max(0, currentScore - 0.4);
      const feudPairKey = pairKey(p.id, otherId);

      if (nextScore <= 0) {
        delete feuds[key];
        // Check the other side too to clean up symmetrically if needed, 
        // though usually the other side will clean itself up on its turn.
        if (other.feuds?.[feudKey(p.id)]) {
           delete other.feuds[feudKey(p.id)];
        }

        if (currentScore >= 60) {
          logEvent(state, 'event', `${p.name ?? 'A settler'} and ${other.name ?? 'another settler'} have settled their feud`);
        }
      } else {
        feuds[key] = nextScore;
        // Ensure symmetry in score if it drifted (optional, but good for consistency)
        other.feuds = other.feuds || {};
        other.feuds[feudKey(p.id)] = nextScore;

        // 🛡️ FIX: Drain energy exactly once per pair per day
        if (!processedFeuds.has(feudPairKey)) {
          processedFeuds.add(feudPairKey);
          p.energy = Math.max(0, (p.energy ?? 0) - 0.15);
          other.energy = Math.max(0, (other.energy ?? 0) - 0.15);
        }
      }
    }
  }

  // Strong friends lift each other's spirits. A counterpart who is gone is not a
  // friend any more, so prune the record here exactly as the feud pass above does.
  for (const p of people) {
    const friendships = p.friendships;
    if (!friendships) continue;

    let strongCount = 0;
    for (const key in friendships) {
      if (!friendships.hasOwnProperty(key)) continue;

      const otherId = Number(key.substring(FRIEND_PREFIX.length));
      if (isNaN(otherId)) continue;

      if (!byId.has(otherId)) {
        delete friendships[key];
        continue;
      }

      if (friendships[key] >= FRIEND_CLOSE_THRESHOLD) strongCount++;
    }

    if (strongCount > 0) {
      const currentEnergy = p.energy ?? 0;
      const maxEnergy = p.maxEnergy ?? 100;
      const boost = Math.min(2, strongCount * 0.8);
      p.energy = Math.min(maxEnergy, currentEnergy + boost);
    }
  }
}

/** Start a feud: the wronged party now feuds with the wrongdoer. */
export function startFeud(state: WorldState, wronged: Entity, wrongdoer: Entity, amount = 25): void {
  if (wronged.id === wrongdoer.id) return;
  
  wronged.feuds = wronged.feuds || {};
  wrongdoer.feuds = wrongdoer.feuds || {};
  
  const wrongedKey = feudKey(wrongdoer.id);
  const wrongdoerKey = feudKey(wronged.id);

  const wrongedBefore = wronged.feuds[wrongedKey] ?? 0;
  const wrongdoerBefore = wrongdoer.feuds[wrongdoerKey] ?? 0;
  
  const newWrongedScore = Math.min(100, wrongedBefore + amount);
  const newWrongdoerScore = Math.min(100, wrongdoerBefore + amount);

  wronged.feuds[wrongedKey] = newWrongedScore;
  wrongdoer.feuds[wrongdoerKey] = newWrongdoerScore;
  
  if (wrongedBefore < 30 && newWrongedScore >= 30) {
    logEvent(state, 'scandal', `A feud is brewing between ${wronged.name ?? 'a settler'} and ${wrongdoer.name ?? 'another settler'}`);
  }
}
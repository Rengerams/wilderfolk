import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { logEvent } from './eventLog';

/**
 * Relationship webs (Phase 7) — friendships grow from shared work, home and
 * childhood; feuds fester from wrongs and incompatible pairs, then slowly heal.
 * Both feed back into daily energy (friends lift you up; feuds wear you down).
 */

const FRIEND_PREFIX = 'friend_';
const FEUD_PREFIX = 'feud_';

const friendKey = (id: number) => `${FRIEND_PREFIX}${id}`;
const feudKey = (id: number) => `${FEUD_PREFIX}${id}`;

/** Cap all-pairs friendship bumps per shared group — a pathological group (e.g. the
 * whole colony sharing one home) must not cost O(H²) per day. */
const PAIR_BUDGET = 40;

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
    if (val >= 60) count++;
  }
  return count;
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

function playerHumans(allAlive: Entity[]): Entity[] {
  return allAlive.filter((e) => e.alive && e.type === EntityType.Human && !e.faction);
}

/** Daily pulse — friendships, feuds, and their energy effects. */
export function advanceSocialRelationships(state: WorldState, allAlive: Entity[]): void {
  const people = playerHumans(allAlive);
  if (people.length < 2) return;

  const byId = new Map(people.map((e) => [e.id, e]));
  const homeGroups = new Map<number, Entity[]>();
  const jobGroups = new Map<string, Entity[]>();
  
  for (const p of people) {
    if (p.homeBuildingId != null) {
      const arr = homeGroups.get(p.homeBuildingId) || [];
      arr.push(p);
      homeGroups.set(p.homeBuildingId, arr);
    }
    if (p.job) {
      const arr = jobGroups.get(p.job) || [];
      arr.push(p);
      jobGroups.set(p.job, arr);
    }
  }

  const seenPairs = new Set<string>();
  const processedFeuds = new Set<string>(); // Track feuds to avoid double-energy drain
  
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  
  const bumpFriendship = (a: Entity, b: Entity, amt: number) => {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (seenPairs.has(key)) return;
    
    seenPairs.add(key);
    
    a.friendships = a.friendships || {};
    b.friendships = b.friendships || {};
    
    const before = a.friendships[friendKey(b.id)] ?? 0;
    const next = Math.min(100, before + amt);
    
    a.friendships[friendKey(b.id)] = next;
    b.friendships[friendKey(a.id)] = next;
    
    if (before < 60 && next >= 60) {
      logEvent(state, 'event', `${a.name ?? 'A settler'} and ${b.name ?? 'another settler'} have become friends`);
    }
  };

  // Shared home and shared job draw people together (bounded to PAIR_BUDGET members)
  for (const group of [...homeGroups.values(), ...jobGroups.values()]) {
    if (group.length < 2) continue;
    const capped = group.length > PAIR_BUDGET ? group.slice(0, PAIR_BUDGET) : group;
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        bumpFriendship(capped[i], capped[j], 0.6);
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

      // Only process each pair once (lower ID takes responsibility)
      if (p.id > otherId) continue;
      
      const other = byId.get(otherId);
      const currentScore = feuds[key];
      
      if (!other) {
        delete feuds[key];
        continue;
      }

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

  // Strong friends lift each other's spirits.
  for (const p of people) {
    if (!p.friendships) continue;
    
    let strongCount = 0;
    for (const val of Object.values(p.friendships)) {
      if (val >= 60) strongCount++;
    }

    if (strongCount > 0) {
      const currentEnergy = p.energy ?? 0;
      const maxEnergy = p.maxEnergy ?? 100;
      const boost = Math.min(2, strongCount * 0.8);
      p.energy = Math.min(maxEnergy, currentEnergy + boost);
    }
  }
}

/** Start a feud: the wronged party now feuds with the wrongdoer (e.g. a caught affair). */
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
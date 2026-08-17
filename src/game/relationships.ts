import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { logEvent } from './eventLog';

/**
 * Relationship webs (Phase 7) — friendships grow from shared work, home and
 * childhood; feuds fester from wrongs and incompatible pairs, then slowly heal.
 * Both feed back into daily energy (friends lift you up; feuds wear you down).
 */

const friendKey = (id: number) => `friend_${id}`;
const feudKey = (id: number) => `feud_${id}`;

/** Cap all-pairs friendship bumps per shared group — a pathological group (e.g. the
 * whole colony sharing one home) must not cost O(H²) per day. */
const PAIR_BUDGET = 40;

export function friendshipScore(e: Entity, otherId: number): number {
  return e.friendships?.[friendKey(otherId)] ?? 0;
}

export function feudScore(e: Entity, otherId: number): number {
  return e.feuds?.[feudKey(otherId)] ?? 0;
}

/** Number of strong friendships (score ≥ 60) — for UI badges. */
export function friendCount(e: Entity): number {
  return Object.values(e.friendships ?? {}).filter((v) => v >= 60).length;
}

/** Number of live feuds (score > 0). */
export function activeFeudCount(e: Entity): number {
  return Object.values(e.feuds ?? {}).filter((v) => v > 0).length;
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
      const arr = homeGroups.get(p.homeBuildingId) ?? [];
      arr.push(p);
      homeGroups.set(p.homeBuildingId, arr);
    }
    if (p.job) {
      const arr = jobGroups.get(p.job) ?? [];
      arr.push(p);
      jobGroups.set(p.job, arr);
    }
  }

  const seen = new Set<string>();
  const pairKey = (a: Entity, b: Entity) => `${Math.min(a.id, b.id)}|${Math.max(a.id, b.id)}`;
  const bump = (a: Entity, b: Entity, amt: number) => {
    if (a.id === b.id || seen.has(pairKey(a, b))) return;
    seen.add(pairKey(a, b));
    a.friendships = a.friendships ?? {};
    b.friendships = b.friendships ?? {};
    const before = a.friendships[friendKey(b.id)] ?? 0;
    const next = Math.min(100, before + amt);
    a.friendships[friendKey(b.id)] = next;
    b.friendships[friendKey(a.id)] = next;
    if (before < 60 && next >= 60) {
      logEvent(state, 'event', `${a.name ?? 'A settler'} and ${b.name ?? 'another settler'} have become friends`);
    }
  };

  // Shared home and shared job draw people together (bounded to PAIR_BUDGET members
  // so an absurdly large shared group cannot explode to O(H²) pair work).
  for (const group of [...homeGroups.values(), ...jobGroups.values()]) {
    if (group.length < 2) continue;
    const capped = group.length > PAIR_BUDGET ? group.slice(0, PAIR_BUDGET) : group;
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) bump(capped[i], capped[j], 0.6);
    }
  }
  // Childhood school bonds stay warm.
  for (const p of people) {
    for (const fId of p.childhoodFriendsIds ?? []) {
      const f = byId.get(fId);
      if (f) bump(p, f, 0.3);
    }
  }

  // Feuds decay slowly; while live they drain both sides.
  for (const p of people) {
    const feuds = p.feuds;
    if (!feuds) continue;
    for (const [key, val] of Object.entries(feuds)) {
      const otherId = Number(key.replace('feud_', ''));
      const other = byId.get(otherId);
      if (!other) {
        delete feuds[key];
        continue;
      }
      const next = Math.max(0, val - 0.4);
      if (next <= 0) {
        delete feuds[key];
        if (val >= 60) {
          logEvent(state, 'event', `${p.name ?? 'A settler'} and ${other.name ?? 'another settler'} have settled their feud`);
        }
        continue;
      }
      feuds[key] = next;
      p.energy = Math.max(0, (p.energy ?? 0) - 0.15);
      other.energy = Math.max(0, (other.energy ?? 0) - 0.15);
    }
  }

  // Strong friends lift each other's spirits.
  for (const p of people) {
    const strong = Object.values(p.friendships ?? {}).filter((v) => v >= 60).length;
    if (strong > 0) {
      p.energy = Math.min(p.maxEnergy ?? 100, (p.energy ?? 0) + Math.min(2, strong * 0.8));
    }
  }
}

/** Start a feud: the wronged party now feuds with the wrongdoer (e.g. a caught affair). */
export function startFeud(state: WorldState, wronged: Entity, wrongdoer: Entity, amount = 25): void {
  if (wronged.id === wrongdoer.id) return;
  wronged.feuds = wronged.feuds ?? {};
  wrongdoer.feuds = wrongdoer.feuds ?? {};
  const before = wronged.feuds[feudKey(wrongdoer.id)] ?? 0;
  wronged.feuds[feudKey(wrongdoer.id)] = Math.min(100, before + amount);
  wrongdoer.feuds[feudKey(wronged.id)] = Math.min(100, before + amount);
  if (before < 30 && wronged.feuds[feudKey(wrongdoer.id)] >= 30) {
    logEvent(state, 'scandal', `A feud is brewing between ${wronged.name ?? 'a settler'} and ${wrongdoer.name ?? 'another settler'}`);
  }
}

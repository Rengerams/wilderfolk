import type { Entity, WorldState } from './gameTypes';
import { BuildingType, BUILDING_JOB_TYPES, EntityType, type JobType } from './gameTypes';
import { ensureEntitySkills, readSkill } from './skills';
import { logEvent } from './eventLog';

/**
 * Apprenticeships (Phase 7) — a skilled master (skill ≥ 40) working a production
 * building takes on the nearest unclaimed juvenile. The apprentice learns fast
 * under a good master and graduates (skill ≥ 50) into the trade.
 */

const MASTER_SKILL = 40;
const GRADUATE_SKILL = 50;

const PRODUCTION_TYPES = new Set<BuildingType>([
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Mine,
  BuildingType.Blacksmith,
  BuildingType.Workshop,
  BuildingType.Store,
  BuildingType.Market,
  BuildingType.HuntingSpot,
  BuildingType.FishingSpot,
]);

function playerHumans(allAlive: Entity[]): Entity[] {
  return allAlive.filter((e) => e.alive && e.type === EntityType.Human && !e.faction);
}

/** Skill the named entity holds in the given job (0 for none). */
export function apprenticeSkill(e: Entity | undefined, job: JobType): number {
  return e ? readSkill(e, job) : 0;
}

/** Daily pulse — match masters to apprentices and teach. */
export function advanceApprenticeships(state: WorldState, allAlive: Entity[]): void {
  const people = playerHumans(allAlive);
  if (people.length < 2) return;

  const byId = new Map(people.map((e) => [e.id, e]));
  // A juvenile apprenticed to a dead master is freed.
  for (const p of people) {
    if (p.apprenticeOfId != null && !byId.has(p.apprenticeOfId)) p.apprenticeOfId = undefined;
    if (p.apprenticeId != null && !byId.has(p.apprenticeId)) p.apprenticeId = undefined;
  }
  const claimed = new Set<number>(people.filter((p) => p.apprenticeOfId != null).map((p) => p.id));
  const juveniles = people.filter((p) => p.isJuvenile && !claimed.has(p.id));

  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    const job = BUILDING_JOB_TYPES[b.type];
    if (!job || !PRODUCTION_TYPES.has(b.type)) continue;

    const master = (b.occupants ?? [])
      .map((id) => byId.get(id))
      .find((e): e is Entity => !!e && !e.isJuvenile && readSkill(e, job) >= MASTER_SKILL);
    if (!master) continue;

    const currentApprentice = master.apprenticeId != null ? byId.get(master.apprenticeId) : undefined;
    if (currentApprentice && currentApprentice.alive) {
      teach(currentApprentice, master, job, state);
      continue;
    }
    master.apprenticeId = undefined;

    // Claim the nearest free juvenile.
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const j of juveniles) {
      const d = Math.hypot(j.x - bx, j.y - by);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best) {
      master.apprenticeId = best.id;
      best.apprenticeOfId = master.id;
      claimed.add(best.id);
      logEvent(state, 'event', `${best.name ?? 'A young settler'} began an apprenticeship under ${master.name ?? 'a master'}`);
    }
  }
}

function teach(ap: Entity, master: Entity, job: JobType, state: WorldState): void {
  const masterSkill = readSkill(master, job);
  const skills = ensureEntitySkills(ap);
  const before = skills[job] ?? 0;
  skills[job] = Math.min(100, before + 0.4 + (masterSkill / 100) * 0.5);
  // A teacher keeps their own hand in.
  ensureEntitySkills(master)[job] = Math.min(100, masterSkill + 0.05);
  if (before < GRADUATE_SKILL && skills[job] >= GRADUATE_SKILL) {
    ap.apprenticeOfId = undefined;
    master.apprenticeId = undefined;
    logEvent(state, 'milestone', `${ap.name ?? 'A young settler'} finished their apprenticeship under ${master.name ?? 'a master'} and joined the trade`);
  }
}

import type { Entity, WorldState } from './gameTypes';
import { BuildingType, BUILDING_JOB_TYPES, type JobType } from './gameTypes';
import { readSkill, writableEntitySkills } from './skills';
import { logEvent } from './eventLog';
import { playerHumansFrom } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { isAdult, isMinor } from './housingModel';
import { SCHOOL_GRADUATION_DAYS, getEducationTier } from './education';
import { evaluateAptitudeInfluence } from './personality/traitEvaluation';
import { advanceCareerProgression } from './careers/careerProgression';
import { getAbsoluteCalendarDay } from './dayCycleClock';

/**
 * Apprenticeships: a skilled master (skill ≥ 40) working a production building takes on a
 * school-qualified young adult; the apprentice graduates at skill ≥ 50.
 */

const MASTER_SKILL = 40;
const GRANDMASTER_SKILL = 80;
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

/** Skill the named entity holds in the given job (0 for none). */
export function apprenticeSkill(e: Entity | undefined, job: JobType): number {
  return e ? readSkill(e, job) : 0;
}

/** Daily pulse — match masters to apprentices and teach. */
export function advanceApprenticeships(
  state: WorldState,
  allAlive: Entity[],
  /**
   * `playerHumansFrom(allAlive)` for a caller needing the list twice in one pass; it must include
   * this tick's newborns, unlike `ctx.playerHumans`.
   */
  peopleForPass?: Entity[],
): void {
  const people = peopleForPass ?? playerHumansFrom(allAlive);
  if (people.length < 2) return;

  const byId = new Map(people.map((e) => [e.id, e]));
  // Remove legacy underage apprenticeship bonds (including those in older saves).
  // Apprenticeship skills and school progress remain untouched.
  for (const p of people) {
    if (p.apprenticeOfId != null && (!byId.has(p.apprenticeOfId) || isMinor(p))) {
      const master = byId.get(p.apprenticeOfId);
      if (master?.apprenticeId === p.id) master.apprenticeId = undefined;
      p.apprenticeOfId = undefined;
    }
    if (p.apprenticeId != null && !byId.has(p.apprenticeId)) p.apprenticeId = undefined;
  }
  const claimed = new Set<number>(people.filter((p) => p.apprenticeOfId != null).map((p) => p.id));
  // An apprenticeship is optional, not a guaranteed next step after school.
  // The stable id-based selection prevents repeatedly offering every eligible adult a place.
  const scholars = people.filter((p) => !p.isJuvenile && isAdult(p)
    && p.educated && getEducationTier(p.schoolDays ?? 0) === 3
    && !p.grandmasterApprenticeshipCompleted && !claimed.has(p.id));
  // Scholars keep their place in the waiting pool even after age 24.
  scholars.sort((a, b) => b.age - a.age || a.id - b.id);
  const candidates = people.filter((p) => !p.isJuvenile
    && isAdult(p) && p.age <= HUMAN_ADULT_MIN_AGE + 6
    && (p.schoolDays ?? 0) >= SCHOOL_GRADUATION_DAYS
    && getEducationTier(p.schoolDays ?? 0) < 3
    && (p.id * 37 + 17) % 4 === 0 && !claimed.has(p.id));

  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    const job = BUILDING_JOB_TYPES[b.type];
    if (!job || !PRODUCTION_TYPES.has(b.type)) continue;

    const masters = (b.occupants ?? [])
      .map((id) => byId.get(id))
      .filter((e): e is Entity => !!e && !e.isJuvenile && readSkill(e, job) >= MASTER_SKILL);

    for (const master of masters) {
      const currentApprentice = master.apprenticeId != null ? byId.get(master.apprenticeId) : undefined;
      if (currentApprentice && currentApprentice.alive) {
        teach(currentApprentice, master, job, state);
        continue;
      }
      master.apprenticeId = undefined;

      const grandmaster = readSkill(master, job) >= GRANDMASTER_SKILL;
      // Grandmasters reserve free slots for the oldest waiting Tier 3 scholars.
      const scholar = grandmaster ? scholars.find((p) => !claimed.has(p.id)) : undefined;
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      let best: Entity | null = scholar ?? null;
      let bestD = Infinity;
      if (!best) {
        for (const j of candidates) {
          if (claimed.has(j.id) || readSkill(j, job) >= GRADUATE_SKILL) continue;
          const d = Math.hypot(j.x - bx, j.y - by);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
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
}

function teach(ap: Entity, master: Entity, job: JobType, state: WorldState): void {
  const masterSkill = readSkill(master, job);
  const skills = writableEntitySkills(ap);
  const before = skills[job] ?? 0;
  // The apprentice's own aptitudes nudge how fast this trade is learned.
  const trainingFactor = evaluateAptitudeInfluence(ap, 'apprenticeshipTraining').factor;
  skills[job] = Math.min(100, before + (0.4 + (masterSkill / 100) * 0.5) * trainingFactor);
  // A teacher keeps their own hand in.
  writableEntitySkills(master)[job] = Math.min(100, masterSkill + 0.05);
  if (skills[job] >= GRADUATE_SKILL) {
    if (masterSkill >= GRANDMASTER_SKILL && getEducationTier(ap.schoolDays ?? 0) === 3) {
      ap.grandmasterApprenticeshipCompleted = true;
    }
    ap.apprenticeOfId = undefined;
    master.apprenticeId = undefined;
    advanceCareerProgression(ap, job, getAbsoluteCalendarDay(state.tick), 'training');
    logEvent(state, 'milestone', `${ap.name ?? 'A young settler'} finished their apprenticeship under ${master.name ?? 'a master'} and joined the trade`);
  }
}
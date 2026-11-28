import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_JOB_TYPES, EntityType, type JobType } from './gameTypes';
import { readSkill, increaseEntitySkill } from './skills';
import { logEvent } from './eventLog';
import { playerHumansFrom } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { SCHOOL_GRADUATION_DAYS, getEducationTier } from './education';
import { evaluateAptitudeInfluence } from './personality/traitEvaluation';
import { advanceCareerProgression } from './careers/careerProgression';
import { getAbsoluteCalendarDay, TICKS_PER_HOUR } from './dayCycleClock';
import { getWorkSchedule } from './workSchedule';
import { removeWorkerTransition } from './workforce';
import { beginCommuteRoutePass, isWithinAssignableCommute } from './commuteReach';
import { SPECIES_CONFIG } from './speciesConfig';

/**
 * Apprenticeships: a skilled master (skill ≥ 40) working a production building takes on a
 * school-qualified young adult; the apprentice graduates at skill ≥ 50.
 */

import { MASTER_SKILL, APPRENTICESHIP_BUILDING_TYPES, getApprenticeTrainingSite } from './apprenticeshipEligibility';
export { getApprenticeTrainingSite } from './apprenticeshipEligibility';
const GRANDMASTER_SKILL = 80;
const GRADUATE_SKILL = 50;
const APPRENTICESHIP_BONUS = 5;
const EDUCATED_COMPLETION_BONUS = 8;
const GRANDMASTER_COMPLETION_BONUS = 20;

/** Apprentices cannot attend a second workplace or a construction crew in the same shift. */
function hasCompetingWorkAssignment(apprentice: Entity, buildings: readonly Building[]): boolean {
  return apprentice.workerBuildingId != null || buildings.some((site) =>
    !site.completed && site.occupants.includes(apprentice.id));
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
  const buildingById = new Map(state.buildings.map((building) => [building.id, building]));
  // Restore older valid bonds intercepted by staffing: training owns the apprentice's shift.
  // Delegate both job and construction-roster cleanup to the workforce transition owner.
  // Apprenticeship skills and school progress remain untouched.
  for (const p of people) {
    if (p.apprenticeOfId != null && getApprenticeTrainingSite(p, byId, buildingById)
      && hasCompetingWorkAssignment(p, state.buildings)) {
      removeWorkerTransition(p, state.buildings);
    }
    if (p.apprenticeOfId != null && !getApprenticeTrainingSite(p, byId, buildingById)) {
      const master = byId.get(p.apprenticeOfId);
      if (master?.apprenticeId === p.id) master.apprenticeId = undefined;
      p.apprenticeOfId = undefined;
    }
    if (p.apprenticeId != null && byId.get(p.apprenticeId)?.apprenticeOfId !== p.id) p.apprenticeId = undefined;
  }
  const claimed = new Set<number>(people.filter((p) => p.apprenticeOfId != null).map((p) => p.id));
  // An apprenticeship is optional, not a guaranteed next step after school.
  // The stable id-based selection prevents repeatedly offering every eligible adult a place.
  const scholars = people.filter((p) => p.age >= HUMAN_ADULT_MIN_AGE
    && p.educated && p.prisonBuildingId == null && !p.raidDeploymentId && getEducationTier(p.schoolDays ?? 0) === 3
    && !p.grandmasterApprenticeshipCompleted && p.apprenticeId == null && !claimed.has(p.id));
  // Scholars keep their place in the waiting pool even after age 24.
  scholars.sort((a, b) => b.age - a.age || a.id - b.id);
  const candidates = people.filter((p) => p.age >= HUMAN_ADULT_MIN_AGE
    && p.age <= HUMAN_ADULT_MIN_AGE + 6
    && p.educated && p.prisonBuildingId == null && !p.raidDeploymentId
    && (p.schoolDays ?? 0) >= SCHOOL_GRADUATION_DAYS
    && getEducationTier(p.schoolDays ?? 0) < 3
    && (p.id * 37 + 17) % 4 === 0 && p.apprenticeId == null && !claimed.has(p.id));

  // Matching has its own bounded search pass, independent of earlier staffing/housing work.
  if (scholars.length || candidates.length) beginCommuteRoutePass();
  for (const b of state.buildings) {
    if (!b.completed) continue;
    const job = BUILDING_JOB_TYPES[b.type];
    if (!job || !APPRENTICESHIP_BUILDING_TYPES.has(b.type)) continue;

    const masters = (b.occupants ?? [])
      .map((id) => byId.get(id))
      .filter((e): e is Entity => !!e && e.alive && e.age >= HUMAN_ADULT_MIN_AGE && e.job === job
        && e.prisonBuildingId == null && !e.raidDeploymentId && e.apprenticeOfId == null
        && readSkill(e, job) >= MASTER_SKILL);

    for (const master of masters) {
      if (claimed.has(master.id)) continue;
      const currentApprentice = master.apprenticeId != null ? byId.get(master.apprenticeId) : undefined;
      if (currentApprentice?.alive && currentApprentice.age >= HUMAN_ADULT_MIN_AGE
        && currentApprentice.apprenticeOfId === master.id) {
        const schedule = getWorkSchedule(state);
        const requiredTicks = Math.ceil((schedule.endHour - schedule.startHour) * TICKS_PER_HOUR / 2);
        // A bond is not attendance: apprentice AND master must have worked at this site today.
        if ((currentApprentice.schedulePresentTicksToday ?? 0) >= requiredTicks
          && currentApprentice.schedulePresentSiteIdToday === b.id
          && (master.schedulePresentTicksToday ?? 0) >= requiredTicks
          && master.schedulePresentSiteIdToday === b.id) {
          teach(currentApprentice, master, job, state);
        }
        continue;
      }
      master.apprenticeId = undefined;

      const grandmaster = readSkill(master, job) >= GRANDMASTER_SKILL;
      // Grandmasters reserve free slots for the oldest waiting Tier 3 scholars.
      const eligible = (p: Entity): boolean => p.id !== master.id && p.apprenticeId == null
        && !claimed.has(p.id) && readSkill(p, job) < GRADUATE_SKILL
        && p.careerMilestones?.[job]?.trainedAtDay == null
        && isWithinAssignableCommute(p, b, state.buildings, SPECIES_CONFIG[EntityType.Human].speed, buildingById);
      const scholar = grandmaster ? scholars.find(eligible) : undefined;
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      let best: Entity | null = scholar ?? null;
      let bestD = Infinity;
      if (!best) {
        for (const j of candidates) {
          if (!eligible(j)) continue;
          const d = Math.hypot(j.x - bx, j.y - by);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
      if (best) {
        // A new apprenticeship replaces any normal job or build-crew duty. Without this,
        // an employed trainee keeps commuting to their old building and never earns lessons.
        if (hasCompetingWorkAssignment(best, state.buildings)) removeWorkerTransition(best, state.buildings);
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
  // The apprentice's own aptitudes nudge how fast this trade is learned.
  const trainingFactor = evaluateAptitudeInfluence(ap, 'apprenticeshipTraining').factor;
  increaseEntitySkill(ap, job, (0.4 + (masterSkill / 100) * 0.5) * trainingFactor);
  // A teacher keeps their own hand in without dirtying a saturated skill.
  increaseEntitySkill(master, job, 0.05);
  if (readSkill(ap, job) >= GRADUATE_SKILL) {
    const grandmaster = masterSkill >= GRANDMASTER_SKILL && getEducationTier(ap.schoolDays ?? 0) === 3;
    // Preserve the existing career receipt guard against repeat completion bonuses.
    if (ap.careerMilestones?.[job]?.trainedAtDay == null) {
      const tier = getEducationTier(ap.schoolDays ?? 0);
      increaseEntitySkill(ap, job, grandmaster ? GRANDMASTER_COMPLETION_BONUS
        : tier === 2 ? EDUCATED_COMPLETION_BONUS : APPRENTICESHIP_BONUS);
    }
    if (grandmaster) ap.grandmasterApprenticeshipCompleted = true;
    ap.apprenticeOfId = undefined;
    master.apprenticeId = undefined;
    advanceCareerProgression(ap, job, getAbsoluteCalendarDay(state.tick), 'training');
    logEvent(state, 'milestone', `${ap.name ?? 'A young settler'} finished their apprenticeship under ${master.name ?? 'a master'} and joined the trade`);
  }
}

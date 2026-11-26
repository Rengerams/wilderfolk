import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, BUILDING_JOB_TYPES, type JobType } from './gameTypes';
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

/**
 * Apprenticeships: a skilled master (skill ≥ 40) working a production building takes on a
 * school-qualified young adult; the apprentice graduates at skill ≥ 50.
 */

const MASTER_SKILL = 40;
const GRANDMASTER_SKILL = 80;
const GRADUATE_SKILL = 50;
const APPRENTICESHIP_BONUS = 5;
const GRANDMASTER_COMPLETION_BONUS = 10;

/** Apprentices cannot attend a second workplace or a construction crew in the same shift. */
function hasCompetingWorkAssignment(apprentice: Entity, buildings: readonly Building[]): boolean {
  return apprentice.workerBuildingId != null || buildings.some((site) =>
    !site.completed && site.occupants.includes(apprentice.id));
}

/** A trainee uses the mentor's real, staffed workplace, never a fabricated worker assignment. */
export function getApprenticeTrainingSite(
  apprentice: Entity,
  entityById: ReadonlyMap<number, Entity>,
  buildingById: ReadonlyMap<number, Building>,
): Building | null {
  if (!apprentice.alive || apprentice.age < HUMAN_ADULT_MIN_AGE || apprentice.prisonBuildingId != null
    || apprentice.raidDeploymentId || apprentice.apprenticeOfId == null) return null;
  const master = entityById.get(apprentice.apprenticeOfId);
  if (!master?.alive || master.apprenticeId !== apprentice.id || master.prisonBuildingId != null
    || master.raidDeploymentId) return null;
  const atSite = (building: Building | undefined): building is Building => !!building
    && building.completed && PRODUCTION_TYPES.has(building.type)
    && BUILDING_JOB_TYPES[building.type] === master.job
    && (building.occupants ?? []).includes(master.id);
  const assigned = master.workerBuildingId == null ? undefined : buildingById.get(master.workerBuildingId);
  if (atSite(assigned)) return assigned;
  // Older saves can carry a valid building roster without a synchronized workerBuildingId.
  for (const building of buildingById.values()) if (atSite(building)) return building;
  return null;
}


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
    if (p.apprenticeId != null && !byId.has(p.apprenticeId)) p.apprenticeId = undefined;
  }
  const claimed = new Set<number>(people.filter((p) => p.apprenticeOfId != null).map((p) => p.id));
  // An apprenticeship is optional, not a guaranteed next step after school.
  // The stable id-based selection prevents repeatedly offering every eligible adult a place.
  const scholars = people.filter((p) => p.age >= HUMAN_ADULT_MIN_AGE
    && p.educated && getEducationTier(p.schoolDays ?? 0) === 3
    && !p.grandmasterApprenticeshipCompleted && p.apprenticeId == null && !claimed.has(p.id));
  // Scholars keep their place in the waiting pool even after age 24.
  scholars.sort((a, b) => b.age - a.age || a.id - b.id);
  const candidates = people.filter((p) => p.age >= HUMAN_ADULT_MIN_AGE
    && p.age <= HUMAN_ADULT_MIN_AGE + 6
    && (p.schoolDays ?? 0) >= SCHOOL_GRADUATION_DAYS
    && getEducationTier(p.schoolDays ?? 0) < 3
    && (p.id * 37 + 17) % 4 === 0 && p.apprenticeId == null && !claimed.has(p.id));

  for (const b of state.buildings) {
    if (!b.completed) continue;
    const job = BUILDING_JOB_TYPES[b.type];
    if (!job || !PRODUCTION_TYPES.has(b.type)) continue;

    const masters = (b.occupants ?? [])
      .map((id) => byId.get(id))
      .filter((e): e is Entity => !!e && e.age >= HUMAN_ADULT_MIN_AGE && readSkill(e, job) >= MASTER_SKILL);

    for (const master of masters) {
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
    increaseEntitySkill(ap, job, grandmaster ? GRANDMASTER_COMPLETION_BONUS : APPRENTICESHIP_BONUS);
    if (grandmaster) ap.grandmasterApprenticeshipCompleted = true;
    ap.apprenticeOfId = undefined;
    master.apprenticeId = undefined;
    advanceCareerProgression(ap, job, getAbsoluteCalendarDay(state.tick), 'training');
    logEvent(state, 'milestone', `${ap.name ?? 'A young settler'} finished their apprenticeship under ${master.name ?? 'a master'} and joined the trade`);
  }
}
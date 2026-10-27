import type { WorldState, Entity, Building } from './gameTypes';
import { BuildingType, EntityType, JobType } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycle';
import { isWorkDay } from './dayCycleClock';
import { SCHOOL_MIN_AGE } from './gameConstants';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { ensureEntitySkills } from './skills';
import { addNotification } from './simEffects';
import { formatCitizenName } from './citizenId';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './playerHuman';
import { creditHumanStaminaFromEnergy } from './simulation/humanPhysiology';
import { commuteDistanceFromResidence, humanBuildingTarget } from './simulation/humanMovement';
import { commuteLeadHoursFor, MAX_ASSIGNABLE_COMMUTE_HOURS } from './commuteReach';
import { SPECIES_CONFIG } from './speciesConfig';

/** School days before faster maturation kicks in. */
export const SCHOOL_MIN_DAYS_FOR_BOOST = 3;
/** School days for basic graduation perks. */
export const SCHOOL_GRADUATION_DAYS = 120;
/** School days for the intermediate education tier. */
export const SCHOOL_EDUCATED_DAYS = 135;
/** School days for full education tier. */
export const SCHOOL_FULL_EDUCATION_DAYS = 150;

/** Credit school years completed before a child immigrated: 20 days per year after age 6. */
export function immigrantSchoolDaysForAge(age: number): number {
  return Math.max(0, Math.min(HUMAN_ADULT_MIN_AGE - SCHOOL_MIN_AGE, Math.floor(age) - SCHOOL_MIN_AGE)) * 20;
}

/** Pupils one assigned teacher can supervise — a school's seats are ten per teacher. */
export const SCHOOL_CHILDREN_PER_TEACHER = 10;

/** Hard ceiling on one school's pupils — the two-teacher building's twenty seats. */
export const SCHOOL_MAX_CHILDREN = 20;

export const SCHOOL_START_HOUR = 9;
export const SCHOOL_END_HOUR = 15;
export const SCHOOL_HOURS_PER_DAY = SCHOOL_END_HOUR - SCHOOL_START_HOUR;

export function isSchoolTime(tick: number, hourOfDay: number): boolean {
  return isWorkDay(tick) && hourOfDay >= SCHOOL_START_HOUR && hourOfDay < SCHOOL_END_HOUR;
}

/** Attend at least half of the six-hour classroom day to earn one school day. */
export const SCHOOL_DAY_MIN_HOURS = SCHOOL_HOURS_PER_DAY * 0.5;
/** The same threshold expressed in ticks — the unit `schoolTicksToday` is actually counted in. */
export const SCHOOL_DAY_MIN_TICKS = Math.floor(SCHOOL_DAY_MIN_HOURS * TICKS_PER_HOUR);

/** A school's seats: ten per assigned teacher, never more than the building's ceiling. */
export function schoolCapacity(school: Building): number {
  return Math.min(SCHOOL_MAX_CHILDREN, school.occupants.length * SCHOOL_CHILDREN_PER_TEACHER);
}

export function findStaffedSchools(buildings: readonly Building[]): Building[] {
  return buildings.filter(
    (b) =>
      b.completed
      && b.type === BuildingType.School
      && b.faction !== 'rival'
      && b.occupants.length > 0,
  );
}

export function findNearestStaffedSchool(
  child: Entity,
  schools: readonly Building[],
  reserved?: ReadonlyMap<number, number>,
): Building | undefined {
  if (schools.length === 0) return undefined;
  let best: Building | undefined;
  let bestDist = Infinity;
  for (const school of schools) {
    // Skip schools already at capacity (children reserved earlier this pass).
    if ((reserved?.get(school.id) ?? 0) >= schoolCapacity(school)) continue;
    const cx = school.x;
    const cy = school.y;
    const dist = Math.hypot(child.x - cx, child.y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = school;
    }
  }
  return best;
}

export function findSchoolForChild(
  child: Entity,
  buildings: readonly Building[],
  reserved?: ReadonlyMap<number, number>,
  reviewTransfer = false,
  walkSpeed = SPECIES_CONFIG[EntityType.Human].speed,
): Building | undefined {
  const schools = findStaffedSchools(buildings);
  const home = buildings.find((b) => b.id === child.residenceBuildingId);
  const current = schools.find((b) => b.id === child.schoolBuildingId);
  if (current && !reviewTransfer && (reserved?.get(current.id) ?? 0) < schoolCapacity(current)) return current;

  let best: Building | undefined;
  let bestDistance = Infinity;
  for (const school of schools) {
    if ((reserved?.get(school.id) ?? 0) >= schoolCapacity(school)) continue;
    const distance = commuteDistanceFromResidence(child, home, school);
    if (commuteLeadHoursFor(distance, walkSpeed) > MAX_ASSIGNABLE_COMMUTE_HOURS) continue;
    if (distance < bestDistance) {
      best = school;
      bestDistance = distance;
    }
  }
  if (!current || !best || current.id === best.id) return best;
  const distance = commuteDistanceFromResidence(child, home, current);
  if (distance - bestDistance < 12 || bestDistance > distance * 0.75) return current;
  return best;
}

/** Keep existing seats first; review closer schools on a new day. */
export function syncSchoolAssignments(
  humans: readonly Entity[],
  buildings: readonly Building[],
  reviewTransfers: boolean,
  walkSpeed: number,
): Map<number, Building> {
  const assignments = new Map<number, Building>();
  const staffed = new Map(findStaffedSchools(buildings).map((school) => [school.id, school]));
  const reserved = new Map<number, number>();
  const children = humans.filter((e) =>
    e.alive && isPlayerHuman(e) && e.isJuvenile && e.age >= SCHOOL_MIN_AGE,
  );
  // A settler who is no longer a pupil holds no seat: released here, where it is assigned, so no
  // later reader (school rosters, housing commute scoring) walks a graduate to school.
  const pupilIds = new Set(children.map((child) => child.id));
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human) || pupilIds.has(human.id)) continue;
    if (human.schoolBuildingId != null) human.schoolBuildingId = undefined;
  }
  for (const child of children) {
    const current = staffed.get(child.schoolBuildingId ?? -1);
    if (!current || (reserved.get(current.id) ?? 0) >= schoolCapacity(current)) {
      child.schoolBuildingId = undefined;
      continue;
    }
    assignments.set(child.id, current);
    reserved.set(current.id, (reserved.get(current.id) ?? 0) + 1);
  }
  for (const child of children) {
    const current = assignments.get(child.id);
    if (current && !reviewTransfers) continue;
    if (current) reserved.set(current.id, (reserved.get(current.id) ?? 1) - 1);
    const selected = findSchoolForChild(child, buildings, reserved, reviewTransfers, walkSpeed);
    if (selected) {
      assignments.set(child.id, selected);
      reserved.set(selected.id, (reserved.get(selected.id) ?? 0) + 1);
    } else {
      assignments.delete(child.id);
    }
    child.schoolBuildingId = selected?.id;
  }
  return assignments;
}

export function isChildAtSchool(child: Entity, school: Building, maxDist = 28): boolean {
  const target = humanBuildingTarget(school, child.id, false);
  return Math.hypot(child.x - target.x, child.y - target.y) <= maxDist;
}

/** Whether a teacher on this school's staff is standing at the school right now. */
export function hasTeacherPresent(
  school: Building,
  entityById: ReadonlyMap<number, Entity>,
  maxDist = 28,
): boolean {
  for (const id of school.occupants) {
    const teacher = entityById.get(id);
    if (!teacher || !teacher.alive) continue;
    const target = humanBuildingTarget(school, teacher.id, false);
    if (Math.hypot(teacher.x - target.x, teacher.y - target.y) <= maxDist) return true;
  }
  return false;
}

/**
 * The schooling owner's reason this settler has no classroom seat, or `null` when the seat rule would
 * take them. Pass the pass's `reserved` tally to ask the same question in the tick's world order.
 */
export function getSchoolingBlockReason(
  child: Entity,
  buildings: readonly Building[],
  reserved?: ReadonlyMap<number, number>,
): string | null {
  if (child.age < SCHOOL_MIN_AGE) return `Too young — school starts at age ${SCHOOL_MIN_AGE}`;
  if (!child.isJuvenile) return 'Grown up — past school age';
  const schools = buildings.filter((b) => b.type === BuildingType.School && b.faction !== 'rival');
  if (schools.length === 0) return 'No school built';
  if (!schools.some((b) => b.completed)) return 'School still under construction';
  const staffed = findStaffedSchools(buildings);
  if (staffed.length === 0) return 'School has no teacher assigned';
  if (findSchoolForChild(child, buildings, reserved)) return null;
  if (staffed.every((school) => (reserved?.get(school.id) ?? 0) >= schoolCapacity(school))) {
    return 'Every classroom is full';
  }
  return 'No school within two hours of home';
}

export interface SchoolRosterEntry {
  schoolId: number;
  /** Children the tick sends to this school, in world order. */
  pupils: Entity[];
  /** The subset physically inside the classroom during class hours right now. */
  inClassNow: Entity[];
}

/** Read the same persisted school seats as the simulation, without changing them. */
export function buildSchoolRosters(
  buildings: readonly Building[],
  humans: readonly Entity[],
  tick: number,
  hourOfDay: number,
): Map<number, SchoolRosterEntry> {
  const rosters = new Map<number, SchoolRosterEntry>();
  const schools = new Map(findStaffedSchools(buildings).map((school) => [school.id, school]));
  const children = humans.filter((e) =>
    e.alive && isPlayerHuman(e) && e.isJuvenile && e.age >= SCHOOL_MIN_AGE,
  );
  const reserved = new Map<number, number>();
  const assigned = new Map<number, Building>();
  for (const child of children) {
    const school = schools.get(child.schoolBuildingId ?? -1);
    if (!school || (reserved.get(school.id) ?? 0) >= schoolCapacity(school)) continue;
    assigned.set(child.id, school);
    reserved.set(school.id, (reserved.get(school.id) ?? 0) + 1);
  }
  for (const child of children) {
    if (assigned.has(child.id)) continue;
    const school = findSchoolForChild(child, buildings, reserved);
    if (!school) continue;
    assigned.set(child.id, school);
    reserved.set(school.id, (reserved.get(school.id) ?? 0) + 1);
  }
  const classHours = isSchoolTime(tick, hourOfDay);
  const byId = new Map(humans.map((human) => [human.id, human]));
  const teacherPresent = new Map<number, boolean>();
  for (const [id, school] of schools) teacherPresent.set(id, hasTeacherPresent(school, byId));
  for (const child of children) {
    const school = assigned.get(child.id);
    if (!school) continue;
    let entry = rosters.get(school.id);
    if (!entry) {
      entry = { schoolId: school.id, pupils: [], inClassNow: [] };
      rosters.set(school.id, entry);
    }
    entry.pupils.push(child);
    // A class needs its teacher there — the same presence the school-day credit requires.
    if (classHours && teacherPresent.get(school.id) && isChildAtSchool(child, school)) {
      entry.inClassNow.push(child);
    }
  }
  return rosters;
}

/** One school's roster — a view over `buildSchoolRosters` for the building inspector. */
export function getSchoolRoster(
  school: Building,
  buildings: readonly Building[],
  humans: readonly Entity[],
  tick: number,
  hourOfDay: number,
): SchoolRosterEntry {
  const entry = buildSchoolRosters(buildings, humans, tick, hourOfDay).get(school.id);
  return entry ?? { schoolId: school.id, pupils: [], inClassNow: [] };
}

/** Player-facing summary of a roster — the inspector renders these strings verbatim. */
export function describeSchoolRoster(
  entry: SchoolRosterEntry,
  hasTeacher: boolean,
  capacity: number,
): { headline: string; emptyHint: string | null; classroomFull: boolean } {
  return {
    headline: `Pupils ${entry.pupils.length}/${capacity}`,
    emptyHint: entry.pupils.length > 0
      ? null
      : hasTeacher
        ? 'No pupils yet — children enroll at an available staffed school.'
        : 'No teacher assigned — children only attend a staffed school.',
    classroomFull: capacity > 0 && entry.pupils.length >= capacity,
  };
}

/** One reason this settler set is out of school, with how many of them it holds. */
export interface SchoolingReasonCount {
  /** The owner's own reason, exactly as {@link getSchoolingBlockReason} states it. */
  reason: string;
  count: number;
}

/** Village-wide schooling answer: the population, the seats, and why each unseated child is out. */
export interface SchoolingSummary {
  /** Settlers below `SCHOOL_MIN_AGE` — school is not open to them yet. */
  tooYoung: number;
  /** Children in the school-age band the tick enrols (`SCHOOL_MIN_AGE` to graduation). */
  schoolAge: number;
  /** School-age children the seat rule gives a place to. */
  enrolled: number;
  /** Enrolled children inside a classroom during class hours right now. */
  inClassNow: number;
  /** Whether the clock is in a school shift at all; outside it nobody is in class. */
  classHours: boolean;
  /** Every school-age child without a seat, counted by the owner's reason. */
  outOfSchool: SchoolingReasonCount[];
}

/**
 * Every child in the village, seated or not, with the owner's reason for each unseated one — the
 * aggregate a per-school roster cannot give when no school exists.
 */
export function summarizeSchooling(
  state: WorldState,
  tick: number,
  hourOfDay: number,
): SchoolingSummary {
  const children = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && e.isJuvenile && isPlayerHuman(e),
  );
  const classHours = isSchoolTime(tick, hourOfDay);
  // Pass every settler: the roster reads teacher presence from the same list it seats children in.
  const rosters = buildSchoolRosters(state.buildings, state.entities, tick, hourOfDay);
  const enrolledIds = new Set<number>();
  const reserved = new Map<number, number>();
  let inClassNow = 0;
  for (const [schoolId, entry] of rosters) {
    reserved.set(schoolId, entry.pupils.length);
    for (const child of entry.pupils) enrolledIds.add(child.id);
    inClassNow += entry.inClassNow.length;
  }
  const buckets = new Map<string, number>();
  let tooYoung = 0;
  let schoolAge = 0;
  for (const child of children) {
    if (child.age < SCHOOL_MIN_AGE) {
      tooYoung++;
      continue;
    }
    schoolAge++;
    if (enrolledIds.has(child.id)) continue;
    const reason = getSchoolingBlockReason(child, state.buildings, reserved);
    if (reason) buckets.set(reason, (buckets.get(reason) ?? 0) + 1);
  }
  const outOfSchool = [...buckets].map(([reason, count]) => ({ reason, count }));
  outOfSchool.sort((a, b) => b.count - a.count);
  return { tooYoung, schoolAge, enrolled: enrolledIds.size, inClassNow, classHours, outOfSchool };
}

/** Player-facing schooling breakdown — the panel prints these strings verbatim. */
export function describeSchoolingSummary(
  summary: SchoolingSummary,
): { headline: string; lines: string[]; notes: string[] } {
  const lines = summary.outOfSchool.map(
    ({ reason, count }) => `${count} ${count === 1 ? 'child' : 'children'} — ${reason}`,
  );
  const notes: string[] = [];
  if (summary.tooYoung > 0) {
    notes.push(`${summary.tooYoung} younger than ${SCHOOL_MIN_AGE} — not school age yet.`);
  }
  if (summary.schoolAge > 0 && !summary.classHours) {
    notes.push('Outside school hours — classes run weekdays from 09:00 to 15:00.');
  } else if (summary.classHours && summary.enrolled > summary.inClassNow) {
    notes.push(`${summary.enrolled - summary.inClassNow} enrolled children not in class right now — still walking or busy.`);
  }
  const headline = summary.schoolAge === 0
    ? 'No children of school age in the village.'
    : `${summary.enrolled} of ${summary.schoolAge} school-age children have a seat`
      + (summary.classHours ? ` · ${summary.inClassNow} in class now.` : '.');
  return { headline, lines, notes };
}

/** Maturation multiplier while a child is actively attending a staffed school. */
export function getSchoolAgeMultiplier(
  child: Entity,
  buildings: Building[],
  nurturingCount = 0,
): number {
  if (child.type !== EntityType.Human || !child.isJuvenile || findStaffedSchools(buildings).length === 0) {
    return 1;
  }
  const days = child.schoolDays ?? 0;
  if (days < SCHOOL_MIN_DAYS_FOR_BOOST) return 1;
  const schoolBoost = Math.min(1, days / SCHOOL_FULL_EDUCATION_DAYS);
  // Nurturing settlers in the village help every child mature a bit faster.
  const nurtureBoost = Math.min(0.2, nurturingCount * 0.04);
  return 1 + schoolBoost + nurtureBoost;
}

export function creditChildSchoolDay(child: Entity): void {
  const ticks = child.schoolTicksToday ?? 0;
  if (ticks >= SCHOOL_DAY_MIN_TICKS) {
    child.schoolDays = (child.schoolDays ?? 0) + 1;
  }
  child.schoolTicksToday = 0;
}

export function recordChildSchoolTick(
  child: Entity,
  school: Building | undefined,
  hourOfDay: number,
  teacherPresent: boolean,
  tick?: number,
): void {
  // Attendance counts only during the weekday 09:00–15:00 shift, with the teacher there.
  const inSchoolHours = tick != null
    ? isSchoolTime(tick, hourOfDay)
    : hourOfDay >= SCHOOL_START_HOUR && hourOfDay < SCHOOL_END_HOUR;
  if (!school || !teacherPresent || !inSchoolHours || !isChildAtSchool(child, school)) return;
  child.schoolTicksToday = (child.schoolTicksToday ?? 0) + 1;
}

export function getEducationTier(schoolDays: number): 0 | 1 | 2 | 3 {
  if (schoolDays < SCHOOL_GRADUATION_DAYS) return 0;
  if (schoolDays < SCHOOL_EDUCATED_DAYS) return 1;
  if (schoolDays < SCHOOL_FULL_EDUCATION_DAYS) return 2;
  return 3;
}

export function formatEducationLabel(entity: Pick<Entity, 'isJuvenile' | 'schoolDays' | 'educated'>): string | null {
  if (entity.isJuvenile) {
    const days = entity.schoolDays ?? 0;
    if (days <= 0) return null;
    return `📚 ${days} school day${days === 1 ? '' : 's'}`;
  }
  if (!entity.educated) return null;
  const tier = getEducationTier(entity.schoolDays ?? 0);
  if (tier >= 3) return '🎓 Scholar';
  if (tier >= 2) return '📖 Educated';
  return '📘 Schooled';
}

export function applyEducationGraduation(state: WorldState, entity: Entity): void {
  // Schooling may accrue throughout ages 6–17, but graduation is adulthood-only.
  if (entity.age < HUMAN_ADULT_MIN_AGE || entity.isJuvenile) return;
  const days = entity.schoolDays ?? 0;
  const tier = getEducationTier(days);
  if (tier === 0) return;
  if (entity.educated) return;

  entity.educated = true;
  const skillBonus = tier === 3 ? 20 : tier === 2 ? 8 : 5;
  const energyBonus = tier === 3 ? 10 : tier === 2 ? 6 : 4;
  const skills = ensureEntitySkills(entity);
  for (const job of Object.values(JobType)) {
    skills[job] = Math.min(100, (skills[job] ?? 0) + skillBonus);
  }
  entity.maxEnergy = Math.min(500, entity.maxEnergy + energyBonus);
  creditHumanStaminaFromEnergy(entity, energyBonus * 0.5);

  const label = formatCitizenName(entity);
  const detail =
    tier === 3
      ? `${label} graduated with honors — eligible for grandmaster apprenticeship`
      : tier === 2
        ? `${label} graduated — bonus skills & stamina`
        : `${label} finished basic schooling — ready to work`;

  addNotification(state, 'Graduation', detail, 'success');
  logEvent(state, 'event', detail, entity.name);
}

/** Up to +15% research speed when most adults attended school; insightful settlers add a bit more. */
export function getEducationResearchMultiplier(humans: Entity[]): number {
  const adults = humans.filter((h) => h.alive && isPlayerHuman(h) && !h.isJuvenile);
  if (adults.length === 0) return 1;
  const educated = adults.filter((h) => h.educated).length;
  const insightful = adults.filter((h) => h.traits?.includes('insightful')).length;
  return 1 + (educated / adults.length) * 0.15 + Math.min(0.15, insightful * 0.03);
}

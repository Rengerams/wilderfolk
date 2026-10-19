import type { WorldState, Entity, Building } from './gameTypes';
import { BuildingType, EntityType, JobType } from './gameTypes';
import { WORK_HOURS_PER_DAY, TICKS_PER_HOUR, isOnWorkShift, isWorkHour } from './dayCycle';
import { SCHOOL_MIN_AGE } from './gameConstants';
import { HUMAN_ADULT_MIN_AGE } from './dayCycleConstants';
import { ensureEntitySkills } from './skills';
import { addNotification } from './simEffects';
import { formatCitizenName } from './citizenId';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './playerHuman';

/** School days before faster maturation kicks in. */
export const SCHOOL_MIN_DAYS_FOR_BOOST = 3;
/** School days for basic graduation perks. */
export const SCHOOL_GRADUATION_DAYS = 15;
/** School days for full education tier. */
export const SCHOOL_FULL_EDUCATION_DAYS = 45;

/** Max children who can attend one school at once — a classroom holds a classroom. */
export const SCHOOL_MAX_CHILDREN = 10;

/**
 * In-game school hours a child must attend to be credited one full school day — half a work day.
 * `schoolTicksToday` counts **ticks**, so the hour threshold must be converted before comparing:
 * it was compared against that tick counter directly, which credited a full school day after
 * ~1.7 in-game hours and made `schoolDays` accrue ~3.3× too fast
 * (`BUG_REPORTS/2026-09-16-school-day-credited-from-a-tick-counter.md`).
 */
export const SCHOOL_DAY_MIN_HOURS = WORK_HOURS_PER_DAY * 0.5;
/** The same threshold expressed in ticks — the unit `schoolTicksToday` is actually counted in. */
export const SCHOOL_DAY_MIN_TICKS = Math.floor(SCHOOL_DAY_MIN_HOURS * TICKS_PER_HOUR);

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
    if ((reserved?.get(school.id) ?? 0) >= SCHOOL_MAX_CHILDREN) continue;
    const cx = school.x + school.width / 2;
    const cy = school.y + school.height / 2;
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
  buildings: Building[],
  reserved?: ReadonlyMap<number, number>,
): Building | undefined {
  return findNearestStaffedSchool(child, findStaffedSchools(buildings), reserved);
}

export function isChildAtSchool(child: Entity, school: Building, maxDist = 28): boolean {
  const cx = school.x + school.width / 2;
  const cy = school.y + school.height / 2;
  return Math.hypot(child.x - cx, child.y - cy) <= maxDist;
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
  if (!findNearestStaffedSchool(child, staffed, reserved)) return 'Every classroom is full';
  return null;
}

export interface SchoolRosterEntry {
  schoolId: number;
  /** Children the tick sends to this school, in world order. */
  pupils: Entity[];
  /** The subset physically inside the classroom during class hours right now. */
  inClassNow: Entity[];
}

/**
 * Which children belong to which school, by exactly the rule the tick uses: the nearest
 * **staffed** school with a free seat, children served in world order, so a school fills
 * to `SCHOOL_MAX_CHILDREN` before the next one takes anyone (`humanTick`'s
 * `schoolReserved` pass).
 *
 * Attendance is deliberately not stored on either side, so this is that same
 * computation exposed for presentation — the school inspector's pupil list. Anything
 * that changes what a child's school *is* must change `findSchoolForChild`, and this
 * follows automatically.
 */
export function buildSchoolRosters(
  buildings: readonly Building[],
  humans: readonly Entity[],
  tick: number,
  hourOfDay: number,
): Map<number, SchoolRosterEntry> {
  const rosters = new Map<number, SchoolRosterEntry>();
  const staffed = findStaffedSchools(buildings);
  if (staffed.length === 0) return rosters;

  const reserved = new Map<number, number>();
  const classHours = isOnWorkShift(tick, hourOfDay);
  for (const child of humans) {
    if (
      !child.alive
      || child.type !== EntityType.Human
      || !child.isJuvenile
      || !isPlayerHuman(child)
    ) {
      continue;
    }
    const school = findNearestStaffedSchool(child, staffed, reserved);
    if (!school) continue;
    reserved.set(school.id, (reserved.get(school.id) ?? 0) + 1);

    let entry = rosters.get(school.id);
    if (!entry) {
      entry = { schoolId: school.id, pupils: [], inClassNow: [] };
      rosters.set(school.id, entry);
    }
    entry.pupils.push(child);
    if (classHours && isChildAtSchool(child, school)) entry.inClassNow.push(child);
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
): { headline: string; emptyHint: string | null; classroomFull: boolean } {
  return {
    headline: `Pupils ${entry.pupils.length}/${SCHOOL_MAX_CHILDREN}`,
    emptyHint: entry.pupils.length > 0
      ? null
      : hasTeacher
        ? 'No pupils yet — children walk to the nearest staffed school with a free seat.'
        : 'No teacher assigned — children only attend a staffed school.',
    classroomFull: entry.pupils.length >= SCHOOL_MAX_CHILDREN,
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
  const staffed = findStaffedSchools(state.buildings);
  const classHours = isOnWorkShift(tick, hourOfDay);
  const reserved = new Map<number, number>();
  const buckets = new Map<string, number>();

  let tooYoung = 0;
  let schoolAge = 0;
  let enrolled = 0;
  let inClassNow = 0;
  for (const child of children) {
    if (child.age < SCHOOL_MIN_AGE) {
      tooYoung++;
      continue;
    }
    schoolAge++;
    const seat = findNearestStaffedSchool(child, staffed, reserved);
    if (seat) {
      reserved.set(seat.id, (reserved.get(seat.id) ?? 0) + 1);
      enrolled++;
      if (classHours && isChildAtSchool(child, seat)) inClassNow++;
      continue;
    }
    const reason = getSchoolingBlockReason(child, state.buildings, reserved);
    if (reason) buckets.set(reason, (buckets.get(reason) ?? 0) + 1);
  }

  const outOfSchool = [...buckets].map(([reason, count]) => ({ reason, count }));
  outOfSchool.sort((a, b) => b.count - a.count);
  return { tooYoung, schoolAge, enrolled, inClassNow, classHours, outOfSchool };
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
    notes.push('Outside school hours — classes run on weekday work hours only.');
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
  tick?: number,
): void {
  // No school on weekends; weekday work hours only.
  const inSchoolHours = tick != null
    ? isOnWorkShift(tick, hourOfDay)
    : isWorkHour(hourOfDay);
  if (!school || !inSchoolHours || !isChildAtSchool(child, school)) return;
  child.schoolTicksToday = (child.schoolTicksToday ?? 0) + 1;
}

export function getEducationTier(schoolDays: number): 0 | 1 | 2 | 3 {
  if (schoolDays < SCHOOL_GRADUATION_DAYS) return 0;
  if (schoolDays < 30) return 1;
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
  const skillBonus = tier === 3 ? 12 : tier === 2 ? 8 : 5;
  const energyBonus = tier === 3 ? 10 : tier === 2 ? 6 : 4;
  const skills = ensureEntitySkills(entity);
  for (const job of Object.values(JobType)) {
    skills[job] = Math.min(100, (skills[job] ?? 0) + skillBonus);
  }
  entity.maxEnergy = Math.min(500, entity.maxEnergy + energyBonus);
  entity.energy = Math.min(entity.maxEnergy, entity.energy + energyBonus * 0.5);

  const label = formatCitizenName(entity);
  const detail =
    tier === 3
      ? `${label} finished school with honors — skilled worker & +research`
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
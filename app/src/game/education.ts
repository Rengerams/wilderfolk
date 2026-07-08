import type { WorldState, Entity, Building } from './gameTypes';
import { BuildingType, EntityType, JobType } from './gameTypes';
import { WORK_HOURS_PER_DAY, isWorkHour } from './dayCycle';
import { ensureEntitySkills } from './skills';
import { addNotification } from './gameEngine';
import { formatCitizenName } from './citizenId';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './groupEvents';

/** School days before faster maturation kicks in. */
export const SCHOOL_MIN_DAYS_FOR_BOOST = 3;
/** School days for basic graduation perks. */
export const SCHOOL_GRADUATION_DAYS = 15;
/** School days for full education tier. */
export const SCHOOL_FULL_EDUCATION_DAYS = 45;

export function findStaffedSchools(buildings: Building[]): Building[] {
  return buildings.filter(
    (b) =>
      b.completed
      && b.type === BuildingType.School
      && b.faction !== 'rival'
      && b.occupants.length > 0,
  );
}

export function findNearestStaffedSchool(child: Entity, schools: readonly Building[]): Building | undefined {
  if (schools.length === 0) return undefined;
  let best: Building | undefined;
  let bestDist = Infinity;
  for (const school of schools) {
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

export function findSchoolForChild(child: Entity, buildings: Building[]): Building | undefined {
  return findNearestStaffedSchool(child, findStaffedSchools(buildings));
}

export function isChildAtSchool(child: Entity, school: Building, maxDist = 28): boolean {
  const cx = school.x + school.width / 2;
  const cy = school.y + school.height / 2;
  return Math.hypot(child.x - cx, child.y - cy) <= maxDist;
}

/** Maturation multiplier while a child is actively attending a staffed school. */
export function getSchoolAgeMultiplier(child: Entity, buildings: Building[]): number {
  if (child.type !== EntityType.Human || !child.isJuvenile || findStaffedSchools(buildings).length === 0) {
    return 1;
  }
  const days = child.schoolDays ?? 0;
  if (days < SCHOOL_MIN_DAYS_FOR_BOOST) return 1;
  return 1 + Math.min(1, days / SCHOOL_FULL_EDUCATION_DAYS);
}

export function creditChildSchoolDay(child: Entity): void {
  const ticks = child.schoolTicksToday ?? 0;
  if (ticks >= Math.floor(WORK_HOURS_PER_DAY * 0.5)) {
    child.schoolDays = (child.schoolDays ?? 0) + 1;
  }
  child.schoolTicksToday = 0;
}

export function recordChildSchoolTick(
  child: Entity,
  school: Building | undefined,
  hourOfDay: number,
): void {
  if (!school || !isWorkHour(hourOfDay) || !isChildAtSchool(child, school)) return;
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
  const days = entity.schoolDays ?? 0;
  const tier = getEducationTier(days);
  if (tier === 0) return;

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

/** Up to +15% research speed when most adults attended school. */
export function getEducationResearchMultiplier(humans: Entity[]): number {
  const adults = humans.filter((h) => h.alive && isPlayerHuman(h) && !h.isJuvenile);
  if (adults.length === 0) return 1;
  const educated = adults.filter((h) => h.educated).length;
  return 1 + (educated / adults.length) * 0.15;
}
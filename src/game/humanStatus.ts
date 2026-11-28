/**
 * Read-only per-human activity label shown in the selected-entity inspector. It uses the building the
 * human is standing near, so the status reads naturally: "Working at Farm", "Hunting", etc.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { citizenGivenName } from './citizenId';
import { JobType } from './gameTypes';
import { getAbsoluteCalendarDay, getHourOfDay } from './dayCycleClock';
import { EVENING_START } from './dayCycle';
import { isAsleepAtHome, isFestivalGatherer, prefersHomeTonightFor } from './humanSchedule';
import { isNearResidence } from './housingModel';
import { getWorkSchedule, getWorkScheduleLabel } from './workSchedule';
import { findHumanWorkplace } from './workforce';
import { getApprenticeTrainingSite } from './apprenticeships';
import { getAssignedSchool, isSchoolAge, isAttendingSchool, hasTeacherPresent,
  isSchoolTime, isChildAtSchool, resolveSchoolSchedule, SCHOOL_START_HOUR, SCHOOL_END_HOUR } from './education';
import { buildingAccessPoint, isAtBuildingReach } from './buildingAccess';
import { isCommutingToBuilding } from './simulation/humanMovement';
import { BUILDING_CONFIGS } from './gameTypes';
import { resolveShift, WORK_ARRIVE_DISTANCE, getSettlerWorkReason, type SettlerWorkReason } from './workAbsence';

function labelFor(building: Building): string {
  return BUILDING_CONFIGS[building.type]?.label ?? 'Building';
}

/** Keep the primary companion visible, and mention additional living playmates. */
function childPlayCompanionLabel(state: WorldState, entity: Entity, companion: Entity): string {
  const others = (entity.childPlayGroupIds ?? []).filter((id) =>
    id !== entity.id && id !== companion.id
    && state.entities.some((candidate) => candidate.id === id && candidate.alive && candidate.isJuvenile),
  ).length;
  const name = citizenGivenName(companion);
  return others ? `${name} + ${others} ${others === 1 ? 'friend' : 'friends'}` : name;
}

export type HumanActivityTarget = {
  kind: 'school' | 'workplace' | 'home' | 'nearby-building' | 'hunt' | 'combat' | 'playmate' | 'guardian' | 'play-site';
  label: string;
  buildingId?: number;
  entityId?: number;
  x: number;
  y: number;
};

type HumanActivityTransition = {
  from: string;
  to: string;
  observedAtTick: number;
};

export type HumanActivityProjection = {
  activity: string;
  schedule: {
    label: string;
    startHour: number;
    endHour: number;
    onShift: boolean;
  };
  home: { id: number; label: string } | null;
  workplace: { id: number; label: string } | null;
  target: HumanActivityTarget | null;
  blockedReason: string | null;
  /** Why this settler is, or is not, at their post — the work-absence owner's verdict. */
  workReason: SettlerWorkReason;
  transition: HumanActivityTransition | null;
  observedAtTick: number;
};

/**
 * True when the settler has reached the projection's target — the owner's own "at the destination"
 * test, shared with {@link getHumanActivityStatus}.
 */
export function isAtActivityTarget(entity: Entity, target: HumanActivityTarget | null): boolean {
  if (!target) return false;
  return Math.hypot(target.x - entity.x, target.y - entity.y) <= WORK_ARRIVE_DISTANCE;
}

export function getHumanActivityStatus(
  state: WorldState,
  entity: Entity,
  workReason: SettlerWorkReason = getSettlerWorkReason(state, entity),
  school = getAssignedSchool(entity, state.buildings),
  schoolSchedule = resolveSchoolSchedule(entity, school,
    state.buildings.find((building) => building.id === entity.residenceBuildingId),
    state.tick, getHourOfDay(state.tick)),
): string {
  if (!entity.alive) return 'Dead';
  if (entity.raidDeploymentId) return 'Away with the war-band';
  // Hospital travel and admission are activities in their own right, not free time.
  if (workReason.code === 'going-to-hospital') return 'Walking to hospital';
  if (workReason.code === 'in-hospital') return 'In hospital';

  const hourOfDay = getHourOfDay(state.tick);
  const festivalActive = state.festival?.active;
  const regularWorkplace = findHumanWorkplace(entity, state.buildings);
  const trainingSite = regularWorkplace ? null : getApprenticeTrainingSite(
    entity, new Map(state.entities.map((person) => [person.id, person])),
    new Map(state.buildings.map((building) => [building.id, building])),
  );
  const workplace = regularWorkplace ?? trainingSite;
  const onWorkSchedule = !entity.isJuvenile && workplace != null && resolveShift(state, entity, workplace, hourOfDay).onShift;
  // The verdict is the simulation owner's, so the label cannot drift from what the settler does.
  if (isFestivalGatherer(hourOfDay, festivalActive, onWorkSchedule || schoolSchedule.onShift || schoolSchedule.commuteDue, entity.job === JobType.Innkeeper)) {
    return 'Gathering at festival';
  }

  if (!entity.isJuvenile && entity.combatTicks != null && entity.combatTicks > 0) return 'In combat';
  if (!entity.isJuvenile && entity.huntTargetId != null) return 'Hunting';

  if (entity.needs?.lastMealTick === state.tick) return 'Eating';
  if (entity.needs && (entity.needs.sleepRecoveryUntilTick ?? 0) > state.tick && !onWorkSchedule) {
    const home = state.buildings.find((building) =>
      building.id === entity.residenceBuildingId && building.completed);
    if (home) {
      return isNearResidence(entity, state.buildings) ? 'Sleeping (recovering)' : 'Walking home to sleep';
    }
  }
  if (isAsleepAtHome(entity, state.buildings, hourOfDay, onWorkSchedule)) return 'Sleeping';

  if (school && (schoolSchedule.onShift || schoolSchedule.commuteDue)) {
    const teacherPresent = hasTeacherPresent(school, new Map(state.entities.map((person) => [person.id, person])));
    if (isAttendingSchool(entity, school, hourOfDay, teacherPresent, state.tick)) return 'Attending school';
    if (isChildAtSchool(entity, school)) return schoolSchedule.onShift ? 'Waiting for teacher' : 'Waiting for class';
    return isCommutingToBuilding(entity, school) ? 'Walking to school' : 'Away from school';
  }
  if (isSchoolAge(entity) && isSchoolTime(state.tick, hourOfDay) && !school) return 'No assigned school seat';

  // The movement owner records both scheduled and leisure homeward journeys.
  const childHome = entity.isJuvenile && entity.residenceBuildingId != null
    ? state.buildings.find((building) =>
      building.id === entity.residenceBuildingId && building.completed)
    : undefined;
  if (childHome && !isAtBuildingReach(entity, childHome) && isCommutingToBuilding(entity, childHome)) {
    return 'Walking home';
  }

  const currentChildLeisure = entity.childPlaymateDay === getAbsoluteCalendarDay(state.tick)
    ? entity.childLeisureActivity : undefined;
  if (entity.isJuvenile && entity.childLeisureTargetId != null && currentChildLeisure) {
    const companion = state.entities.find((candidate) =>
      candidate.id === entity.childLeisureTargetId && candidate.alive);
    if (companion && currentChildLeisure === 'playing') {
      return `Playing with ${childPlayCompanionLabel(state, entity, companion)}`;
    }
    if (companion && currentChildLeisure === 'following') {
      return `Following ${citizenGivenName(companion)}`;
    }
  }

  // Assigned workplace during the configured work shift. Commuting is reported only on the
  // movement owner's evidence; being far from the post is not travel.
  if (workplace && onWorkSchedule) {
    const label = labelFor(workplace);
    if (trainingSite) return isAtBuildingReach(entity, trainingSite)
      ? `Apprenticing at ${label}`
      : isCommutingToBuilding(entity, trainingSite)
        ? `Walking to apprenticeship at ${label}` : `Away from apprenticeship at ${label}`;
    if (isAtBuildingReach(entity, workplace) || entity.indoorBuildingId === workplace.id) {
      return `Working at ${label}`;
    }
    return workReason.code === 'walking-to-work' ? `Commuting to ${label}` : `Away from ${label}`;
  }

  // Evening social outings are an intentional free-time state, not a failed home return: surface it
  // before nearby-building inference so the inspector explains why a resident is away.
  const isEveningOuting = !entity.isJuvenile && hourOfDay >= EVENING_START
    && hourOfDay < 23
    && !prefersHomeTonightFor(getWorkSchedule(state), entity.id, state.tick, hourOfDay)
    && !onWorkSchedule;
  if (isEveningOuting) return 'Socialising — evening outing';

  // Home is a real residence assignment, not proximity to a random building.
  if (entity.residenceBuildingId != null) {
    const residence = state.buildings.find((b) => b.id === entity.residenceBuildingId && b.completed);
    if (residence && isAtBuildingReach(entity, residence)) {
      return `At home (${labelFor(residence)})`;
    }
  }

  if (entity.isJuvenile) return 'Free time';

  // Not near any building but has a home → likely walking home (or away).
  if (entity.residenceBuildingId != null) {
    const home = state.buildings.find((b) => b.id === entity.residenceBuildingId);
    if (home && !isAtBuildingReach(entity, home)) return 'Walking home';
  }

  return entity.isJuvenile ? 'Free time' : 'Idle';
}

/**
 * Structured, read-only projection for the selected-settler inspector: reads authoritative WorldState
 * and never writes simulation state. `transition` stays null until presentation history exists.
 */
export function getHumanActivityProjection(
  state: WorldState,
  entity: Entity,
  previousActivity?: string,
): HumanActivityProjection {
  const hour = getHourOfDay(state.tick);
  const schedule = getWorkSchedule(state);
  const workplace = entity.isJuvenile ? undefined : (findHumanWorkplace(entity, state.buildings)
    ?? getApprenticeTrainingSite(entity, new Map(state.entities.map((person) => [person.id, person])),
      new Map(state.buildings.map((building) => [building.id, building]))) ?? undefined);
  const homeBuilding = entity.residenceBuildingId == null
    ? null
    : state.buildings.find((building) => building.id === entity.residenceBuildingId) ?? null;
  const workReason = getSettlerWorkReason(state, entity);
  const school = getAssignedSchool(entity, state.buildings);
  const schoolSchedule = resolveSchoolSchedule(entity, school, homeBuilding ?? undefined, state.tick, hour);
  const activity = getHumanActivityStatus(state, entity, workReason, school, schoolSchedule);
  const shift = resolveShift(state, entity, workplace, hour);
  const target: HumanActivityTarget | null = (() => {
    // A hospital-bound or admitted settler is not walking a workplace leg, so claim no post target.
    if (workReason.code === 'going-to-hospital' || workReason.code === 'in-hospital') return null;
    if (school && (schoolSchedule.onShift || schoolSchedule.commuteDue)
      && ['Attending school', 'Waiting for teacher', 'Waiting for class', 'Walking to school', 'Away from school'].includes(activity)) {
      return { kind: 'school', label: labelFor(school), buildingId: school.id, ...buildingAccessPoint(school) };
    }
    const onWorkSchedule = !entity.isJuvenile && workplace != null && resolveShift(state, entity, workplace, hour).onShift;
    if (workplace && onWorkSchedule) {
      const point = buildingAccessPoint(workplace);
      return { kind: 'workplace', label: labelFor(workplace), buildingId: workplace.id, ...point };
    }
    const eveningOuting = !entity.isJuvenile && hour >= EVENING_START
      && hour < 23
      && !prefersHomeTonightFor(getWorkSchedule(state), entity.id, state.tick, hour)
      && !onWorkSchedule;
    if (eveningOuting) {
      return { kind: 'nearby-building', label: 'Evening outing', x: entity.x, y: entity.y };
    }
    if (entity.isJuvenile && entity.childLeisureTargetId != null
      && (activity.startsWith('Playing with ') || activity.startsWith('Following '))) {
      const companion = state.entities.find((candidate) =>
        candidate.id === entity.childLeisureTargetId && candidate.alive);
      if (companion) {
        const playSite = entity.childPlaySite;
        if (entity.childLeisureActivity === 'playing'
          && playSite?.day === getAbsoluteCalendarDay(state.tick)
          && playSite.phase === Math.floor(hour / 3)
          && playSite.mateId === companion.id) {
          return {
            kind: 'play-site',
            label: `Play area with ${childPlayCompanionLabel(state, entity, companion)}`,
            entityId: companion.id, x: playSite.x, y: playSite.y,
          };
        }
        return {
          kind: entity.childLeisureActivity === 'playing' ? 'playmate' : 'guardian',
          label: citizenGivenName(companion),
          entityId: companion.id,
          x: companion.x, y: companion.y,
        };
      }
    }
    if (!entity.isJuvenile && entity.huntTargetId != null) {
      const huntTarget = state.entities.find((candidate) => candidate.id === entity.huntTargetId && candidate.alive);
      if (huntTarget) {
        return { kind: 'hunt', label: huntTarget.name || huntTarget.type, entityId: huntTarget.id, x: huntTarget.x, y: huntTarget.y };
      }
    }
    if (!entity.isJuvenile && entity.combatTicks != null && entity.combatTicks > 0) {
      return { kind: 'combat', label: 'Combat', x: entity.x, y: entity.y };
    }
    if (activity === 'Walking home' && homeBuilding) {
      const point = buildingAccessPoint(homeBuilding);
      return { kind: 'home', label: labelFor(homeBuilding), buildingId: homeBuilding.id, ...point };
    }
    return null;
  })();

  let blockedReason: string | null = null;
  const assignedWorkplace = entity.workerBuildingId == null
    ? null
    : state.buildings.find((building) => building.id === entity.workerBuildingId) ?? null;
  const isAssignedConstruction = Boolean(workplace && !workplace.completed && workplace.occupants.includes(entity.id));
  if (entity.residenceBuildingId != null && !homeBuilding) blockedReason = 'Assigned home is unavailable';
  else if (entity.workerBuildingId != null && !assignedWorkplace && !isAssignedConstruction) blockedReason = 'Assigned workplace is unavailable';
  else if (workplace && !workplace.completed && !isAssignedConstruction) blockedReason = 'Construction site is unavailable';

  return {
    activity,
    schedule: isSchoolAge(entity) ? {
      label: 'School — weekdays 09:00–15:00',
      startHour: SCHOOL_START_HOUR,
      endHour: SCHOOL_END_HOUR,
      onShift: isSchoolTime(state.tick, hour),
    } : {
      label: entity.isJuvenile ? 'Child — no work schedule'
        : shift.next.kind === 'venue' ? 'Individual venue shift' : getWorkScheduleLabel(schedule),
      startHour: shift.next.kind === 'venue' ? shift.next.hour : schedule.startHour,
      endHour: shift.next.endHour ?? schedule.endHour,
      onShift: !entity.isJuvenile && shift.onShift,
    },
    home: homeBuilding ? { id: homeBuilding.id, label: labelFor(homeBuilding) } : null,
    workplace: workplace ? { id: workplace.id, label: labelFor(workplace) } : null,
    target,
    blockedReason,
    workReason,
    transition: previousActivity && previousActivity !== activity
      ? { from: previousActivity, to: activity, observedAtTick: state.tick }
      : null,
    observedAtTick: state.tick,
  };
}
/**
 * Read-only per-human activity label shown in the selected-entity inspector.
 *
 * Uses the building the human is standing near (its config label) so the
 * status always reads naturally: "Working at Farm", "Relaxing at Tavern",
 * "At Market", "Hunting", etc.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { getHourOfDay } from './dayCycleClock';
import { EVENING_START, prefersHomeTonight } from './dayCycle';
import { isFestivalGatherer } from './humanSchedule';
import { getWorkSchedule, getWorkScheduleLabel, isOnWorkScheduleShift } from './workSchedule';
import { findHumanWorkplace } from './workforce';
import { humanBuildingTarget } from './simulation/humanMovement';
import { BUILDING_CONFIGS } from './gameTypes';
import { WORK_ARRIVE_DISTANCE, getSettlerWorkReason, type SettlerWorkReason } from './workAbsence';

function labelFor(building: Building): string {
  return BUILDING_CONFIGS[building.type]?.label ?? 'Building';
}

export type HumanActivityTarget = {
  kind: 'workplace' | 'home' | 'nearby-building' | 'hunt' | 'combat';
  label: string;
  buildingId?: number;
  entityId?: number;
  x: number;
  y: number;
};

export type HumanActivityTransition = {
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
 * test, shared with {@link getHumanActivityStatus} (which reports `Working at X` rather than
 * `Commuting to X` on the same distance). The movement explanation uses it so a settler parked at a
 * stop is never described as being on a leg into it.
 */
export function isAtActivityTarget(entity: Entity, target: HumanActivityTarget | null): boolean {
  if (!target) return false;
  return Math.hypot(target.x - entity.x, target.y - entity.y) <= WORK_ARRIVE_DISTANCE;
}

export function getHumanActivityStatus(state: WorldState, entity: Entity): string {
  if (!entity.alive) return 'Dead';

  const hourOfDay = getHourOfDay(state.tick);
  const festivalActive = state.festival?.active;
  const workplace = findHumanWorkplace(entity, state.buildings);
  const onWorkSchedule = !entity.isJuvenile && workplace != null && isOnWorkScheduleShift(state, hourOfDay);
  // The verdict is the simulation owner's, so the label cannot drift from what the settler does.
  if (isFestivalGatherer(hourOfDay, festivalActive, onWorkSchedule, entity.job === JobType.Innkeeper)) {
    return 'Gathering at festival';
  }

  if (!entity.isJuvenile && entity.combatTicks != null && entity.combatTicks > 0) return 'In combat';
  if (!entity.isJuvenile && entity.huntTargetId != null) return 'Hunting';

  // Assigned workplace during the configured work shift.
  if (workplace && onWorkSchedule) {
    const target = humanBuildingTarget(workplace, entity.id, false);
    const dist = Math.hypot(target.x - entity.x, target.y - entity.y);
    const label = labelFor(workplace);
    return dist <= WORK_ARRIVE_DISTANCE ? `Working at ${label}` : `Commuting to ${label}`;
  }

  // Evening social outings are an intentional free-time state, not a failed
  // home return. Surface it before nearby-building inference so the inspector
  // explains why a resident is away from home.
  const isEveningOuting = hourOfDay >= EVENING_START
    && hourOfDay < 23
    && !prefersHomeTonight(entity.id, state.tick, hourOfDay)
    && !onWorkSchedule;
  if (isEveningOuting) return 'Socialising — evening outing';

  // Home is a real residence assignment, not proximity to a random building.
  if (entity.residenceBuildingId != null) {
    const residence = state.buildings.find((b) => b.id === entity.residenceBuildingId && b.completed);
    if (residence) {
      const point = humanBuildingTarget(residence, entity.id, true);
      if (Math.hypot(point.x - entity.x, point.y - entity.y) <= WORK_ARRIVE_DISTANCE) {
        return `At home (${labelFor(residence)})`;
      }
    }
  }

  // Not near any building but has a home → likely walking home (or away).
  if (entity.residenceBuildingId != null) {
    const home = state.buildings.find((b) => b.id === entity.residenceBuildingId);
    if (home) {
      const target = humanBuildingTarget(home, entity.id, true);
      const dist = Math.hypot(target.x - entity.x, target.y - entity.y);
      if (dist > WORK_ARRIVE_DISTANCE) return 'Walking home';
    }
  }

  return entity.isJuvenile ? 'Free time' : 'Idle';
}

/**
 * Structured, read-only projection for the selected-settler inspector.
 * This function reads authoritative WorldState and never writes simulation state.
 * Historical transitions remain null until a dedicated presentation history is added.
 */
export function getHumanActivityProjection(
  state: WorldState,
  entity: Entity,
  previousActivity?: string,
): HumanActivityProjection {
  const hour = getHourOfDay(state.tick);
  const schedule = getWorkSchedule(state);
  const workplace = entity.isJuvenile ? undefined : findHumanWorkplace(entity, state.buildings);
  const homeBuilding = entity.residenceBuildingId == null
    ? null
    : state.buildings.find((building) => building.id === entity.residenceBuildingId) ?? null;
  const activity = getHumanActivityStatus(state, entity);
  const target: HumanActivityTarget | null = (() => {
    if (!entity.isJuvenile && workplace && isOnWorkScheduleShift(state, hour)) {
      const point = humanBuildingTarget(workplace, entity.id, false);
      return { kind: 'workplace', label: labelFor(workplace), buildingId: workplace.id, ...point };
    }
    const eveningOuting = hour >= EVENING_START
      && hour < 23
      && !prefersHomeTonight(entity.id, state.tick, hour)
      && !(workplace && isOnWorkScheduleShift(state, hour));
    if (eveningOuting) {
      return { kind: 'nearby-building', label: 'Evening outing', x: entity.x, y: entity.y };
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
      const point = humanBuildingTarget(homeBuilding, entity.id, true);
      return { kind: 'home', label: labelFor(homeBuilding), buildingId: homeBuilding.id, ...point };
    }
    return null;
  })();

  let blockedReason: string | null = null;
  const assignedWorkplace = entity.homeBuildingId == null
    ? null
    : state.buildings.find((building) => building.id === entity.homeBuildingId) ?? null;
  const isAssignedConstruction = Boolean(workplace && !workplace.completed && workplace.occupants.includes(entity.id));
  if (entity.residenceBuildingId != null && !homeBuilding) blockedReason = 'Assigned home is unavailable';
  else if (entity.homeBuildingId != null && !assignedWorkplace && !isAssignedConstruction) blockedReason = 'Assigned workplace is unavailable';
  else if (workplace && !workplace.completed && !isAssignedConstruction) blockedReason = 'Construction site is unavailable';

  return {
    activity,
    schedule: {
      label: entity.isJuvenile ? 'Child — no work schedule' : getWorkScheduleLabel(schedule),
      startHour: schedule.startHour,
      endHour: schedule.endHour,
      onShift: !entity.isJuvenile && isOnWorkScheduleShift(state, hour),
    },
    home: homeBuilding ? { id: homeBuilding.id, label: labelFor(homeBuilding) } : null,
    workplace: workplace ? { id: workplace.id, label: labelFor(workplace) } : null,
    target,
    blockedReason,
    workReason: getSettlerWorkReason(state, entity),
    transition: previousActivity && previousActivity !== activity
      ? { from: previousActivity, to: activity, observedAtTick: state.tick }
      : null,
    observedAtTick: state.tick,
  };
}
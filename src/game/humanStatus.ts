/**
 * Read-only per-human activity label shown in the selected-entity inspector.
 *
 * Uses the building the human is standing near (its config label) so the
 * status always reads naturally: "Working at Farm", "Relaxing at Tavern",
 * "At Market", "Hunting", etc.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { getHourOfDay } from './dayCycleClock';
import { isFestivalGatheringHour } from './dayCycle';
import { getWorkSchedule, getWorkScheduleLabel, isOnWorkScheduleShift } from './workSchedule';
import { findHumanWorkplace } from './workforce';
import { humanBuildingTarget } from './simulation/humanMovement';
import { BUILDING_CONFIGS } from './gameTypes';

/** Distance under which a worker counts as "at" their target stand. */
const WORK_ARRIVE_DISTANCE = 24;
/** Distance under which a human is considered "at" a nearby building. */
const NEAR_BUILDING_DISTANCE = 48;

function nearestBuilding(state: WorldState, entity: Entity): Building | null {
  let best: Building | null = null;
  let bestDist = NEAR_BUILDING_DISTANCE;
  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const d = Math.hypot(entity.x - cx, entity.y - cy);
    if (d <= bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

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
  transition: HumanActivityTransition | null;
  observedAtTick: number;
};

export function getHumanActivityStatus(state: WorldState, entity: Entity): string {
  if (!entity.alive) return 'Dead';

  const hourOfDay = getHourOfDay(state.tick);
  const festivalActive = state.festival?.active;
  if (isFestivalGatheringHour(hourOfDay, festivalActive) && entity.job !== JobType.Innkeeper) {
    return 'Gathering at festival';
  }

  // Assigned workplace during the configured work shift.
  const workplace = findHumanWorkplace(entity, state.buildings);
  if (workplace && isOnWorkScheduleShift(state, hourOfDay)) {
    const target = humanBuildingTarget(workplace, entity.id, false);
    const dist = Math.hypot(target.x - entity.x, target.y - entity.y);
    const label = labelFor(workplace);
    return dist <= WORK_ARRIVE_DISTANCE ? `Working at ${label}` : `Commuting to ${label}`;
  }

  // Otherwise: use the building the human is standing near.
  const near = nearestBuilding(state, entity);
  if (near) {
    const label = labelFor(near);
    if (near.id === entity.residenceBuildingId) return `At home (${label})`;
    if (near.type === BuildingType.Tavern || near.type === BuildingType.Hotel) return `Relaxing at ${label}`;
    if (near.type === BuildingType.HuntingSpot) return 'Hunting';
    return `At ${label}`;
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

  return 'Idle';
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
  const workplace = findHumanWorkplace(entity, state.buildings);
  const homeBuilding = entity.residenceBuildingId == null
    ? null
    : state.buildings.find((building) => building.id === entity.residenceBuildingId) ?? null;
  const activity = getHumanActivityStatus(state, entity);
  const near = nearestBuilding(state, entity);
  const target: HumanActivityTarget | null = (() => {
    if (workplace && isOnWorkScheduleShift(state, hour)) {
      const point = humanBuildingTarget(workplace, entity.id, false);
      return { kind: 'workplace', label: labelFor(workplace), buildingId: workplace.id, ...point };
    }
    if (entity.huntTargetId != null) {
      const huntTarget = state.entities.find((candidate) => candidate.id === entity.huntTargetId && candidate.alive);
      if (huntTarget) {
        return { kind: 'hunt', label: huntTarget.name || huntTarget.type, entityId: huntTarget.id, x: huntTarget.x, y: huntTarget.y };
      }
    }
    if (entity.combatTicks != null && entity.combatTicks > 0) {
      return { kind: 'combat', label: 'Combat', x: entity.x, y: entity.y };
    }
    if (activity === 'Walking home' && homeBuilding) {
      const point = humanBuildingTarget(homeBuilding, entity.id, true);
      return { kind: 'home', label: labelFor(homeBuilding), buildingId: homeBuilding.id, ...point };
    }
    if (near) {
      return {
        kind: near.id === entity.residenceBuildingId ? 'home' : 'nearby-building',
        label: labelFor(near),
        buildingId: near.id,
        x: near.x + near.width / 2,
        y: near.y + near.height / 2,
      };
    }
    return null;
  })();

  let blockedReason: string | null = null;
  if (entity.residenceBuildingId != null && !homeBuilding) blockedReason = 'Assigned home is unavailable';
  else if (entity.homeBuildingId != null && !workplace) blockedReason = 'Assigned workplace is unavailable';
  else if (workplace && !workplace.completed) blockedReason = 'Workplace is not complete';

  return {
    activity,
    schedule: {
      label: getWorkScheduleLabel(schedule),
      startHour: schedule.startHour,
      endHour: schedule.endHour,
      onShift: isOnWorkScheduleShift(state, hour),
    },
    home: homeBuilding ? { id: homeBuilding.id, label: labelFor(homeBuilding) } : null,
    workplace: workplace ? { id: workplace.id, label: labelFor(workplace) } : null,
    target,
    blockedReason,
    transition: previousActivity && previousActivity !== activity
      ? { from: previousActivity, to: activity, observedAtTick: state.tick }
      : null,
    observedAtTick: state.tick,
  };
}

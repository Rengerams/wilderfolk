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
import { isOnWorkScheduleShift } from './workSchedule';
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

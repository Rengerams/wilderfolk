/**
 * Read-only per-human activity label shown in the selected-entity inspector.
 */
import type { Entity, WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { getHourOfDay } from './dayCycleClock';
import { isFestivalGatheringHour } from './dayCycle';
import { isOnWorkScheduleShift } from './workSchedule';
import { findHumanWorkplace } from './workforce';
import { humanBuildingTarget } from './simulation/humanMovement';
import { BUILDING_CONFIGS } from './gameTypes';

/** Distance under which a worker counts as "at" their target stand. */
const WORK_ARRIVE_DISTANCE = 24;

export function getHumanActivityStatus(state: WorldState, entity: Entity): string {
  if (!entity.alive) return 'Dead';

  const hourOfDay = getHourOfDay(state.tick);
  const festivalActive = state.festival?.active;
  if (isFestivalGatheringHour(hourOfDay, festivalActive) && entity.job !== JobType.Innkeeper) {
    return 'Gathering at festival';
  }

  const workplace = findHumanWorkplace(entity, state.buildings);
  if (workplace && isOnWorkScheduleShift(state, hourOfDay)) {
    const target = humanBuildingTarget(workplace, entity.id, false);
    const dist = Math.hypot(target.x - entity.x, target.y - entity.y);
    const label = BUILDING_CONFIGS[workplace.type]?.label ?? 'Workplace';
    return dist <= WORK_ARRIVE_DISTANCE ? `Working at ${label}` : `Commuting to ${label}`;
  }

  if (entity.residenceBuildingId != null) {
    const home = state.buildings.find((b) => b.id === entity.residenceBuildingId);
    if (home) {
      const target = humanBuildingTarget(home, entity.id, true);
      const dist = Math.hypot(target.x - entity.x, target.y - entity.y);
      if (dist <= WORK_ARRIVE_DISTANCE) return 'At home';
    }
  }

  return 'Idle';
}

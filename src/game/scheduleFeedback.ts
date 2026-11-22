import type { Building, BuildingType, WorldState } from './gameTypes';
import { BuildingType as BT, BUILDING_CONFIGS, BUILDING_JOB_TYPES } from './gameTypes';
import type { WorkSchedule } from './workSchedule';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { isPlayerHuman } from './playerHuman';
import { isImprisoned } from './housingModel';
import { buildConstructionCrewIndex } from './workforceSummary';

export interface ScheduleImpactPreview {
  affectedWorkplaces: number;
  assignedWorkers: number;
  expectedHours: number;
  durationDelta: number;
  warning: string;
}

type ScheduleKind = 'ordinary' | 'tavern' | 'hotel';

const FIXED_SCHEDULE_TYPES = new Set<BuildingType>([
  BT.Church,
  BT.TownHall,
  BT.School,
  BT.Tavern,
  BT.Hotel,
]);

// Reuse the same job/capacity gates as the staffing owner. Derive once, not on each UI render.
const ORDINARY_WORKPLACE_TYPES = new Set<BuildingType>(
  (Object.values(BT) as BuildingType[]).filter(
    (type) =>
      BUILDING_JOB_TYPES[type] != null &&
      BUILDING_CONFIGS[type].maxOccupants > 0 &&
      !FIXED_SCHEDULE_TYPES.has(type),
  ),
);

/**
 * Read-only schedule impact. Actual job assignments come from workerBuildingId,
 * not building.occupants (which can contain stale ids). Construction uses the
 * existing crew index, without double-counting a settler with a regular job.
 *
 * This reports assigned staff, not witnessed attendance or predicted production.
 */
export function getScheduleImpactPreview(
  state: Pick<WorldState, 'buildings' | 'entities'>,
  kind: ScheduleKind,
  current: WorkSchedule,
  next: WorkSchedule,
): ScheduleImpactPreview {
  const workplaceIds = new Set<number>();
  const constructionSites: Building[] = [];
  let affectedWorkplaces = 0;

  for (const building of state.buildings) {
    if (kind === 'ordinary') {
      // Ordinary hours also govern construction, including unstaffed/passive sites.
      if (!building.completed && building.constructionProgress < 100) {
        constructionSites.push(building);
        affectedWorkplaces++;
      } else if (building.completed && ORDINARY_WORKPLACE_TYPES.has(building.type)) {
        workplaceIds.add(building.id);
        affectedWorkplaces++;
      }
    } else if (
      building.completed &&
      building.type === (kind === 'tavern' ? BT.Tavern : BT.Hotel)
    ) {
      workplaceIds.add(building.id);
      affectedWorkplaces++;
    }
  }

  // Construction crews have no workerBuildingId. Use the existing read-only index.
  const constructionCrews = constructionSites.length > 0
    ? buildConstructionCrewIndex(constructionSites)
    : undefined;
  let assignedWorkers = 0;

  // One indexed entity pass, independent of the number of building occupants.
  for (const entity of state.entities) {
    if (!entity.alive || !isPlayerHuman(entity) ||
      entity.age < HUMAN_ADULT_MIN_AGE || isImprisoned(entity)) continue;

    if (entity.workerBuildingId != null && workplaceIds.has(entity.workerBuildingId)) {
      assignedWorkers++;
    } else if (
      kind === 'ordinary' &&
      entity.workerBuildingId == null &&
      constructionCrews?.has(entity.id)
    ) {
      assignedWorkers++;
    }
  }

  const currentHours = current.endHour - current.startHour;
  const nextHours = next.endHour - next.startHour;
  const durationDelta = nextHours - currentHours;
  const unchanged = current.startHour === next.startHour && current.endHour === next.endHour;

  const warning = unchanged
    ? 'No workload change; the current schedule remains in effect.'
    : durationDelta === 0
      ? 'Shift times change, but total scheduled hours remain the same.'
      : kind !== 'ordinary'
        ? durationDelta > 0
          ? `${durationDelta} extra service hour${durationDelta === 1 ? '' : 's'} may require additional staffing.`
          : `${Math.abs(durationDelta)} fewer service hour${durationDelta === -1 ? '' : 's'} reduces opening time.`
        : durationDelta > 0
          ? `${durationDelta} extra hour${durationDelta === 1 ? '' : 's'} may increase next-day fatigue and reduce staffed output.`
          : `${Math.abs(durationDelta)} fewer hour${durationDelta === -1 ? '' : 's'} lowers scheduled production time but supports recovery.`;

  return { affectedWorkplaces, assignedWorkers, expectedHours: nextHours, durationDelta, warning };
}

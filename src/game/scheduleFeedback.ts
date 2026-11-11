import type { BuildingType, Entity } from './gameTypes';
import type { WorldState } from './gameTypes';
import { BuildingType as BuildingTypeValues, BUILDING_JOB_TYPES, EntityType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';

export interface ScheduleImpactPreview {
  affectedWorkplaces: number;
  assignedWorkers: number;
  expectedHours: number;
  durationDelta: number;
  warning: string;
}

function staffedBuildingTypes(kind: 'ordinary' | 'tavern' | 'hotel'): BuildingType[] {
  if (kind === 'tavern') return [BuildingTypeValues.Tavern];
  if (kind === 'hotel') return [BuildingTypeValues.Hotel];
  const fixedTypes = new Set<BuildingType>([
    BuildingTypeValues.Church,
    BuildingTypeValues.TownHall,
    BuildingTypeValues.School,
    BuildingTypeValues.Tavern,
    BuildingTypeValues.Hotel,
  ]);
  // The ordinary window covers real workplaces only: a building with no job is never staffed, so
  // counting it would report its residents as affected workers.
  return (Object.values(BuildingTypeValues) as BuildingType[]).filter(
    (type) => BUILDING_JOB_TYPES[type] != null && !fixedTypes.has(type),
  );
}

/**
 * A workplace lists its workers in `occupants`; an id counts while the record behind it is alive
 * and belongs to the player's colony, per `playerHuman.isPlayerHuman`.
 */
function isAssignedWorker(entity: Entity): boolean {
  return entity.alive && isPlayerHuman(entity.type == null ? { ...entity, type: EntityType.Human } : entity);
}

export function getScheduleImpactPreview(
  state: Pick<WorldState, 'buildings' | 'entities'>,
  kind: 'ordinary' | 'tavern' | 'hotel',
  currentHours: number,
  nextHours: number,
): ScheduleImpactPreview {
  const types = new Set(staffedBuildingTypes(kind));
  const buildings = state.buildings.filter((building) => building.completed && types.has(building.type));
  const eligibleWorkerIds = new Set(state.entities.filter(isAssignedWorker).map((entity) => entity.id));
  const assignedWorkers = buildings.reduce((sum, building) => sum + building.occupants.filter((id) => eligibleWorkerIds.has(id)).length, 0);
  const durationDelta = nextHours - currentHours;
  const warning = durationDelta > 0
    ? `${durationDelta} extra hour${durationDelta === 1 ? '' : 's'} may increase next-day fatigue and reduce staffed output.`
    : durationDelta < 0
      ? `${Math.abs(durationDelta)} fewer hour${durationDelta === -1 ? '' : 's'} lowers same-day staffed time but supports recovery.`
      : 'No workload change; the current schedule remains in effect.';
  return { affectedWorkplaces: buildings.length, assignedWorkers, expectedHours: nextHours, durationDelta, warning };
}
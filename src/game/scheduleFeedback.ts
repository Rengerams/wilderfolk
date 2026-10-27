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
  // The ordinary window covers real workplaces only: a building with no job
  // (`BUILDING_JOB_TYPES` empty — residences, roads, walls, decor) is never
  // staffed, so counting it reported its residents as affected workers.
  return (Object.values(BuildingTypeValues) as BuildingType[]).filter(
    (type) => BUILDING_JOB_TYPES[type] != null && !fixedTypes.has(type),
  );
}

/**
 * A workplace lists its workers in `occupants`; an id counts while the record behind it is alive
 * and belongs to the player's colony.
 *
 * Colony membership is the owner's rule (`playerHuman.isPlayerHuman`, duplication finding A3) — the
 * faction classification is not re-derived here. A record that carries no `type` at all (the partial
 * entity records the schedule fixtures feed in) names no non-human form, so it is asked as a human:
 * a workplace's `occupants` list is itself the assignment record, and dropping such an id reported a
 * staffed workplace as unstaffed.
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
  const assignedWorkers = buildings.reduce((sum, building) => sum + building.occupants.filter((id) => state.entities.some((entity) => entity.id === id && isAssignedWorker(entity))).length, 0);
  const durationDelta = nextHours - currentHours;
  const warning = durationDelta > 0
    ? `${durationDelta} extra hour${durationDelta === 1 ? '' : 's'} may increase next-day fatigue and reduce staffed output.`
    : durationDelta < 0
      ? `${Math.abs(durationDelta)} fewer hour${durationDelta === -1 ? '' : 's'} lowers same-day staffed time but supports recovery.`
      : 'No workload change; the current schedule remains in effect.';
  return { affectedWorkplaces: buildings.length, assignedWorkers, expectedHours: nextHours, durationDelta, warning };
}
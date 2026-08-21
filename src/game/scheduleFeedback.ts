import type { BuildingType } from './gameTypes';
import type { WorldState } from './gameTypes';
import { BuildingType as BuildingTypeValues } from './gameTypes';

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
  return (Object.values(BuildingTypeValues) as BuildingType[]).filter((type) => !fixedTypes.has(type));
}

export function getScheduleImpactPreview(
  state: Pick<WorldState, 'buildings' | 'entities'>,
  kind: 'ordinary' | 'tavern' | 'hotel',
  currentHours: number,
  nextHours: number,
): ScheduleImpactPreview {
  const types = new Set(staffedBuildingTypes(kind));
  const buildings = state.buildings.filter((building) => building.completed && types.has(building.type));
  const assignedWorkers = buildings.reduce((sum, building) => sum + building.occupants.filter((id) => state.entities.some((entity) => entity.id === id && entity.alive && !entity.faction)).length, 0);
  const durationDelta = nextHours - currentHours;
  const warning = durationDelta > 0
    ? `${durationDelta} extra hour${durationDelta === 1 ? '' : 's'} may increase next-day fatigue and reduce staffed output.`
    : durationDelta < 0
      ? `${Math.abs(durationDelta)} fewer hour${durationDelta === -1 ? '' : 's'} lowers same-day staffed time but supports recovery.`
      : 'No workload change; the current schedule remains in effect.';
  return { affectedWorkplaces: buildings.length, assignedWorkers, expectedHours: nextHours, durationDelta, warning };
}

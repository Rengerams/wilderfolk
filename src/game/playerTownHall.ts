import type { Building } from './gameTypes';
import { BuildingType } from './gameTypes';

/** The one completed player-owned Town Hall, if built. */
export function findPlayerTownHall(buildings: Building[]): Building | undefined {
  return buildings.find(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival',
  );
}

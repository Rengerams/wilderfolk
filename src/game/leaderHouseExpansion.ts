import { BuildingType } from './gameTypes';
import type { Building } from './gameTypes';
import { BUILDING_CONFIGS } from './buildings';

/** Main manor is the oldest player-owned LeaderHouse; the second is its sole annex. */
export function leaderHouseBuildings(buildings: readonly Building[]): Building[] {
  return buildings.filter((building) => building.type === BuildingType.LeaderHouse && building.faction !== 'rival')
    .sort((a, b) => a.id - b.id);
}

/** An annex is available only when a completed main manor already houses over 20 settlers. */
export function canBuildLeaderHouse(buildings: readonly Building[]): boolean {
  const houses = leaderHouseBuildings(buildings);
  if (houses.length === 0) return true;
  return houses.length === 1 && houses[0].completed
    && houses[0].occupants.length > BUILDING_CONFIGS[BuildingType.LeaderHouse].maxOccupants;
}

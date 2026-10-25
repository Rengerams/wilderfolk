import { BuildingType } from './gameTypes';
import type { Building } from './gameTypes';
import { BUILDING_CONFIGS } from './buildings';

/** The lowest-id player manor is the original; no later annex can replace it. */
export function leaderHouseBuildings(buildings: readonly Building[]): Building[] {
  const houses = buildings.filter((building) => building.type === BuildingType.LeaderHouse
    && building.faction !== 'rival').sort((a, b) => a.id - b.id);
  const main = houses[0];
  if (!main) return [];
  const annexId = `leader-house:${main.id}`;
  return [main, ...houses.filter((building) => building.id !== main.id && building.groupId === annexId)];
}

/** Only one explicitly linked annex is possible; it unlocks above 20 occupied beds. */
export function canBuildLeaderHouse(buildings: readonly Building[]): boolean {
  const houses = buildings.filter((building) => building.type === BuildingType.LeaderHouse
    && building.faction !== 'rival');
  if (houses.length === 0) return true;
  const [main] = leaderHouseBuildings(buildings);
  return houses.length === 1 && main.completed
    && main.occupants.length > BUILDING_CONFIGS[BuildingType.LeaderHouse].maxOccupants;
}

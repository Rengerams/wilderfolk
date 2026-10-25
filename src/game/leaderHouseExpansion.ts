import { BuildingType } from './gameTypes';
import type { Building } from './gameTypes';
import { BUILDING_CONFIGS } from './buildings';

/** The lowest-id player manor is the original; no later annex can replace it. */
export function leaderHouseBuildings(buildings: readonly Building[]): Building[] {
  const houses = buildings.filter((building) => building.type === BuildingType.LeaderHouse
    && building.faction !== 'rival').sort((a, b) => a.id - b.id);
  const main = houses.find((house) => !house.groupId?.startsWith('leader-house:'));
  if (!main) return [];
  const annexId = `leader-house:${main.id}`;
  const annexes = houses.filter((building) => building.id !== main.id && building.groupId === annexId);
  // A rebuilt main inherits any orphaned annex, retaining its residents under the manor's lifecycle.
  const orphans = houses.filter((building) => building.groupId?.startsWith('leader-house:')
    && !houses.some((candidate) => candidate.id === Number(building.groupId!.slice('leader-house:'.length))));
  return [main, ...annexes, ...orphans.filter((annex) => !annexes.includes(annex))];
}

/** Only one explicitly linked annex is possible; it unlocks above 20 occupied beds. */
export function canBuildLeaderHouse(buildings: readonly Building[]): boolean {
  const houses = buildings.filter((building) => building.type === BuildingType.LeaderHouse
    && building.faction !== 'rival');
  if (houses.length === 0) return true;
  // An orphaned annex cannot act as the main manor; permit a replacement main.
  if (!houses.some((house) => !house.groupId?.startsWith('leader-house:'))) return true;
  const [main] = leaderHouseBuildings(buildings);
  return leaderHouseBuildings(buildings).length === 1 && !!main?.completed
    && main.occupants.length > BUILDING_CONFIGS[BuildingType.LeaderHouse].maxOccupants;
}

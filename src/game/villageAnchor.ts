/**
 * The village anchor — one rule, two readers: the simulation's camp centre and the renderer's raid
 * march lines. Leaf on purpose: the only imports are types.
 */
import type { Building, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';

/** A point in world coordinates. */
export interface VillageAnchor {
  x: number;
  y: number;
}

/**
 * The building half of the anchor: the first completed player Town Hall, else the first completed
 * player House, else `null` — rival and unfinished structures never anchor the village.
 */
export function getPlayerCampCenterFromBuildings(buildings: readonly Building[]): VillageAnchor | null {
  let house: Building | undefined;
  for (const building of buildings) {
    if (!building.completed || building.faction === 'rival') continue;
    if (building.type === BuildingType.TownHall) {
      return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
    }
    if (house === undefined && building.type === BuildingType.House) house = building;
  }
  if (house) return { x: house.x + house.width / 2, y: house.y + house.height / 2 };
  return null;
}

/**
 * The entity half: the mean position of the living player settlers, else the map centre. Never
 * cached — the human loop moves these positions itself.
 */
export function getPlayerSettlerCenter(
  state: Pick<WorldState, 'entities' | 'width' | 'height'>,
): VillageAnchor {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const entity of state.entities) {
    if (!entity.alive || !isPlayerHuman(entity)) continue;
    sumX += entity.x;
    sumY += entity.y;
    count++;
  }
  if (count > 0) return { x: sumX / count, y: sumY / count };
  return { x: state.width / 2, y: state.height / 2 };
}

/**
 * The complete anchor: Town Hall, else House, else the living settlers' mean, else the map centre.
 * `buildings` is passed because the human tick and the renderer each hold their own list.
 */
export function getPlayerCampCenter(
  state: Pick<WorldState, 'entities' | 'width' | 'height'>,
  buildings: readonly Building[],
): VillageAnchor {
  return getPlayerCampCenterFromBuildings(buildings) ?? getPlayerSettlerCenter(state);
}

/**
 * The village anchor — one rule, two readers.
 *
 * The simulation steers war-bands, barracks guards and visitor proximity by `getPlayerCampCenter`,
 * and the renderer draws the raid march lines out of the same point. Those two readers used to hold
 * separate copies of the rule, and the copies disagreed: the renderer's version, finding no completed
 * player Town Hall and no House, returned the *first completed player building*, while the simulation
 * fell through to the living settlers' mean. On a colony whose only finished structure was, say, a
 * Barracks, the drawn march line and the simulated raid therefore ended in two different places.
 *
 * The split into `…FromBuildings` (a pure function of the building list) and
 * `getPlayerSettlerCenter` (which reads positions the human loop moves) is deliberate, not
 * incidental: `tickHumans` caches the building half for a whole tick and re-asks the entity half at
 * every call site (N-4). This module keeps that split at the leaf so neither reader has to restate
 * it.
 *
 * Leaf on purpose: the only imports are types, so a renderer may depend on it without pulling in a
 * simulation domain module.
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
 * player House, else `null`.
 *
 * Rival faction structures and unfinished ones never anchor the village. `null` does not mean "no
 * anchor" — it means "the buildings cannot answer, ask the settlers".
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
 * The entity half: the mean position of the living player settlers, else the map centre.
 *
 * Reads live settler positions, which the human loop itself moves and can empty by killing one, so
 * it must never be cached across iterations of that loop (N-4).
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
 *
 * `buildings` is passed rather than read off `state` because `tickHumans` holds the tick's own
 * building list and the renderer holds a snapshot's.
 */
export function getPlayerCampCenter(
  state: Pick<WorldState, 'entities' | 'width' | 'height'>,
  buildings: readonly Building[],
): VillageAnchor {
  return getPlayerCampCenterFromBuildings(buildings) ?? getPlayerSettlerCenter(state);
}

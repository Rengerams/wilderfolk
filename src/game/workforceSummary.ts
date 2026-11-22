/**
 * Sole read-only owner of construction-crew membership and assigned/idle adult counts.
 * Assignment transitions remain in workforce.ts; this module never writes simulation state.
 */
import type { Building, Entity } from './gameTypes';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { hasWorkAssignment, isImprisoned } from './housingModel';
import { isPlayerHuman } from './playerHuman';

/** One indexed snapshot of each settler's unfinished *player* construction site. */
export function buildConstructionCrewIndex(buildings: readonly Building[]): Map<number, Building> {
  const map = new Map<number, Building>();
  for (const building of buildings) {
    if (building.completed || building.occupants.length === 0) continue;
    for (const id of building.occupants) {
      if (!map.has(id)) map.set(id, building);
    }
  }
  return map;
}

/** Assigned labour, not live on-shift attendance. Prisoners and minors are neither working nor idle. */
export function countWorkingAndIdleSettlers(
  humans: readonly Entity[],
  buildings: readonly Building[],
): { working: number; idle: number } {
  const constructionCrews = buildConstructionCrewIndex(buildings);
  let working = 0;
  let idle = 0;
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human) || human.age < HUMAN_ADULT_MIN_AGE || isImprisoned(human)) continue;
    if (hasWorkAssignment(human) || constructionCrews.has(human.id)) working++;
    else idle++;
  }
  return { working, idle };
}

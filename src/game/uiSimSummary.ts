/**
 * Village simulation summary & demographics: fast aggregation of population, employment and
 * housing capacity for the top-bar HUD and overview panels.
 */

import type { EntityCatalog } from './entityCatalog';
import type { WorldState, Entity } from './gameTypes';
import { isImprisoned } from './housingModel';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { countWorkingAndIdleSettlers } from './workforceSummary';
import { getEffectiveBedCapacity, getOpenPlayerBeds, getTotalBeds } from './populationGrowth';
import { isPlayerHuman } from './playerHuman';

export interface VillageStatsSummary {
  total: number;
  adults: number;
  children: number;
  working: number;
  idle: number;
  imprisoned: number;
  /**
   * Adults who can hold a work post (`adults − imprisoned`). `working` and `idle` partition this
   * pool, so it is the denominator for the "working / workforce" ratio.
   */
  workforce: number;
  beds: number;
  /** Beds actually usable, excluding unoccupied reserved Leader's House beds. */
  effectiveBeds: number;
  /**
   * Beds a settler may actually be assigned (`getOpenPlayerBeds`), not `beds − total`: the Leader's
   * House beds are reserved for the leader's household.
   */
  openBeds: number;
}

/**
 * Computes the colony's demographic and labour summary, using the catalog when provided.
 * HUD, People screen and dashboard all read this projection; workforceSummary owns labour counts.
 */
export function computeVillageStats(
  world: WorldState,
  catalog?: EntityCatalog,
): VillageStatsSummary {
  const humans: readonly Entity[] = catalog
    ? catalog.getPlayerHumans()
    : world.entities;

  let total = 0;
  let adults = 0;
  let children = 0;
  let imprisoned = 0;
  const { working, idle } = countWorkingAndIdleSettlers(humans, world.buildings);

  for (const e of humans) {
    if (!e.alive || !isPlayerHuman(e)) continue;

    total++;

    if (e.age < HUMAN_ADULT_MIN_AGE) {
      children++;
      continue;
    }

    adults++;

    if (isImprisoned(e)) imprisoned++;
  }

  const beds = getTotalBeds(world);

  return {
    total,
    adults,
    children,
    working,
    idle,
    imprisoned,
    workforce: working + idle,
    beds,
    effectiveBeds: getEffectiveBedCapacity(world),
    openBeds: getOpenPlayerBeds(world),
  };
}
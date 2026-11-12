/**
 * Village simulation summary & demographics: fast aggregation of population, employment and
 * housing capacity for the top-bar HUD and overview panels.
 */

import type { EntityCatalog } from './entityCatalog';
import type { WorldState, Entity } from './gameTypes';
import { hasWorkAssignment, isImprisoned } from './housingModel';
import { getOpenPlayerBeds, getTotalBeds } from './populationGrowth';
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
  /**
   * Beds a settler may actually be assigned (`getOpenPlayerBeds`), not `beds − total`: the Leader's
   * House beds are reserved for the leader's household.
   */
  openBeds: number;
}

/**
 * IDs of settlers stationed on an incomplete player building: a construction crew member has no
 * workplace assignment, so "working vs idle" callers must include this scan.
 */
export function getActiveConstructionWorkers(world: WorldState): Set<number> {
  const workers = new Set<number>();
  for (const b of world.buildings) {
    if (!b.completed && b.faction !== 'rival') {
      for (const id of b.occupants) {
        workers.add(id);
      }
    }
  }
  return workers;
}

/**
 * Computes the colony's demographic and labour summary, using the catalog when provided.
 * The single aggregation of the labour counters the HUD, People screen and dashboard all read.
 */
export function computeVillageStats(
  world: WorldState,
  catalog?: EntityCatalog,
): VillageStatsSummary {
  const constructionWorkers = getActiveConstructionWorkers(world);

  const humans: Iterable<Entity> = catalog
    ? catalog.getPlayerHumans()
    : world.entities;

  let total = 0;
  let adults = 0;
  let children = 0;
  let working = 0;
  let idle = 0;
  let imprisoned = 0;
  let workforce = 0;

  for (const e of humans) {
    if (!e.alive || !isPlayerHuman(e)) continue;

    total++;

    if (e.isJuvenile) {
      children++;
      continue;
    }

    adults++;

    if (isImprisoned(e)) {
      imprisoned++;
      continue;
    }

    workforce++;

    if (hasWorkAssignment(e) || constructionWorkers.has(e.id)) {
      working++;
    } else {
      idle++;
    }
  }

  const beds = getTotalBeds(world);

  return {
    total,
    adults,
    children,
    working,
    idle,
    imprisoned,
    workforce,
    beds,
    openBeds: getOpenPlayerBeds(world),
  };
}
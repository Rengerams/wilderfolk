/**
 * Village Simulation Summary & Demographics
 *
 * Fast aggregation of colony population, employment metrics,
 * and housing capacity for top-bar HUD and overview panels.
 */

import type { EntityCatalog } from './entityCatalog';
import type { WorldState, Entity } from './gameTypes';
import { hasWorkAssignment, isImprisoned } from './residencyOccupancy';
import { getOpenPlayerBeds, getTotalBeds } from './populationGrowth';
import { isPlayerHuman } from './playerHuman';

export interface VillageStatsSummary {
  total: number;
  adults: number;
  children: number;
  working: number;
  idle: number;
  imprisoned: number;
  beds: number;
  /**
   * Beds a settler may actually be assigned (`populationGrowth.getOpenPlayerBeds`), not
   * `beds − total`: the Leader's House beds are reserved for the leader's household, so counting them
   * made this figure read "housing available" while every settler was in fact unhoused
   */
  openBeds: number;
}

/**
 * IDs of the settlers stationed on an incomplete player building — a construction crew member has
 * no workplace assignment of their own, so every caller that classifies "working vs idle" must ask
 * this scan (the dashboard's per-settler `noWork` flag does; the counters use it below).
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
 * Computes demographic and labor summary for the colony.
 * Uses catalog if provided, falling back to direct state scan.
 *
 * This is the single aggregation of the village's labour counters: the top-bar HUD, the People
 * screen (`citizenOverview.computeCitizenOverview`) and the dashboard (`dashboardData`) all read
 * these numbers rather than re-deriving what "working" and "idle" mean.
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
    beds,
    openBeds: getOpenPlayerBeds(world),
  };
}
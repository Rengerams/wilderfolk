/**
 * Village Simulation Summary & Demographics
 *
 * Fast aggregation of colony population, employment metrics,
 * and housing capacity for top-bar HUD and overview panels.
 */

import type { EntityCatalog } from './entityCatalog';
import type { WorldState, Entity } from './gameTypes';
import { isImprisoned } from './residencyOccupancy';
import { hasWorkAssignment } from './residency';
import { getTotalBeds } from './populationGrowth';
import { isPlayerHuman } from './playerHuman';

export interface VillageStatsSummary {
  total: number;
  adults: number;
  children: number;
  working: number;
  idle: number;
  imprisoned: number;
  beds: number;
  openBeds: number;
}

/** Collects IDs of all active workers currently assigned to incomplete construction sites. */
function getActiveConstructionWorkers(world: WorldState): Set<number> {
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
    openBeds: Math.max(0, beds - total),
  };
}

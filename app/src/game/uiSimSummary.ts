import type { EntityCatalog } from './entityCatalog';
import type { WorldState } from './gameTypes';
import { hasWorkAssignment, isImprisoned } from './dayCycle';
import { getTotalBeds } from './populationGrowth';
import { isPlayerHuman } from './groupEvents';

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

/** Phase C — denormalized settler stats without scanning all entities. */
export function computeVillageStats(
  world: WorldState,
  catalog?: EntityCatalog,
): VillageStatsSummary {
  const constructionWorkers = new Set<number>();
  for (const b of world.buildings) {
    if (!b.completed) {
      for (const id of b.occupants) constructionWorkers.add(id);
    }
  }

  const humans = catalog
    ? catalog.getPlayerHumans()
    : world.entities.filter((e) => e.alive && isPlayerHuman(e));

  let total = 0;
  let adults = 0;
  let children = 0;
  let working = 0;
  let idle = 0;
  let imprisoned = 0;

  for (const e of humans) {
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
    if (hasWorkAssignment(e) || constructionWorkers.has(e.id)) working++;
    else idle++;
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
import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import {
  syncResidenceOccupants,
  assignMissingResidences,
  TICKS_PER_HOUR,
} from './dayCycle';
import { assignMissingWorkers } from './workforce';

/**
 * Assignment layer pulse interval (ticks).
 *
 * Housing + job fill — village logistics, not chat/courtship (those are Realtime).
 * Scales to fire ~4× per calendar day (18 ticks @ 3 ticks/hour with 72 ticks/day).
 */
export const LAYER_ASSIGN_INTERVAL = 6 * TICKS_PER_HOUR;

/**
 * Assignment layer — residence + workforce bookkeeping.
 *
 * Realtime interactions (chat, affairs, courtship) run in `tickHumans`.
 * Daily mortality and conception stay under `isNewCalendarDay` in `lifeSimulation`.
 *
 * Called when `world.tick % LAYER_ASSIGN_INTERVAL === 0`.
 */
export function tickLayerAssign(world: WorldState, ctx: TickContext): void {
  const { playerHumans, updatedBuildings, byType, newEntities } = ctx;

  const humanBucket = byType[EntityType.Human];
  const allHumans = humanBucket
    ? humanBucket.filter((e) => e.alive)
    : world.entities.filter((e) => e.alive && e.type === EntityType.Human);

  // Ensure newly arrived immigrants or newborn settlers from this tick are included
  if (newEntities && newEntities.length > 0) {
    const existingIds = new Set(allHumans.map((h) => h.id));
    for (let i = 0; i < newEntities.length; i++) {
      const e = newEntities[i];
      if (e.alive && e.type === EntityType.Human && !existingIds.has(e.id)) {
        allHumans.push(e);
      }
    }
  }

  syncResidenceOccupants(allHumans, updatedBuildings);
  assignMissingResidences(playerHumans, updatedBuildings, allHumans);
  assignMissingWorkers(playerHumans, updatedBuildings, world);
}

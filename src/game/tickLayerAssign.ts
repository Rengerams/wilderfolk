import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import {
  syncResidenceOccupants,
  assignMissingResidences,
  TICKS_PER_HOUR,
  TICKS_PER_DAY,
} from './dayCycle';
import { assignMissingWorkers } from './workforce';

/**
 * Assignment layer pulse interval (ticks).
 *
 * Housing + job fill — village logistics, not chat/courtship (those are Realtime).
 * Scales to fire ~4× per calendar day.
 */
export const LAYER_ASSIGN_INTERVAL = 6 * TICKS_PER_HOUR; // 18 @ 3 ticks/hour → 4×/day

/** How often housing/work bookkeeping fires per colony day. */
const ASSIGN_PULSES_PER_DAY = Math.floor(TICKS_PER_DAY / LAYER_ASSIGN_INTERVAL);

/**
 * Assignment layer — residence + workforce bookkeeping.
 *
 * Realtime interactions (chat, affairs, courtship) run in `tickHumans`.
 * Daily mortality and conception stay under `isNewCalendarDay` in `lifeSimulation`.
 *
 * Should be called when `world.tick % LAYER_ASSIGN_INTERVAL === 0`.
 */
export function tickLayerAssign(world: WorldState, ctx: TickContext): void {
  const { playerHumans, updatedBuildings, byType } = ctx;

  const humanBucket = byType[EntityType.Human];
  const allHumans = humanBucket
    ? humanBucket.filter((e) => e.alive)
    : world.entities.filter((e) => e.alive && e.type === EntityType.Human);

  syncResidenceOccupants(allHumans, updatedBuildings);
  assignMissingResidences(playerHumans, updatedBuildings, allHumans);
  assignMissingWorkers(playerHumans, updatedBuildings, world);
}
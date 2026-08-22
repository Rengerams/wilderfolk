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
 *
 * Legacy (24 ticks/day): every 6 ticks → 4× per calendar day.
 * Day is longer now; scale so assign still runs ~4×/day, not 12×.
 * Immediate assign still runs on place/recruit/death and once on the daily layer.
 */
export const LAYER_ASSIGN_INTERVAL = 6 * TICKS_PER_HOUR; // 18 @ 3 ticks/hour → 4×/day

/** How often housing/work bookkeeping fires per colony day. */
export const ASSIGN_PULSES_PER_DAY = Math.floor(TICKS_PER_DAY / LAYER_ASSIGN_INTERVAL);

/**
 * Assignment layer — residence + workforce bookkeeping.
 *
 * Chat, affairs, tavern, courtship live in Realtime (`tickHumans`).
 * Daily mortality / conception stay under isNewCalendarDay in lifeSimulation.
 *
 * Host should call only when world.tick % LAYER_ASSIGN_INTERVAL === 0.
 */
export function tickLayerAssign(world: WorldState, ctx: TickContext): void {
  const { playerHumans, updatedBuildings } = ctx;

  const allHumans =
    ctx.byType[EntityType.Human]?.filter((e) => e.alive)
    ?? world.entities.filter((e) => e.alive && e.type === EntityType.Human);

  syncResidenceOccupants(allHumans, updatedBuildings);
  assignMissingResidences(playerHumans, updatedBuildings, allHumans);
    assignMissingWorkers(playerHumans, updatedBuildings, world);

}

import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { TickContext } from './lifeSimulation';
import { syncResidenceOccupants, assignMissingResidences } from './dayCycle';
import { assignMissingWorkers } from './workforce';

/** Social layer pulse — every N ticks (≈12× per day at TICKS_PER_DAY=72). */
export const LAYER_SOCIAL_INTERVAL = 6;

/**
 * Social layer — housing / residence bookkeeping and workforce assignment.
 *
 * Daily mortality, conception, and affairs stay in tickHumans under
 * isNewCalendarDay. Do not call tryDailyHumanMortality here: that roll has
 * no internal day-lock and would multiply death chance for some settlers.
 *
 * Host should call only when world.tick % LAYER_SOCIAL_INTERVAL === 0.
 */
export function tickLayerSocial(world: WorldState, ctx: TickContext): void {
  const { playerHumans, updatedBuildings } = ctx;

  const allHumans =
    ctx.byType[EntityType.Human]?.filter((e) => e.alive)
    ?? world.entities.filter((e) => e.alive && e.type === EntityType.Human);

  syncResidenceOccupants(allHumans, updatedBuildings);
  assignMissingResidences(playerHumans, updatedBuildings, allHumans);
  assignMissingWorkers(playerHumans, updatedBuildings);
}

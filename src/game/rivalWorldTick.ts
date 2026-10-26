import type { WorldState, Entity } from './gameTypes';
import { unindexEntityFromState } from './entityIndex';
import { addBigNews, addFloatingText } from './simEffects';
import { logEvent } from './eventLog';
import { tickRivalSettlements } from './rivalEvents';
import { tickPendingDiplomacyEvents, maybeQueueDiplomacyEvent } from './rivalDiplomacy';

function killWildGameForPoach(state: WorldState, animal: Entity): void {
  if (!animal.alive) return;
  animal.alive = false;
  unindexEntityFromState(state, animal.id);
  for (const e of state.entities) {
    if (e.huntTargetId === animal.id) e.huntTargetId = undefined;
  }
}

export function tickWorldRivalSettlements(state: WorldState, allAlive: Entity[]): void {
  tickRivalSettlements(state, allAlive, {
    pushNews: addBigNews,
    pushFloat: addFloatingText,
    logEvent,
    tickPendingDiplomacyEvents,
    queueDiplomacyEvent: maybeQueueDiplomacyEvent,
    killWildGameForPoach,
  });
}


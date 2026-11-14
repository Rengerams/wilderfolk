import type { WorldState, Entity } from './gameTypes';
import { addBigNews, addFloatingText } from './simEffects';
import { logEvent } from './eventLog';
import { tickRivalSettlements } from './rivalEvents';
import { killWildGameForPoach } from './simulation/simulationEntities';
import { tickPendingDiplomacyEvents, maybeQueueDiplomacyEvent } from './rivalDiplomacy';
import type { TickContext } from './simulation/simulationTypes';

export function tickWorldRivalSettlements(state: WorldState, allAlive: Entity[], ctx?: TickContext): void {
  tickRivalSettlements(state, allAlive, {
    pushNews: addBigNews,
    pushFloat: addFloatingText,
    logEvent,
    tickPendingDiplomacyEvents,
    queueDiplomacyEvent: maybeQueueDiplomacyEvent,
    killWildGameForPoach: (state, animal) => killWildGameForPoach(state, animal, ctx),
  });
}


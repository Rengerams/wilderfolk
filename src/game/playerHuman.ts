import type { Entity } from './gameTypes';
import { EntityType } from './gameTypes';

/**
 * Colony settler human — excludes transient faction humans (visitors, rivals, trade-route merchants).
 * `trade_caravan` carriers are real humans on the map but must not count toward population, housing,
 * or village job systems; they are handled in `lifeSimulation` / `tradeCaravans.ts` instead.
 *
 * Kept in a leaf module so sim/UI helpers can filter settlers without importing `groupEvents`.
 */
export function isPlayerHuman(e: Entity): boolean {
  return e.type === EntityType.Human
    && e.faction !== 'visitor'
    && e.faction !== 'rival'
    && e.faction !== 'trade_caravan';
}

export function playerHumanCount(entities: Entity[]): number {
  return entities.filter((e) => e.alive && isPlayerHuman(e)).length;
}

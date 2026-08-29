import type { Entity } from './gameTypes';
import { EntityType } from './gameTypes';

const FOREIGN_FACTIONS = new Set<string>(['visitor', 'rival', 'trade_caravan']);

/**
 * Evaluates whether an entity is a living/active settler belonging to the player's village.
 * Acts as a TypeScript type guard narrowing entity type to Human.
 */
export function isPlayerHuman(e: Entity): e is Entity & { readonly type: EntityType.Human } {
  return (
    e.type === EntityType.Human &&
    (!e.faction || !FOREIGN_FACTIONS.has(e.faction))
  );
}

/**
 * Returns the total count of living player-owned colony settlers.
 * Completely allocation-free in hot execution loops.
 */
export function playerHumanCount(entities: readonly Entity[]): number {
  let count = 0;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.alive && isPlayerHuman(e)) {
      count++;
    }
  }
  return count;
}

import type { Entity } from './gameTypes';
import { EntityType } from './gameTypes';

const FOREIGN_FACTIONS = new Set<string>(['visitor', 'rival', 'trade_caravan']);

/**
 * Evaluates whether an entity is a settler belonging to the player's village
 * (a Human that is not a visitor, rival, or trade-caravan member).
 * `Entity` is a single flat interface, so this is a plain predicate: callers
 * that need the faction distinction check `e.faction` themselves afterwards.
 */
export function isPlayerHuman(e: Entity): boolean {
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

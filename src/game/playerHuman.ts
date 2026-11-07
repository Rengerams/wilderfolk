import type { Entity } from './gameTypes';
import { EntityType } from './gameTypes';

/**
 * Every faction the entity union can represent, classified: `true` means it is not the player's.
 * The `Record` key makes a new faction fail to compile until someone classifies it.
 */
const FACTION_IS_FOREIGN: Record<NonNullable<Entity['faction']>, boolean> = {
  visitor: true,
  rival: true,
  trade_caravan: true,
};

/** Whether a faction marker means "not the player's"; a missing marker is player-owned. */
export function isForeignFaction(faction: Entity['faction']): boolean {
  return faction !== undefined && FACTION_IS_FOREIGN[faction] === true;
}

/**
 * Whether an entity is a settler of the player's village: a Human that is not in a foreign faction.
 * A missing or unnamed faction marker still counts as player-owned.
 */
export function isPlayerHuman(e: Entity): boolean {
  return e.type === EntityType.Human && !isForeignFaction(e.faction);
}

/** A player's witnessed human shift still belongs to them during a temporary Moon Howler form. */
export function isPlayerHumanShiftOwner(e: Entity): boolean {
  return isPlayerHuman(e) || (e.type === EntityType.Werewolf && !!e.moonHowlerCursed
    && !!e.moonHowlerSaved && !isForeignFaction(e.faction));
}

/**
 * The living player-owned settlers in `entities`, in input order — the one home for that list, reused
 * by `relationships`, `apprenticeships` and the daily layer.
 */
export function playerHumansFrom(entities: readonly Entity[]): Entity[] {
  const people: Entity[] = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.alive && isPlayerHuman(e)) people.push(e);
  }
  return people;
}

/**
 * **Every** player-owned settler in `entities`, dead included — deliberately not {@link playerHumansFrom},
 * which `assignMissingResidences` needs to clear the beds of the dead.
 */
export function allPlayerHumans(entities: readonly Entity[]): Entity[] {
  return entities.filter(isPlayerHuman);
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
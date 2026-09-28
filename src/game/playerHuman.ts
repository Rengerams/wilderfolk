import type { Entity } from './gameTypes';
import { EntityType } from './gameTypes';

/**
 * Every faction the entity union can represent, classified: `true` means the group is not the
 * player's. Typing this as a `Record` keyed by `Entity['faction']` is the point — adding a faction
 * to `gameTypes.Entity['faction']` stops compiling here until someone classifies it, which is the
 * drift the hand-copied `!e.faction` tests allowed (duplication finding A3).
 */
const FACTION_IS_FOREIGN: Record<NonNullable<Entity['faction']>, boolean> = {
  visitor: true,
  rival: true,
  trade_caravan: true,
};

/**
 * Evaluates whether an entity is a settler belonging to the player's village: a Human that is not
 * a member of a foreign faction.
 *
 * Only factions *classified as foreign above* are excluded: an entity with no faction — or with a
 * marker the union does not name, such as the `'player'` value the test fixtures and
 * `scripts/balance-militia.ts` write — is player-owned. Deciding by the union rather than by
 * "any faction means not ours" keeps that explicit player marker working, and the `Record` above
 * is what stops a newly added faction from silently joining the colony.
 *
 * `Entity` is a single flat interface, so this is a plain predicate: callers that need the
 * specific faction check `e.faction` themselves afterwards.
 */
export function isPlayerHuman(e: Entity): boolean {
  return (
    e.type === EntityType.Human &&
    (!e.faction || !FACTION_IS_FOREIGN[e.faction])
  );
}

/**
 * The living player-owned settlers in `entities` — the list form of the `alive && isPlayerHuman`
 * pair `playerHumanCount` above counts, in input order.
 *
 * Exported as the single home for that list: `relationships` and `apprenticeships` each carried a
 * private copy of the same filter, and the daily layer needs the identical list for both of them in
 * one pass. Deriving it once per pass there is what stops the second full scan of `allAlive`.
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
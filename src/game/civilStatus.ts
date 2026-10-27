/**
 * A settler's civil status, as one predicate.
 *
 * `relationshipStatus` has two values that both mean "in an active marriage": `'married'`, and
 * `'expecting'`, which conception assigns to **both** partners for the duration of the pregnancy
 * (`simulation/humanRelationships.ts:764-766`, `:1007-1008`). Any reader that tests only
 * `=== 'married'` therefore sees a married couple vanish for the length of the pregnancy.
 *
 * That is not hypothetical: the yearly statistics counted `=== 'married'` and reported
 * `marriagesThisYear` as `floor((married - lastYearMarried) / 2)`, so a couple that married and then
 * conceived in the same year closed it *even* — the two partners leaving `'married'` for
 * `'expecting'` cancelled the two who had arrived, the delta was 0, and the lifetime **Marriages**
 * total never rose while the People screen showed the couple as married.
 *
 * The predicate existed as two private copies (`familyTree.isActivelyMarried`,
 * `socialLife.isActivelyMarried`) and two inline spellings (`citizenOverview`, `stats`). It lives here
 * so a fifth reader has one thing to ask.
 *
 * Leaf module: an `Entity` type only, so any owner may depend on it.
 */
import type { Entity } from './gameTypes';

/**
 * True while the settler is in an active marriage — `'married'`, or `'expecting'` for the pregnancy
 * that status replaces it with.
 *
 * This is deliberately **not** "has a partner": a divorce clears `partnerId`, but so can a death, and
 * a grieving widow is not actively married. Callers that need the spouse should still pair this with
 * `partnerId` (see `familyTree.getFamilyTree`).
 */
export function isMarriedOrExpecting(entity: Pick<Entity, 'relationshipStatus'>): boolean {
  return entity.relationshipStatus === 'married' || entity.relationshipStatus === 'expecting';
}

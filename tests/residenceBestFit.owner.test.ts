/**
 * A2 — "least-occupied residence, lowest id breaks ties" was implemented twice
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`; row A2 in `LIVE-FINDINGS-STATUS.md`).
 *
 * `residencyReconciliation.pickSharedResidence` carried its own copy of the selection loop. The rule
 * now lives only in `residencySelection.pickLeastCrowdedResidence`, which takes the movers as
 * `movingTogether` so the shared-move discount (a home one mover already lives in counts them once)
 * is expressed through the owner instead of beside it.
 *
 * The behavioural cases are deliberate equivalence pins: they describe what the *old* copy did, so a
 * generalization that changes the shared-move outcome fails here rather than in a 360-day run.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { pickLeastCrowdedResidence } from '../src/game/residencySelection';

/** A completed House through the production factory — no hand-built Building literal. */
function residence(id: number): Building {
  const house = createBuilding(BuildingType.House, 400, 400, id);
  house.completed = true;
  return house;
}

function settler(id: number, residenceBuildingId?: number): Entity {
  const human = createEntity(EntityType.Human, 400, 400, id, 200);
  human.residenceBuildingId = residenceBuildingId;
  return human;
}

describe('the least-crowded residence rule has one owner', () => {
  it('breaks a tie toward the lower building id', () => {
    const houses = [residence(2), residence(1)];
    const humans = [settler(10, 1), settler(11, 2)];
    const movers = [settler(20), settler(21)];

    // Both homes hold one settler and can take two more: the owner must pick id 1, not list order.
    expect(pickLeastCrowdedResidence(humans, houses, 2, {}, undefined, movers)).toBe(1);
  });

  it('prefers the emptier home when one cannot take the pair', () => {
    const houses = [residence(1), residence(2)];
    const capacity = 4;
    // House 1 is full enough that the pair does not fit; house 2 has room.
    const humans = [
      settler(10, 1), settler(11, 1), settler(12, 1),
      settler(13, 2),
    ];
    const movers = [settler(20), settler(21)];

    expect(capacity).toBeGreaterThan(0);
    expect(pickLeastCrowdedResidence(humans, houses, 2, {}, undefined, movers)).toBe(2);
  });

  it('counts a mover who already lives in the home only once', () => {
    const houses = [residence(1), residence(2)];
    // House 1 holds two settlers, one of whom is moving out and back in with a partner.
    const mover = settler(20, 1);
    const partner = settler(21);
    const humans = [settler(10, 1), mover, settler(11, 2)];

    // House 1 reads as one resident (two minus the mover) and ties house 2's one, so the id wins.
    // Without the `movingTogether` discount house 1 reads two and house 2 is chosen instead.
    expect(pickLeastCrowdedResidence(humans, houses, 2, {}, undefined, [mover, partner])).toBe(1);
  });

  it('keeps the shared-residence caller on the owner', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/game/residencyReconciliation.ts'),
      'utf8',
    );
    expect(source, 'the shared-residence caller no longer delegates to the owner').toContain(
      'pickLeastCrowdedResidence(humans, residences, 2',
    );
    // The pre-fix copy opened with `const needed = 2;` and carried its own best-fit comparison.
    expect(source, 'the duplicated selection loop is back').not.toContain('const needed = 2;');
  });
});

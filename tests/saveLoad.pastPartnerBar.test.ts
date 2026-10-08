/**
 * The one-year remarriage bar must survive a save and a load.
 *
 * The bar is enforced on entering courtship and on completing a marriage, and the divorce owner
 * stamps `pastPartnerTicks` when a marriage ends. These cases pin that the stamp really does
 * round-trip: the restore rebuilds each entity from `{ …defaults, …saved }` before it copies the
 * `ENTITY_PERSISTED_FIELDS` list, so a present field survives — and this guard is what fails if that
 * ever stops being true, which is how a divorced pair would end up free to remarry the day after a
 * load. A save written before the stamp existed carries no record of the divorce at all; no rule can
 * bar a marriage that was never recorded.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import {
  isWithinRemarriageBar,
  REMARRIAGE_BAR_TICKS,
} from '../src/game/simulation/humanRelationships';
import { EntityType, type Entity, type WorldState } from '../src/game/gameTypes';

/** The two founders `initGame` seats, which is all this case needs. */
function founders(world: WorldState): [Entity, Entity] {
  const humans = world.entities.filter((e) => e.type === EntityType.Human);
  const [first, second] = humans;
  if (!first || !second) throw new Error('fixture has fewer than two settlers');
  return [first, second];
}

function roundTrip(world: WorldState): WorldState {
  const payload = structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
  const outcome = loadGameFromParsedOutcome(payload);
  if (!outcome.ok) throw new Error(`fixture save was refused: ${outcome.reason} ${outcome.detail}`);
  return outcome.world;
}

afterEach(() => {
  resetSimRng();
});

describe('a divorced pair stays apart across a save and a load', () => {
  it('carries the divorce stamp through the round trip, so the bar still bites', () => {
    resetSimRng();
    const world = initGame({ seed: 4242 });
    const [a, b] = founders(world);
    const divorcedAtTick = 500;

    a.pastPartnerTicks = { ...a.pastPartnerTicks, [b.id]: divorcedAtTick };
    b.pastPartnerTicks = { ...b.pastPartnerTicks, [a.id]: divorcedAtTick };

    const loaded = roundTrip(world);
    const [loadedA, loadedB] = loaded.entities.filter((e) => e.type === EntityType.Human);

    // The stamp survived, on both sides of the pair.
    expect(loadedA.pastPartnerTicks?.[loadedB.id]).toBe(divorcedAtTick);
    expect(loadedB.pastPartnerTicks?.[loadedA.id]).toBe(divorcedAtTick);

    // And the owner's own verdict reads it: barred the day after, free once the year is up.
    expect(isWithinRemarriageBar(loadedA, loadedB, divorcedAtTick + 1)).toBe(true);
    expect(isWithinRemarriageBar(loadedB, loadedA, divorcedAtTick + 1)).toBe(true);
    expect(isWithinRemarriageBar(loadedA, loadedB, divorcedAtTick + REMARRIAGE_BAR_TICKS)).toBe(false);
  });

  it('still loads a pair that never divorced, so the rule above is not vacuous', () => {
    resetSimRng();
    const world = initGame({ seed: 4242 });
    const loaded = roundTrip(world);
    const humans = loaded.entities.filter((e) => e.type === EntityType.Human);
    const [a, b] = humans;

    expect(a.pastPartnerTicks?.[b.id]).toBeUndefined();
    expect(isWithinRemarriageBar(a, b, 1)).toBe(false);
  });
});

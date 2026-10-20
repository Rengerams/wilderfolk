/**
 * End-of-tick entity rebuild: `gameTick` merges `ctx.newEntities` into the living
 * list, retaining each entity once. This drives the real day boundary — the tick
 * with the most new spawns — and asserts the outcome on the world: the newcomers
 * survive in the merged list exactly once, and no entity repeats.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';

/** Seed whose day-boundary tick admits a family into a high-reputation village. */
const FIXTURE_SEED = 3;

/** Counts each entity object in `state.entities`, so an in-place duplicate is visible. */
function occurrences(state: WorldState): Map<Entity, number> {
  const seen = new Map<Entity, number>();
  for (const entity of state.entities) seen.set(entity, (seen.get(entity) ?? 0) + 1);
  return seen;
}

describe('gameTick retains each new entity once at the day boundary', () => {
  it('keeps the day-boundary newcomers and leaves no entity repeated', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    // High reputation keeps the daily immigration roll near certainty so the boundary spawns.
    state.villageReputation = 100;
    // Land exactly on a colony-day boundary: `gameTick` increments onto it.
    state.tick = TICKS_PER_DAY + 3 * TICKS_PER_DAY / 4 - 1;
    const before = new Set(state.entities);

    gameTick(state);

    const newcomers = state.entities.filter((entity) => !before.has(entity));
    expect(newcomers.length, 'the day boundary admitted no new entity').toBeGreaterThan(0);
    expect(newcomers.every((entity) => entity.alive)).toBe(true);

    const count = occurrences(state);
    expect(count.size).toBe(state.entities.length);
    // A repeated entity would appear twice in the list, so every count is exactly 1.
    expect([...count.values()]).toEqual(new Array(state.entities.length).fill(1));
    for (const entity of [...before, ...newcomers]) {
      expect(count.get(entity), `entity #${entity.id} survived the rebuild once`).toBe(1);
    }
  });
});

/**
 * F3 and F5 of the 2026-09-16 worker-boundary audit (`docs/private/audits/2026-09-16/game-worker.md`):
 *
 * - **F3:** `activeEvent` is written by the daily layer inside `gameTick`, and the delta shipped it,
 *   but it was missing from the prep rollback payload — the one `WorldState` field with that
 *   asymmetry, so a failed tick could leave an event latched.
 * - **F5:** `applySimPrep` ended with `invalidateWorldRuntimeCaches`, which drops `scentGrid` — a
 *   simulation field (wolf scent trails), not a derived index — so every rollback zeroed the trail.
 *
 * The blanket payload round-trip is already asserted by `tests/simPrep.rollbackClosure.test.ts`
 * ("round-trips every field the prep payload claims to own"); these cases pin the two behaviours that
 * test cannot express.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { ensureScentGrid } from '../src/game/scentGrid';
import type { WorldState } from '../src/game/gameTypes';

type ActiveEvent = WorldState['activeEvent'];

function event(id: string): ActiveEvent {
  return { id, title: id } as unknown as ActiveEvent;
}

describe('prep rollback covers what the tick writes (F3/F5)', () => {
  it('undoes an event the failed tick latched', () => {
    const world = initGame();
    world.activeEvent = null;
    const prep = extractSimPrep(world);

    world.activeEvent = event('visitor_pilgrims_504');
    applySimPrep(world, prep);

    expect(world.activeEvent).toBeNull();
  });

  it('restores the event that was live before the tick', () => {
    const world = initGame();
    world.activeEvent = event('raid_before');
    const prep = extractSimPrep(world);

    world.activeEvent = event('story_after');
    applySimPrep(world, prep);

    expect(world.activeEvent?.id).toBe('raid_before');
  });

  it('keeps the live scent grid across a rollback', () => {
    const world = initGame();
    const grid = ensureScentGrid(world);
    grid.values[0] = 7;
    const prep = extractSimPrep(world);

    applySimPrep(world, prep);

    expect(world.scentGrid).toBe(grid);
    expect(world.scentGrid?.values[0]).toBe(7);
  });
});

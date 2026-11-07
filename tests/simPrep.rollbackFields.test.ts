/**
 * The prep rollback covers what the tick writes: `activeEvent` is restored, and `applySimPrep`
 * keeps the live `scentGrid` rather than invalidating it.
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

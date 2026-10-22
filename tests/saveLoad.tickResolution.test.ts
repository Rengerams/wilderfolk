import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsed } from '../src/game/saveLoad';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { createInitialView } from '../src/game/viewState';

describe('save tick-resolution migration', () => {
  it('preserves the calendar day and clock hour of an existing 72-tick/day save', () => {
    const world = initGame({ seed: 1122 });
    const oldTick = 7 * 72 + 9 * 3;
    world.tick = oldTick;
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    payload._ticksPerDay = 72;
    payload.tick = oldTick;

    const loaded = loadGameFromParsed(payload);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.tick).toBe(7 * TICKS_PER_DAY + 9 * TICKS_PER_HOUR);
    expect(loaded!.world.dayInYear).toBe(7);
    expect(payload.tick).toBe(oldTick);
  });

  it('writes the new resolution and does not rescale it on load', () => {
    const world = initGame({ seed: 1122 });
    world.tick = 4 * TICKS_PER_DAY + 11 * TICKS_PER_HOUR;
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    expect(payload._ticksPerDay).toBe(TICKS_PER_DAY);

    const loaded = loadGameFromParsed(payload);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.tick).toBe(world.tick);
  });
});

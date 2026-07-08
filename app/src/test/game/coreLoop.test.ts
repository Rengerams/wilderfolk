import { afterEach, describe, expect, it, vi } from 'vitest';
import { TICKS_PER_DAY } from '@/game/dayCycle';
import { gameTick } from '@/game/gameEngine';
import { isPlayerHuman } from '@/game/groupEvents';
import { Season } from '@/game/gameTypes';
import { initGame } from '@/game/worldGen';

/**
 * One integration test for the live simulation path: boot → tick a full day → colony still coherent.
 * Exercises init, calendar, humans, resources, wildlife, and season logic together — not isolated stubs.
 */
describe('wilderfolk core loop', () => {
  const randomSpy = vi.spyOn(Math, 'random');

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('survives a full in-game day with pioneers alive and valid world state', () => {
    randomSpy.mockReturnValue(0.99);

    const start = initGame({ width: 400, height: 300 });
    const pioneerCount = start.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
    expect(pioneerCount).toBeGreaterThanOrEqual(2);
    expect(start.worldMap).not.toBeNull();

    let world = start;
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      world = gameTick(world);
    }

    const settlers = world.entities.filter((e) => e.alive && isPlayerHuman(e));
    expect(world.tick).toBe(TICKS_PER_DAY);
    expect(world.dayInYear).toBe(1);
    expect(world.year).toBe(0);
    expect(settlers).toHaveLength(pioneerCount);
    expect(settlers.every((h) => h.energy > 0 && Number.isFinite(h.energy))).toBe(true);
    expect(world.humanPopulation).toBe(pioneerCount);
    expect(world.resources.food).toBeGreaterThan(0);
    expect(world.resources.wood).toBeGreaterThanOrEqual(0);
    expect(world.resources.stone).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(world.ecosystemHealth)).toBe(true);
    expect(world.ecosystemHealth).toBeGreaterThan(0);
    expect(world.wildlifeCounts.grass + world.wildlifeCounts.rabbits + world.wildlifeCounts.deer).toBeGreaterThan(0);
    expect(Object.values(Season)).toContain(world.season);
  });
});
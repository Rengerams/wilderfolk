/**
 * Tavern service hours — the pub is open 17:00–22:59 normally, but stays open
 * all day and night during festivals (the innkeeper works the party).
 */
import { describe, it, expect } from 'vitest';
import { isOnInnkeeperShift, isTavernOpen } from '../src/game/dayCycle';

describe('tavern festival hours', () => {
  it('is open in the evening, closed in the morning', () => {
    expect(isTavernOpen(18)).toBe(true);
    expect(isTavernOpen(22)).toBe(true);
    expect(isTavernOpen(9)).toBe(false);
    expect(isTavernOpen(23)).toBe(false);
  });

  it('stays open all day and night during a festival', () => {
    for (const hour of [0, 6, 9, 12, 15, 18, 22, 23]) {
      expect(isTavernOpen(hour, true), `hour ${hour}`).toBe(true);
    }
  });

  it('innkeeper works the festival around the clock', () => {
    expect(isOnInnkeeperShift(72 * 10, 9, true)).toBe(true); // mid-day, festival
    expect(isOnInnkeeperShift(72 * 10, 9)).toBe(false); // same hour, no festival
    expect(isOnInnkeeperShift(72 * 10, 19)).toBe(true); // evening shift always
  });
});

import { describe, it, expect } from 'vitest';
import { clampRaidGoldGain } from './frontierCombat';

describe('clampRaidGoldGain', () => {
  it('caps per-raid gold', () => {
    expect(clampRaidGoldGain(0, 500, 9999)).toBe(80);
  });
  it('respects soft vault room', () => {
    expect(clampRaidGoldGain(9970, 50, 9999)).toBe(29);
  });
  it('returns 0 when spoils empty', () => {
    expect(clampRaidGoldGain(100, 0)).toBe(0);
  });
});

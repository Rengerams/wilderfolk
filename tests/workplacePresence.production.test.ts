import { describe, expect, it } from 'vitest';
import { getWorkplacePresenceShare } from '../src/game/scheduleFatigue';

describe('workplace production requires attendance', () => {
  it('does not produce from an assignment without any recorded shift', () => {
    expect(getWorkplacePresenceShare(0, 1, 8, false)).toBe(0);
    expect(getWorkplacePresenceShare(0, 4, 8, false)).toBe(0);
    expect(getWorkplacePresenceShare(0, 4, 8, true)).toBe(0);
  });

  it('scales production to hours actually worked', () => {
    expect(getWorkplacePresenceShare(2, 3, 8, true)).toBeCloseTo(0.25);
    expect(getWorkplacePresenceShare(8, 3, 8, true)).toBe(1);
    expect(getWorkplacePresenceShare(12, 3, 8, true)).toBe(1);
  });

  it('does not grant full production to an empty workplace', () => {
    expect(getWorkplacePresenceShare(0, 0, 8, false)).toBe(0);
  });
});

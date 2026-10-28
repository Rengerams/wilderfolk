import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/simRng';
import { personDayRoll as dayCyclePersonDayRoll } from '../src/game/dayCycle';
import { snapshotSimRng } from '../src/game/simRng';

describe('personDayRoll central RNG ownership', () => {
  it('preserves the exact historical per-person/day/salt results', () => {
    expect(personDayRoll(1, 0, 812)).toBe(0.677);
    expect(personDayRoll(1, 288, 812)).toBe(0.4387);
    expect(personDayRoll(42, 576)).toBe(0.144);
    expect(personDayRoll(1001, 12345, 718)).toBe(0.1439);
    expect(personDayRoll(99, 0)).toBe(0.5551);
    expect(personDayRoll(99, 0, 812)).toBe(0.1184);
  });

  it('stays stable within a colony day and changes when the day changes', () => {
    expect(personDayRoll(1, TICKS_PER_DAY - 1, 812)).toBe(personDayRoll(1, 0, 812));
    expect(personDayRoll(1, TICKS_PER_DAY, 812)).not.toBe(personDayRoll(1, 0, 812));
  });

  it('keeps the existing dayCycle import pointing at the same implementation', () => {
    expect(dayCyclePersonDayRoll).toBe(personDayRoll);
  });

  it('does not advance the simulation RNG streams', () => {
    const before = snapshotSimRng();
    personDayRoll(12, TICKS_PER_DAY * 9, 812);
    expect(snapshotSimRng()).toEqual(before);
  });
});

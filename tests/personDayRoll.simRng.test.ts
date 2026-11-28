import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { personDayRoll, personPairDayRoll, snapshotSimRng } from '../src/game/simRng';

describe('personDayRoll central RNG ownership', () => {
  it('retains the historical buckets and resolves their interior', () => {
    const fixtures = [
      [1, 0, 812, 6770], [1, 288, 812, 4387], [42, 576, 0, 1440],
      [1001, 12345, 718, 1439], [99, 0, 0, 5551], [99, 0, 812, 1184],
    ] as const;
    for (const [id, tick, salt, bucket] of fixtures) {
      const roll = personDayRoll(id, tick, salt);
      expect(roll).toBeGreaterThan(bucket / 10000);
      expect(roll).toBeLessThan((bucket + 1) / 10000);
    }
  });

  it('resolves rare mortality probabilities without rounding up to the next bucket', () => {
    let stable = 0;
    let damaged = 0;
    let collapse = 0;
    for (let day = 0; day < 1000; day++) {
      for (let id = 1; id <= 1000; id++) {
        const roll = personDayRoll(id, day * TICKS_PER_DAY, 607);
        if (roll < 0.00012) stable++;
        if (roll < 0.0002) damaged++;
        if (roll < 0.00032) collapse++;
      }
    }
    // Intended expectations: 120 / 200 / 320; old mixer: 214 / 214 / 392.
    expect(stable).toBeGreaterThan(80);
    expect(stable).toBeLessThan(160);
    expect(damaged).toBeGreaterThan(160);
    expect(damaged).toBeLessThan(250);
    expect(collapse).toBeGreaterThan(260);
    expect(collapse).toBeLessThan(380);
  });

  it('resolves pair rolls inside the old buckets without consuming RNG streams', () => {
    const before = snapshotSimRng();
    const roll = personPairDayRoll(12, 13, TICKS_PER_DAY * 9, 724);
    expect(roll).toBeGreaterThanOrEqual(0);
    expect(roll).toBeLessThan(1);
    expect(roll * 10000).not.toBe(Math.floor(roll * 10000));
    expect(personPairDayRoll(12, 13, TICKS_PER_DAY * 10 - 1, 724)).toBe(roll);
    expect(snapshotSimRng()).toEqual(before);
  });

  it('stays stable within a colony day and changes when the day changes', () => {
    expect(personDayRoll(1, TICKS_PER_DAY - 1, 812)).toBe(personDayRoll(1, 0, 812));
    expect(personDayRoll(1, TICKS_PER_DAY, 812)).not.toBe(personDayRoll(1, 0, 812));
  });

  it('does not advance the simulation RNG streams', () => {
    const before = snapshotSimRng();
    personDayRoll(12, TICKS_PER_DAY * 9, 812);
    expect(snapshotSimRng()).toEqual(before);
  });
});

/**
 * Courtship pace: full rate in social life, `COURTSHIP_WORK_RATE_FACTOR` on a work shift; a church
 * plays no part in the rate.
 */
import { describe, expect, it } from 'vitest';
import { courtshipRatePerHour } from '../src/game/simulation/humanRelationships';
import { Relationship } from '../src/game/gameConstants';
import { PER_TICK_RATE_SCALE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';

describe('courtship pace', () => {
  it('keeps the full rate in social life', () => {
    expect(courtshipRatePerHour(true)).toBe(Relationship.COURTSHIP_BASE_RATE_PER_HOUR);
  });

  it('is far slower on a work shift', () => {
    expect(courtshipRatePerHour(false)).toBeLessThan(courtshipRatePerHour(true));
    expect(courtshipRatePerHour(false)).toBeCloseTo(
      Relationship.COURTSHIP_BASE_RATE_PER_HOUR * Relationship.COURTSHIP_WORK_RATE_FACTOR,
      10,
    );
  });

  it('has no church term', () => {
    // No church strength is a parameter, so the social rate is the base.
    expect(courtshipRatePerHour(true)).toBe(4);
    expect(courtshipRatePerHour(false)).toBeCloseTo(0.6, 10);
  });

  it('the base is per in-game hour: a day is base × TICKS_PER_DAY / TICKS_PER_HOUR', () => {
    expect(PER_TICK_RATE_SCALE).toBeCloseTo(1 / TICKS_PER_HOUR, 10);
    expect(courtshipRatePerHour(true) * PER_TICK_RATE_SCALE * TICKS_PER_DAY).toBeCloseTo(96, 6);
    expect(courtshipRatePerHour(false) * PER_TICK_RATE_SCALE * TICKS_PER_DAY).toBeCloseTo(14.4, 6);
  });
});

/**
 * The calendar day length has one owner: `gameConstants.Time`. The clock derives TICKS_PER_DAY from
 * `Time.TICKS_PER_HOUR * Time.HOURS_PER_DAY` and reads `Time.DAYS_PER_YEAR` directly; the
 * "no second declaration" half of the rule lives in `scripts/check-source-guards.mjs`.
 */
import { describe, expect, it } from 'vitest';
import { Time } from '../src/game/gameConstants';
import { DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';

describe('A8 — the calendar day length has one owner (gameConstants.Time)', () => {
  it('keeps the clock values derived from the owner, after the pacing retune', () => {
    expect(TICKS_PER_HOUR).toBe(Time.TICKS_PER_HOUR);
    expect(TICKS_PER_DAY).toBe(Time.HOURS_PER_DAY * Time.TICKS_PER_HOUR);
    expect(TICKS_PER_DAY).toBe(288);
    expect(DAYS_PER_YEAR).toBe(Time.DAYS_PER_YEAR);
  });
});

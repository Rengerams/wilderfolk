/**
 * The calendar day length has one owner: `gameConstants.Time`. The clock derives TICKS_PER_DAY from
 * `Time.TICKS_PER_HOUR * Time.HOURS_PER_DAY` and reads `Time.DAYS_PER_YEAR` directly.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Time } from '../src/game/gameConstants';
import { DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';

function readSrc(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

describe('A8 — the calendar day length has one owner (gameConstants.Time)', () => {
  it('keeps the clock values derived from the owner, after the pacing retune', () => {
    expect(TICKS_PER_HOUR).toBe(Time.TICKS_PER_HOUR);
    expect(TICKS_PER_DAY).toBe(Time.HOURS_PER_DAY * Time.TICKS_PER_HOUR);
    expect(TICKS_PER_DAY).toBe(288);
    expect(DAYS_PER_YEAR).toBe(Time.DAYS_PER_YEAR);
  });

  it('leaves no second TICKS_PER_DAY declaration in gameConstants', () => {
    expect(
      readSrc('src/game/gameConstants.ts'),
      'gameConstants.Time still declares TICKS_PER_DAY, a literal nothing reads',
    ).not.toMatch(/^\s*TICKS_PER_DAY:/m);
  });

  it('leaves no second tick-rate literal in dayCycleClock', () => {
    const clock = readSrc('src/game/dayCycleClock.ts');
    expect(
      clock,
      'dayCycleClock restates the tick rate instead of reading the owner',
    ).not.toMatch(/^export const TICKS_PER_HOUR = \d/m);
    expect(clock).toContain('Time.TICKS_PER_HOUR');
  });
});

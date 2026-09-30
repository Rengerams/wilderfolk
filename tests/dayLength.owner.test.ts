/**
 * A8 — the calendar day length was defined twice and one definition was dead
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * `gameConstants.Time` declared `TICKS_PER_DAY: 72` — zero references anywhere — while the live clock
 * derived its own `TICKS_PER_DAY` in `dayCycleClock.ts` from a second local literal, `TICKS_PER_HOUR = 3`.
 * Two definitions of one rule, already different in kind (literal vs derived): if `HOURS_PER_DAY` were
 * retuned to 20 the runtime day would become 60 ticks while `Time.TICKS_PER_DAY` still claimed 72.
 *
 * The owner is now `gameConstants.Time`; the clock derives `TICKS_PER_DAY` from `Time.TICKS_PER_HOUR`
 * and `Time.HOURS_PER_DAY` and reads `Time.DAYS_PER_YEAR` without re-hard-coding a `?? 360` fallback.
 * The existing `tests/gameTick.layerOrder.test.ts` pin (72) is deliberately untouched.
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
  it('keeps the clock values derived from the owner, and unchanged', () => {
    expect(TICKS_PER_HOUR).toBe(Time.TICKS_PER_HOUR);
    expect(TICKS_PER_DAY).toBe(Time.HOURS_PER_DAY * Time.TICKS_PER_HOUR);
    expect(TICKS_PER_DAY).toBe(72);
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

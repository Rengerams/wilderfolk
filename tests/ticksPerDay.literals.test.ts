/**
 * G3 — `TICKS_PER_DAY` (= 72) must not be a bare literal in the test tier
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md` G3, evidence
 * `_test-helper-duplication.md` §4.1, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * Before this pass, tests that wanted a day boundary wrote `72` (or a derived spelling such as
 * `72 * 5`, `5 * 72`, `state.tick = 72`, `tick: 72`). The clock owner is
 * `src/game/dayCycleClock.ts` (`TICKS_PER_DAY`, `ticksForDays`, `getAbsoluteCalendarDay`), re-exported
 * by `src/game/dayCycle.ts`. Every value below is identical **by definition** (72 = 24 × 3), so this
 * was a pure "same number, second definition" sweep — but retune `gameConstants.Time.HOURS_PER_DAY`
 * or `Time.TICKS_PER_HOUR` and the literal sites would keep driving the simulation to ticks that are
 * no longer day boundaries while still asserting day-boundary behaviour.
 *
 * Two assertions per file, so the guard cannot pass vacuously:
 *   1. the pre-fix expression is gone (the guard's reason to exist), and
 *   2. the file still names the owner (`TICKS_PER_DAY` / `ticksForDays`) — a "fix" that merely
 *      deleted the boundary probe would fail this half.
 *
 * Deliberately exempt, and asserted nowhere here: `tests/gameTick.layerOrder.test.ts`'s
 * `expect(TICKS_PER_DAY).toBe(72)` pin (`:131`), which is a *deliberate* pin of the constant, and
 * `tests/dayLength.owner.test.ts`'s matching pin (that one guards A8, the source-side definition).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface LiteralSite {
  /** Test file that used a bare day length. */
  file: string;
  /** The pre-fix spelling — the exact expression this sweep removed. */
  preFix: RegExp;
  /** Human-readable name of that spelling, for the failure message. */
  spelling: string;
}

const SITES: LiteralSite[] = [
  { file: 'tests/autoStaff.notify.test.ts', preFix: /72 \* 5/, spelling: '72 * 5' },
  { file: 'tests/demolish.roundtrip.test.ts', preFix: /3 \* 72/, spelling: '3 * 72' },
  { file: 'tests/dayCycle.tavern.test.ts', preFix: /72 \* 10/, spelling: '72 * 10' },
  { file: 'tests/humanNeeds.mealRule.test.ts', preFix: /MEAL_TICK = 72/, spelling: 'MEAL_TICK = 72' },
  { file: 'tests/humanGraduation.education.test.ts', preFix: /72 \* 10/, spelling: '72 * 10' },
  {
    file: 'tests/moonHowler.test.ts',
    preFix: /DAYS_PER_MOON_CYCLE \* 72|NIGHT_START \* 3/,
    spelling: 'DAYS_PER_MOON_CYCLE * 72 + NIGHT_START * 3',
  },
  { file: 'tests/medium-batch2.test.ts', preFix: /5 \* 72|\+= 72/, spelling: '5 * 72 / += 72' },
  { file: 'tests/rivalDiplomacy.test.ts', preFix: /14 \* 72/, spelling: '14 * 72' },
  {
    file: 'tests/weatherConsequences.test.ts',
    preFix: /let t = 72;|t <= 71;/,
    spelling: 'for (let t = 72; …) with the `t <= 71` run-up',
  },
  { file: 'tests/conceptionEvent.labelling.test.ts', preFix: /state\.tick = 72;/, spelling: 'state.tick = 72' },
  { file: 'tests/humanLifecycle.test.ts', preFix: /state\.tick = 72;/, spelling: 'state.tick = 72' },
  {
    file: 'tests/medium-B1-staffing.test.ts',
    preFix: /72 \+ (23|10) \* TICKS_PER_HOUR/,
    spelling: '72 + 23 * TICKS_PER_HOUR / 72 + 10 * TICKS_PER_HOUR',
  },
  { file: 'tests/affairAge.adultOnly.test.ts', preFix: /const TICK = 72;/, spelling: 'const TICK = 72' },
  { file: 'tests/dailyScheduleFatigue.test.ts', preFix: /tick: 72,/, spelling: 'tick: 72,' },
  { file: 'tests/famineDesperation.test.ts', preFix: /tick: 72,/, spelling: 'tick: 72,' },
  { file: 'tests/guidedCampaign.test.ts', preFix: /world\.tick \+= 72;/, spelling: 'world.tick += 72' },
  { file: 'tests/huntingSpot.cleanup.test.ts', preFix: /^\s*72,\s*$/m, spelling: '72, (the expected day-boundary tick)' },
  { file: 'tests/relationships.sharedHomeFriendship.test.ts', preFix: /tick: 72,/, spelling: 'tick: 72,' },
  { file: 'tests/relationships.feudCleanup.test.ts', preFix: /tick: 72,/, spelling: 'tick: 72,' },
];

function readTest(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

describe('G3 — the test tier reads the day length from the clock owner', () => {
  it('covers every literal site the audit named', () => {
    // Not a coverage metric: this pins that the table itself was not silently emptied.
    expect(SITES.length).toBeGreaterThanOrEqual(19);
  });

  for (const { file, preFix, spelling } of SITES) {
    it(`${file} has no bare day-length literal (${spelling})`, () => {
      const source = readTest(file);
      expect(
        source,
        `${file} still drives the clock with the literal \`${spelling}\`; import TICKS_PER_DAY/ticksForDays from src/game/dayCycle`,
      ).not.toMatch(preFix);
      expect(
        source,
        `${file} no longer names the clock owner at all — the literal was removed without using it`,
      ).toMatch(/TICKS_PER_DAY|ticksForDays/);
    });
  }
});

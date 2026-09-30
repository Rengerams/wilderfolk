/**
 * A vacant leadership campaign is due on a date, not on a year boundary.
 *
 * `tryStartVacancyElectionCeremony` compares `year + dayInYear / DAYS_PER_YEAR` against
 * `state.pendingElectionYear`, but its only caller sat inside the year-rollover branch of the
 * daily layer. A leader who died on day 300 of year 3 stored a due date of 4.083: the year-4
 * rollover compared 4.0 < 4.083 and started nothing, and because `tryStartTermElectionCeremony`
 * refuses while a vacancy is pending, that year's scheduled term election was skipped as well —
 * the successor election only ran at the year-5 rollover, roughly a year after the promised
 * three months. The daily layer now evaluates the vacancy every day.
 *
 * The test drives a real `gameTick` day boundary (not a year rollover) and asserts the ceremony
 * starts on the day the campaign falls due.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { getColonyDay } from '../src/game/dayCycle';

const FIXTURE_SEED = 20240913;
/** Year 4, day 40: the due date 4.083 has passed, but this is not a year rollover. */
const DUE_YEAR = 4;
const DUE_DAY = 40;

describe('a vacancy election campaign starts on its due day', () => {
  it('starts the ceremony mid-year when the campaign falls due', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.villageLeaderId = null;
    state.pendingElectionYear = DUE_YEAR + 30 / DAYS_PER_YEAR;
    state.year = DUE_YEAR;
    state.dayInYear = DUE_DAY;
    state.tick = DUE_DAY * TICKS_PER_DAY - 1; // gameTick advances onto a colony-day boundary
    state.lastElectionYear = -1;

    gameTick(state);

    expect(getColonyDay(state)).toBe(DUE_YEAR * DAYS_PER_YEAR + DUE_DAY);
    expect(state.electionCeremony).toBeTruthy();
    expect(state.pendingElectionYear).toBeNull();
  });

  it('starts nothing before the due date', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.villageLeaderId = null;
    // Due in the last quarter of the year: not yet reached on this earlier day.
    state.pendingElectionYear = DUE_YEAR + 0.75;
    state.year = DUE_YEAR;
    state.dayInYear = 10;
    state.tick = 10 * TICKS_PER_DAY - 1;
    state.lastElectionYear = -1;

    gameTick(state);

    expect(state.electionCeremony).toBeFalsy();
    expect(state.pendingElectionYear).toBe(DUE_YEAR + 0.75);
  });
});
/**
 * A vacant leadership campaign starts on its due date, not at a year rollover: the daily layer
 * evaluates the vacancy every day and compares the fractional year against the stored due date.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { getColonyDay } from '../src/game/dayCycle';
import { LEADER_OCCUPATION } from '../src/game/gameTypes';

/** A vacant office leaves no leader label on a living settler: the invariant enforces that. */
function vacateOffice(state: ReturnType<typeof initGame>): void {
  state.villageLeaderId = null;
  for (const person of state.entities) {
    if (person.alive && person.occupation === LEADER_OCCUPATION) person.occupation = undefined;
  }
}

const FIXTURE_SEED = 20240913;
/** Year 4, day 40: the due date 4.083 has passed, but this is not a year rollover. */
const DUE_YEAR = 4;
const DUE_DAY = 40;

describe('a vacancy election campaign starts on its due day', () => {
  it('starts the ceremony mid-year when the campaign falls due', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    vacateOffice(state);
    state.pendingElectionYear = DUE_YEAR + 30 / DAYS_PER_YEAR;
    state.year = DUE_YEAR;
    state.dayInYear = DUE_DAY;
    state.tick = DUE_DAY * TICKS_PER_DAY + 18 * (TICKS_PER_DAY / 24) - 1; // world-event phase at 18:00
    state.lastElectionYear = -1;

    gameTick(state);

    expect(getColonyDay(state)).toBe(DUE_YEAR * DAYS_PER_YEAR + DUE_DAY);
    expect(state.electionCeremony).toBeTruthy();
    expect(state.pendingElectionYear).toBeNull();
  });

  it('starts nothing before the due date', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    vacateOffice(state);
    // Due in the last quarter of the year: not yet reached on this earlier day.
    state.pendingElectionYear = DUE_YEAR + 0.75;
    state.year = DUE_YEAR;
    state.dayInYear = 10;
    state.tick = 10 * TICKS_PER_DAY + 18 * (TICKS_PER_DAY / 24) - 1;
    state.lastElectionYear = -1;

    gameTick(state);

    expect(state.electionCeremony).toBeFalsy();
    expect(state.pendingElectionYear).toBe(DUE_YEAR + 0.75);
  });
});
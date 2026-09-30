/**
 * A second election in the same year gets its promises judged.
 *
 * Regression for audit M7 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`,
 * tracked in `LIVE-FINDINGS-STATUS.md`): every promise flag is keyed by *calendar year*
 * (`election_promises_<year>_0/1`, `…_eval_day`, `…_active_year`) **except** the "already judged"
 * marker `…_<year>_evaluated`. A mid-year succession — the leader dies after that year's term
 * election, so the reveal at `villageLeadership.ts:755` calls `recordElectionPromises` again with the
 * same year — overwrote the codes and the evaluation day while that marker stayed set. Both
 * `tickElectionPromises` and `getActiveElectionPromises` early-return on it, so the new promises were
 * permanently inert: no reputation swing, no panel. `recordElectionPromises` now clears the marker
 * with the promises it replaces, so each election carries its own evaluation window.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  EVAL_DAY_OFFSET,
  getActiveElectionPromises,
  recordElectionPromises,
  tickElectionPromises,
} from '../src/game/electionPromises';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;
/** The term election year; the succession below happens inside the same one. */
const YEAR = 7;

function world(): WorldState {
  const state = initGame({ villageName: 'Promises', size: 'medium', seed: FIXTURE_SEED });
  state.year = YEAR;
  state.dayInYear = 0;
  state.tick = YEAR * DAYS_PER_YEAR * TICKS_PER_DAY;
  return state;
}

/** Move to a colony day; `getColonyDay` is `year * DAYS_PER_YEAR + dayInYear`, so both are set. */
function setColonyDay(state: WorldState, colonyDay: number): void {
  state.year = Math.floor(colonyDay / DAYS_PER_YEAR);
  state.dayInYear = colonyDay % DAYS_PER_YEAR;
  state.tick = colonyDay * TICKS_PER_DAY;
}

describe('election promises survive a second election in the same year (M7)', () => {
  it('judges the promises of a mid-year succession', () => {
    const state = world();
    const termElectionDay = YEAR * DAYS_PER_YEAR;

    recordElectionPromises(state, YEAR);
    expect(getActiveElectionPromises(state), 'the term election has no open window').not.toBeNull();

    setColonyDay(state, termElectionDay + EVAL_DAY_OFFSET);
    tickElectionPromises(state);
    expect(getActiveElectionPromises(state), 'the term promises were not judged').toBeNull();

    // The leader dies and the succession reveal records promises for the same year again.
    recordElectionPromises(state, YEAR);
    const active = getActiveElectionPromises(state);
    // Before the fix this is null: the stale `evaluated` marker suppresses the new window entirely.
    expect(active, 'the succession promises are inert — no window, so no panel and no judgement').not.toBeNull();
    expect(active?.daysRemaining, 'the succession window is not a fresh one').toBe(EVAL_DAY_OFFSET);

    // And they really are judged when that window closes.
    setColonyDay(state, termElectionDay + 2 * EVAL_DAY_OFFSET);
    tickElectionPromises(state);
    expect(getActiveElectionPromises(state), 'the succession promises were never judged').toBeNull();
  });
});

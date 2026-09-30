/**
 * The opening card "The valley wakes" is actually offered.
 *
 * Regression for audit M4 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`,
 * tracked in `LIVE-FINDINGS-STATUS.md`): `maybeOfferWelcome` required `year === 0 && dayInYear === 0`,
 * which no reachable tick satisfies. Verified on the tree rather than taken from the audit:
 *
 * - `getCalendarDay(tick)` is `floor(tick / TICKS_PER_DAY) % DAYS_PER_YEAR`, so `dayInYear === 0`
 *   recurs only at ticks 0, 25 920, 51 840 …
 * - the daily layer runs only at `tick % TICKS_PER_DAY === 0` (`gameTick.ts:223`) — the same ticks —
 *   and a world starts at tick 24, so tick 0 never happens;
 * - on every tick where `dayInYear === 0`, `yearRollover` is true, so `gameTick.ts:96` increments
 *   `state.year` **before** the daily layer runs.
 *
 * The beat therefore never fired in a real game, only in tests that called the function directly with
 * `dayInYear = 0`. Its `welcome` flag already made it once-only, so the gate only had to accept the
 * first day boundary a live game actually reaches.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;
/** `worldGen.initGame` starts the colony at 08:00 — mid-day, so the first daily tick is tick 72. */
const START_TICK = 24;

function freshWorld(): WorldState {
  return initGame({ villageName: 'Welcome', size: 'medium', seed: FIXTURE_SEED });
}

function tickTo(state: WorldState, tick: number): void {
  while (state.tick < tick) gameTick(state);
}

const welcomeEvents = (state: WorldState) =>
  state.pendingStoryEvents?.filter((e) => e.storyKey === 'welcome') ?? [];

describe('the year-0 welcome beat', () => {
  it('is offered on the first day boundary of a live game', () => {
    const state = freshWorld();
    expect([state.tick, state.year, state.dayInYear]).toEqual([START_TICK, 0, 0]);

    tickTo(state, TICKS_PER_DAY);

    // The world is still in year 0 — this is a day boundary, not a year rollover — so the caller's
    // `year === 0` gate is satisfied and only the beat's own day test stood in the way.
    expect([state.tick, state.year, state.dayInYear]).toEqual([TICKS_PER_DAY, 0, 1]);
    expect(state.storyFlags?.welcome).toBe(TICKS_PER_DAY);
    expect(welcomeEvents(state)).toHaveLength(1);
    expect(welcomeEvents(state)[0].title).toBe('The valley wakes');
  });

  it('is offered once, not once a day', () => {
    const state = freshWorld();
    tickTo(state, TICKS_PER_DAY);
    expect(state.storyFlags?.welcome).toBe(TICKS_PER_DAY);

    tickTo(state, TICKS_PER_DAY * 2);

    // A second offer would overwrite the flag with the later tick and queue a second card id.
    expect(state.storyFlags?.welcome).toBe(TICKS_PER_DAY);
    expect(state.pendingStoryEvents?.some((e) => e.id === `welcome_${TICKS_PER_DAY * 2}`)).toBe(false);
  });
});

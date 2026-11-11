/**
 * The opening card "The valley wakes" is offered at the first 18:00 world-events phase
 * a live game reaches, and only once.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY, TICKS_PER_HOUR, tickAtDailyPhase } from '../src/game/dayCycleClock';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;
/** `worldGen.initGame` starts at 08:00 (tick 96); the first world-events phase is 18:00. */
const START_TICK = 8 * TICKS_PER_HOUR;
const FIRST_WORLD_EVENT_TICK = tickAtDailyPhase(0, 'worldEvents');

function freshWorld(): WorldState {
  return initGame({ villageName: 'Welcome', size: 'medium', seed: FIXTURE_SEED });
}

function tickTo(state: WorldState, tick: number): void {
  while (state.tick < tick) gameTick(state);
}

const welcomeEvents = (state: WorldState) =>
  state.pendingStoryEvents?.filter((e) => e.storyKey === 'welcome') ?? [];

describe('the year-0 welcome beat', () => {
  it('is offered on the first 18:00 world-events phase of a live game', () => {
    const state = freshWorld();
    expect([state.tick, state.year, state.dayInYear]).toEqual([START_TICK, 0, 0]);

    tickTo(state, FIRST_WORLD_EVENT_TICK);

    // The world is still in year 0 — this is the first evening phase, not a year rollover — so the caller's
    // `year === 0` gate is satisfied and only the beat's own day test stood in the way.
    expect([state.tick, state.year, state.dayInYear]).toEqual([FIRST_WORLD_EVENT_TICK, 0, 0]);
    expect(state.storyFlags?.welcome).toBe(FIRST_WORLD_EVENT_TICK);
    expect(welcomeEvents(state)).toHaveLength(1);
    expect(welcomeEvents(state)[0].title).toBe('The valley wakes');
  });

  it('is offered once, not once a day', () => {
    const state = freshWorld();
    tickTo(state, FIRST_WORLD_EVENT_TICK);
    expect(state.storyFlags?.welcome).toBe(FIRST_WORLD_EVENT_TICK);

    tickTo(state, TICKS_PER_DAY * 2);

    // A second offer would overwrite the flag with the later tick and queue a second card id.
    expect(state.storyFlags?.welcome).toBe(FIRST_WORLD_EVENT_TICK);
    expect(state.pendingStoryEvents?.some((e) => e.id === `welcome_${tickAtDailyPhase(2, 'worldEvents')}`)).toBe(false);
  });
});

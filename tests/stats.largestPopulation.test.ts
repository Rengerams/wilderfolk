/**
 * `largestPopulation` tracks the true peak with a running max on every tick, not the
 * year-end sample in `yearlyStats.population.humans`.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';

describe('largestPopulation tracks the running peak', () => {
  it('records the current population as the peak after a tick, without waiting for a year rollover', () => {
    const state = initGame({ seed: 20240913 });
    state.lifetimeStats.largestPopulation = { count: 0, year: 0 };

    gameTick(state);

    expect(state.humanPopulation).toBeGreaterThan(0);
    expect(state.lifetimeStats.largestPopulation.count).toBe(state.humanPopulation);
    expect(state.lifetimeStats.largestPopulation.year).toBe(state.year);
  });

  it('does not shrink when a later tick has a smaller population', () => {
    const state = initGame({ seed: 20240913 });
    gameTick(state);
    const peak = state.lifetimeStats.largestPopulation.count;
    expect(peak).toBeGreaterThan(0);

    state.lifetimeStats.largestPopulation = { count: peak + 5, year: state.year };
    gameTick(state);

    expect(state.lifetimeStats.largestPopulation.count).toBe(peak + 5);
  });
});

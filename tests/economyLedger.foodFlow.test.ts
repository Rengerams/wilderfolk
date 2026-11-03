import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { getRecentFoodFlow, rollEconomyLedgerForDay } from '../src/game/economyLedger';

const sample = (day: number, produced: number, consumed: number) => ({
  day, produced: { farms: produced }, consumed: { meals: consumed },
});

describe('measured food flow for colony planning', () => {
  it('averages only contiguous completed days, including actual consumption', () => {
    const state = {
      tick: 4 * TICKS_PER_DAY,
      foodHistory: [sample(1, 20, 10), sample(2, 30, 20), sample(3, 40, 30)],
    } as Pick<WorldState, 'tick' | 'foodHistory'>;
    expect(getRecentFoodFlow(state)).toEqual({
      days: 3,
      producedPerDay: 30,
      consumedPerDay: 20,
      netPerDay: 10,
    });
  });

  it('refuses to guess a supply trend from sparse, stale or current-day records', () => {
    const state = {
      tick: 5 * TICKS_PER_DAY,
      foodHistory: [sample(1, 20, 10), sample(2, 30, 20), sample(4, 40, 30)],
    } as Pick<WorldState, 'tick' | 'foodHistory'>;
    expect(getRecentFoodFlow(state)).toBeNull();
    state.foodHistory = [sample(2, 20, 10), sample(3, 30, 20), sample(5, 40, 30)];
    expect(getRecentFoodFlow(state)).toBeNull();
    state.foodHistory = [sample(2, 20, 10), sample(3, 30, 20), sample(4, 40, 30)];
    expect(getRecentFoodFlow(state)).not.toBeNull();
    state.foodHistory = undefined;
    expect(getRecentFoodFlow(state)).toBeNull();
  });

  it('archives an empty day instead of dropping it from the rolling history', () => {
    const state = {
      tick: 3 * TICKS_PER_DAY,
      foodHistory: [],
      economyLedger: { day: 2, produced: {}, consumed: {}, producedTotal: 0, consumedTotal: 0 },
    } as unknown as WorldState;

    rollEconomyLedgerForDay(state);

    expect(state.foodHistory).toEqual([{ day: 2, produced: {}, consumed: {} }]);
  });
});

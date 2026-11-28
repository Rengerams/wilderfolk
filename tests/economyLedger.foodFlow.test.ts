import { initGame } from '../src/game/worldGen';
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { getRecentFoodFlow, getProjectedFoodSupply, isProjectedFoodShortfall, rollEconomyLedgerForDay, recordFoodProduced, ECONOMY_SOURCE_LABELS } from '../src/game/economyLedger';

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

  it('anticipates a growing population while recorded production still exceeds consumption', () => {
    const state = {
      tick: 8 * TICKS_PER_DAY,
      foodHistory: Array.from({ length: 7 }, (_, index) =>
        sample(index + 1, 80, 40 + index * 5)),
    } as Pick<WorldState, 'tick' | 'foodHistory'>;
    expect(getRecentFoodFlow(state)?.netPerDay).toBeGreaterThan(0);
    expect(getProjectedFoodSupply(state, 60)).toEqual({
      days: 7, producedPerDay: 80, projectedNeedPerDay: 90,
    });
    expect(isProjectedFoodShortfall(state, 60, 0.05)).toBe(true);
    expect(isProjectedFoodShortfall(state, 15, 0.05)).toBe(true);
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

describe('economy ledger (L20 and source labels)', () => {
  it('rolls the raw ledger field at the day boundary and archives the finished day', () => {
    const state = initGame({ villageName: 'Testholm', size: 'medium', seed: 7 });
    state.tick = TICKS_PER_DAY * 10;
    recordFoodProduced(state, 'farms', 25);
    expect(state.economyLedger?.day).toBe(10);
    const historyBefore = state.foodHistory?.length ?? 0;

    state.tick = TICKS_PER_DAY * 11;
    rollEconomyLedgerForDay(state);

    expect(state.economyLedger?.day).toBe(11);
    expect(state.economyLedger?.produced).toEqual({});
    expect(state.economyLedger?.consumed).toEqual({});
    expect(state.foodHistory?.length).toBe(historyBefore + 1);
    const history = state.foodHistory ?? [];
    expect(history[history.length - 1]).toEqual({
      day: 10,
      produced: { farms: 25 },
      consumed: {},
    });

    // Idempotent: a second call in the same day must not archive again.
    rollEconomyLedgerForDay(state);
    expect(state.foodHistory?.length).toBe(historyBefore + 1);
  });

  it('labels every food source the simulation records', () => {
    // Sources passed to recordFoodProduced/recordFoodConsumed in src/game.
    const recordedSources = ['farms', 'hunting', 'fishing', 'greenhouse', 'silos', 'challenges', 'meals', 'medicine'];
    for (const source of recordedSources) {
      expect(ECONOMY_SOURCE_LABELS[source], `missing ledger label for "${source}"`).toBeTruthy();
    }
  });
});

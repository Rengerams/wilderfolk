/**
 * `totalResourcesGathered` follows `addResource`'s accepted gain (four keys, no iron), and
 * `mostProductiveYear` is settled at the year boundary.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { addResource } from '../src/game/resourceUtils';
import { recordYearlyStats, updateLifetimeStats } from '../src/game/stats';

const FIXTURE_SEED = 20_260_929;

describe('lifetime gathering is recorded where storage accepts it', () => {
  it('adds each accepted gain to the matching resource', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    expect(state.lifetimeStats.totalResourcesGathered).toEqual({ wood: 0, stone: 0, food: 0, gold: 0 });

    addResource(state, 'wood', 120);
    addResource(state, 'food', 45);
    addResource(state, 'stone', 7);

    expect(state.lifetimeStats.totalResourcesGathered).toEqual({
      wood: 120,
      stone: 7,
      food: 45,
      gold: 0,
    });
  });

  it('records the amount storage accepted, not the amount offered', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    // Half of the offered wood fits, so the record must move by exactly the accepted half.
    state.resources.wood = state.storageMax.wood - 50;

    expect(addResource(state, 'wood', 200)).toBe(50);
    expect(state.lifetimeStats.totalResourcesGathered.wood).toBe(50);
  });

  it('leaves the record alone when nothing is accepted, and never records iron', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.resources.gold = state.storageMax.gold;

    expect(addResource(state, 'gold', 500)).toBe(0);
    addResource(state, 'wood', 0);
    addResource(state, 'wood', -30);
    addResource(state, 'iron', 25);

    expect(state.lifetimeStats.totalResourcesGathered).toEqual({ wood: 0, stone: 0, food: 0, gold: 0 });
  });
});

describe('the most productive year is settled at the year boundary', () => {
  it('takes the year with the most completions, not the latest one', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.yearlyStats = [
      { ...recordYearlyStats(state, 0), year: 0, buildings: { completed: 12, total: 12, upgraded: 0, upgradedTotal: 0 } },
      { ...recordYearlyStats(state, 1), year: 1, buildings: { completed: 40, total: 52, upgraded: 0, upgradedTotal: 0 } },
      { ...recordYearlyStats(state, 2), year: 2, buildings: { completed: 3, total: 55, upgraded: 0, upgradedTotal: 0 } },
    ];

    const lifetime = updateLifetimeStats(state, state.lifetimeStats);

    expect(lifetime.mostProductiveYear).toEqual({ year: 1, buildings: 40 });
  });

  it('keeps the empty record when no year completed a building', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.yearlyStats = [
      { ...recordYearlyStats(state, 0), year: 0, buildings: { completed: 0, total: 0, upgraded: 0, upgradedTotal: 0 } },
    ];

    const lifetime = updateLifetimeStats(state, state.lifetimeStats);

    expect(lifetime.mostProductiveYear).toEqual({ year: 0, buildings: 0 });
  });
});

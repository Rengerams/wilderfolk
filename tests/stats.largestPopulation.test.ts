import { finishedBuilding } from '../src/test/factories';
import { BuildingType } from '../src/game/gameTypes';
import { recordYearlyStats } from '../src/game/stats';
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

    expect(state.lifetimeStats.largestPopulation).toEqual({ count: peak + 5, year: state.year });
  });
});

describe('yearly statistics (L69)', () => {
  it('reports the per-year upgrade delta, not last year delta against the cumulative total', () => {
    const state = initGame({ villageName: 'Testholm', size: 'medium', seed: 7 });
    state.buildings = [finishedBuilding(1, BuildingType.House, { x: 100, y: 100, width: 60, height: 48, rotation: 0, level: 3 })];

    const year1 = recordYearlyStats(state, 1);
    state.yearlyStats.push(year1);
    const year2 = recordYearlyStats(state, 2);
    state.yearlyStats.push(year2);
    const year3 = recordYearlyStats(state, 3);

    expect(year1.buildings.upgraded).toBe(2);
    expect(year2.buildings.upgraded).toBe(0);
    expect(year3.buildings.upgraded).toBe(0);
    expect(year3.buildings.upgradedTotal).toBe(2);
  });
});

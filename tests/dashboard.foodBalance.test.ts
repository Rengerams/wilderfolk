/**
 * Dashboard food balance: `netFoodToday` derives from the ledger and its labels come from the ledger
 * owner's map, so spoilage is listed and no row prints a raw source key.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Season } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { applyFoodSpoilage } from '../src/game/economy';
import { collectDashboard } from '../src/game/dashboardData';
import { dailyFoodNeedForSettlers, ECONOMY_SOURCE_LABELS } from '../src/game/economyLedger';
import { Human } from '../src/game/gameConstants';

const FIXTURE_SEED = 20_260_917;

describe('the dashboard food balance accounts for spoilage (F2)', () => {
  it('lists spoilage among the swallowed food and subtracts it from the net line', () => {
    const state = initGame({ villageName: 'Dash', size: 'medium', seed: FIXTURE_SEED });
    state.resources.food = 1000;
    state.foodSpoilageRate = 0.02; // Spring → floor(1000 × 0.02) = 20

    applyFoodSpoilage(state, Season.Spring);
    const dashboard = collectDashboard(state);

    const spoiled = dashboard.foodBySourceConsumedToday.find((row) => row.label === 'spoilage');
    expect(spoiled?.amount, 'spoilage is the biggest sink in a mid-game larder').toBe(20);
    expect(dashboard.foodConsumedToday).toBeGreaterThanOrEqual(20);
    // The headline is derived, not restated — assert the identity the panel prints.
    expect(dashboard.netFoodToday).toBe(dashboard.foodProducedToday - dashboard.foodConsumedToday);
  });

  it('has a label for every source the ledger can produce', () => {
    // The view resolves rows through this map, so a missing key renders as the raw key to the player.
    for (const key of ['spoilage', 'greenhouse', 'medicine', 'chronicle', 'meals']) {
      expect(ECONOMY_SOURCE_LABELS[key], `${key} has no owner label`).toBeTruthy();
      expect(ECONOMY_SOURCE_LABELS[key]).not.toBe(key);
    }
  });

  it('projects each finished day’s consumed food beside its production', () => {
    const state = initGame({ villageName: 'Dash', size: 'medium', seed: FIXTURE_SEED });
    state.foodHistory = [
      { day: 10, produced: { farms: 30, hunting: 5 }, consumed: { meals: 20, spoilage: 3 } },
      { day: 11, produced: { farms: 35 }, consumed: { meals: 22 } },
    ];

    const days = collectDashboard(state).foodDays;

    expect(days[0]).toMatchObject({ day: 10, total: 35, consumed: 23, net: 12 });
    expect(days[1]).toMatchObject({ day: 11, total: 35, consumed: 22, net: 13 });
  });

  it('states the daily settler need and how long the store covers it', () => {
    const state = initGame({ villageName: 'Dash', size: 'medium', seed: FIXTURE_SEED });
    const headcount = collectDashboard(state).settlers.length;
    state.resources.food = 120;

    const dashboard = collectDashboard(state);
    const expectedNeed = headcount * Human.DAILY_FOOD_CONSUMPTION;

    expect(dailyFoodNeedForSettlers(headcount)).toBe(expectedNeed);
    expect(dashboard.foodNeedPerDay).toBe(expectedNeed);
    expect(dashboard.foodStoreDays).toBe(
      expectedNeed > 0 ? Math.round((120 / expectedNeed) * 10) / 10 : null,
    );
  });

  it('keeps the dashboard from growing a second label map', () => {
    // The copy that drifted; a source contract because the component needs a DOM tier this repo does
    // not run (`environment: 'node'`).
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/GameDashboard.tsx'),
      'utf8',
    );
    expect(src).toContain('ECONOMY_SOURCE_LABELS');
    expect(src).not.toMatch(/const SOURCE_LABELS/);
  });
});

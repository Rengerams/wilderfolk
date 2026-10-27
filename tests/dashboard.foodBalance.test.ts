/**
 * Audit F2 (`docs/private/audits/2026-09-16/playability-gamefeel.md`, tracked in
 * `LIVE-FINDINGS-STATUS.md`): *"The dashboard's 'Net food flow today' omits spoilage and contradicts
 * another line in the same panel."*
 *
 * Two halves, and they landed in different changes. The **headline** is
 * `netFoodToday: foodProducedToday - foodConsumedToday` (`dashboardData.ts`), so it was only ever
 * wrong because spoilage was never written to the ledger's consumed side — fixed as economy **L8**
 * (spoilage now records its loss under a `spoilage` key). The **labels** were a second defect: the
 * dashboard carried its own `SOURCE_LABELS` copy, missing `spoilage`, `greenhouse`, `medicine` and
 * `chronicle`, so those rows printed raw keys. It now reads the ledger owner's map.
 *
 * These cases cover both, from the projection outwards.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Season } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { applyFoodSpoilage } from '../src/game/economy';
import { collectDashboard } from '../src/game/dashboardData';
import { ECONOMY_SOURCE_LABELS } from '../src/game/economyLedger';

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

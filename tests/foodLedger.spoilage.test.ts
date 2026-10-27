/**
 * Audit L8 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`, tracked in
 * `LIVE-FINDINGS-STATUS.md`): food spoilage was the one sink that never reached the economy ledger.
 * `applyFoodSpoilage` removed up to 2 %/day (×1.3 summer, ×0.6 winter) and floated `-N food spoiled`,
 * while `recordFoodConsumed` was only ever called for `meals` and `medicine` — so the "why is my food
 * low?" panel could not reconcile produced − consumed against the real food delta.
 */
import { describe, expect, it } from 'vitest';
import { Season } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { applyFoodSpoilage } from '../src/game/economy';
import { ECONOMY_SOURCE_LABELS } from '../src/game/economyLedger';

const FIXTURE_SEED = 20_260_917;

describe('spoilage reaches the food ledger (L8)', () => {
  it('records exactly what it destroyed, as consumed', () => {
    const state = initGame({ villageName: 'Spoil', size: 'medium', seed: FIXTURE_SEED });
    state.resources.food = 1000;
    state.foodSpoilageRate = 0.02; // Spring multiplier is 1.0, so the loss is floor(1000 * 0.02)

    applyFoodSpoilage(state, Season.Spring);

    const lost = 1000 - state.resources.food;
    expect(lost).toBe(20);
    // Pre-fix the store lost 20 with no ledger row at all (`consumed` had only meals/medicine).
    expect(state.economyLedger?.consumed.spoilage).toBe(lost);
    expect(ECONOMY_SOURCE_LABELS.spoilage).toBeTruthy();
    // The panel's label map is what renders the row; an unknown key would print the raw key.
    expect(ECONOMY_SOURCE_LABELS.spoilage).not.toBe('spoilage');
  });
});

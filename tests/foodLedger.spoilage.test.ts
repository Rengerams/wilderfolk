/**
 * `applyFoodSpoilage` must record what it destroyed on the ledger's consumed side, and
 * `ECONOMY_SOURCE_LABELS` must name the `spoilage` source so the panel can render the row.
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
    // Spoilage is a `consumed.spoilage` ledger row — the store never shrinks untracked.
    expect(state.economyLedger?.consumed.spoilage).toBe(lost);
    expect(ECONOMY_SOURCE_LABELS.spoilage).toBeTruthy();
    // The panel's label map is what renders the row; an unknown key would print the raw key.
    expect(ECONOMY_SOURCE_LABELS.spoilage).not.toBe('spoilage');
  });
});

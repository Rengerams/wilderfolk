/** Retired camp selection must not reappear in the active view or the next save. */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createViewFromSave, mergeForSave } from '../src/game/viewState';

describe('retired camp selection', () => {
  it.each(['visitor:visitor_7_2', 'rival:R1'])('ignores legacy %s keys at the save boundary', (key) => {
    const world = initGame({ skipTerrain: true, width: 800, height: 600, seed: 5 });
    const view = createViewFromSave({ selectedCampKey: key, highlightedCampKey: key }, world);
    expect(view).not.toHaveProperty('selectedCampKey');
    expect(view).not.toHaveProperty('highlightedCampKey');
    const saved = mergeForSave(world, view);
    expect(saved).not.toHaveProperty('selectedCampKey');
    expect(saved).not.toHaveProperty('highlightedCampKey');
  });
});

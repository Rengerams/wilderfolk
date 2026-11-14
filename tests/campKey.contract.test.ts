/**
 * W-83: camp selection keys belong to on-map visitor camps only. Real visitor ids are strings, a
 * strategic rival is not an on-map camp, and a restored key must name a camp that still exists.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createViewFromSave } from '../src/game/viewState';
import type { WorldState } from '../src/game/gameTypes';

function worldWithVisitor(id: string): WorldState {
  const state = initGame({ skipTerrain: true, width: 800, height: 600, seed: 5 });
  state.visitorGroups = [{ id } as never];
  return state;
}

describe('camp selection keys', () => {
  it('restores a live visitor camp key with its string id', () => {
    const view = createViewFromSave(
      { selectedCampKey: 'visitor:visitor_7_2', highlightedCampKey: 'visitor:visitor_7_2' },
      worldWithVisitor('visitor_7_2'),
    );
    expect(view.selectedCampKey).toBe('visitor:visitor_7_2');
    expect(view.highlightedCampKey).toBe('visitor:visitor_7_2');
  });

  it('drops a strategic rival key and a stale visitor key', () => {
    const state = worldWithVisitor('visitor_7_2');
    const rival = createViewFromSave({ highlightedCampKey: 'rival:R1', selectedCampKey: 'rival:R1' }, state);
    expect(rival.selectedCampKey).toBeNull();
    expect(rival.highlightedCampKey).toBeNull();

    const stale = createViewFromSave(
      { selectedCampKey: 'visitor:visitor_99_0', highlightedCampKey: 'visitor:visitor_99_0' },
      state,
    );
    expect(stale.selectedCampKey).toBeNull();
    expect(stale.highlightedCampKey).toBeNull();
  });
});

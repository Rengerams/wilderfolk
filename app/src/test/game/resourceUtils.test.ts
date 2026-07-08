import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { addCappedResource } from '@/game/resourceUtils';

describe('addCappedResource', () => {
  it('does not corrupt resources when storageMax is missing a key', () => {
    const state = initGame();
    delete (state.storageMax as Partial<typeof state.storageMax>).wood;
    state.resources.wood = 10;

    const added = addCappedResource(state, 'wood', 25);

    expect(added).toBe(25);
    expect(state.resources.wood).toBe(35);
    expect(Number.isFinite(state.resources.wood)).toBe(true);
  });
});
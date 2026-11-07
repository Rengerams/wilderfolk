/**
 * The Invention Fair's dismantle refund goes through `addCappedResource`, so it never pushes
 * wood past `storageMax`; the fixture seeds the persisted `funded` status flag for stage 2.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { resolveInventionFair } from '../src/game/inventionFair';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;
/** `inventionFair.STATUS.funded` — the demonstration has run and the stage-2 card is answerable. */
const STATUS_FUNDED = 2;
/** `inventionFair.ts` — the timber a dismantle recovers. */
const RECOVERED_WOOD = 4;

function fundedWorld(): WorldState {
  const state = initGame({ villageName: 'Fair', size: 'medium', seed: FIXTURE_SEED });
  state.pendingStoryEvents = [];
  state.storyFlags = { invention_fair_status: STATUS_FUNDED };
  return state;
}

describe('the Invention Fair dismantle refund (L1)', () => {
  it('recovers the timber when there is room for it', () => {
    const state = fundedWorld();
    const before = state.resources.wood;

    expect(resolveInventionFair(state, 'dismantle')).toBe(true);

    expect(state.resources.wood).toBe(before + RECOVERED_WOOD);
  });

  it('does not push wood past the storage cap', () => {
    const state = fundedWorld();
    // Stock at the cap is legitimate, so the refund can only be the part that fits — nothing here.
    state.resources.wood = state.storageMax.wood;

    expect(resolveInventionFair(state, 'dismantle')).toBe(true);

    expect(state.resources.wood).toBeLessThanOrEqual(state.storageMax.wood);
  });
});

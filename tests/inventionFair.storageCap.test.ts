/**
 * The Invention Fair's "dismantle" refund obeys the storage cap.
 *
 * Regression for audit L1 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`, tracked
 * in `LIVE-FINDINGS-STATUS.md`): the recover-timber branch was `state.resources.wood += 4`, a raw
 * write past `storageMax`. Nothing clamps resources *down*, so the cap stopped being authoritative and
 * the excess then fed the defects that assume stock is within it (the `Math.min` sites of M2 and
 * `canStoreImports`'s `current + amount > max` refusal). The sibling gains all go through
 * `addCappedResource`; this one now does too.
 *
 * The stage-2 answered path is reached by seeding the status flag the resolver dispatches on. That key
 * and its `funded` value are the persisted contract (`inventionFair.ts`), and stage 1 is already
 * covered through the public path by `tests/medium-C2-story.test.ts`, so this fixture seeds the status
 * rather than duplicating that setup.
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
    // Stock at the cap is a legitimate state — the very premise of M2 — so the refund must be the
    // part that fits, which here is nothing.
    state.resources.wood = state.storageMax.wood;

    expect(resolveInventionFair(state, 'dismantle')).toBe(true);

    expect(state.resources.wood).toBeLessThanOrEqual(state.storageMax.wood);
  });
});

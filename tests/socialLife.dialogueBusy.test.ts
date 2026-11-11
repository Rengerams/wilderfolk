/*
 * Social selection is busy when a visible chat line or an active paired dialogue session is live;
 * this is the shared availability contract for ambient, workplace and neighbour social behaviour.
 */
import { describe, expect, it } from 'vitest';
import { isDialogueBusy } from '../src/game/humanChat';

describe('dialogue-busy predicate', () => {
  it('treats an active visible line as busy', () => {
    expect(isDialogueBusy({ chatTicks: 1 })).toBe(true);
  });

  it('treats an active paired session as busy even when the visible line ended', () => {
    expect(isDialogueBusy({ chatTicks: 0, chatDialogueSessionKey: 'dialogue:1:2' })).toBe(true);
  });

  it('allows selection only when neither chat state is active', () => {
    expect(isDialogueBusy({ chatTicks: 0 })).toBe(false);
    expect(isDialogueBusy({})).toBe(false);
  });
});

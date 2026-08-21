/*
 * Dialogue-busy predicate regression — BUG 2026-08-20-dialogue-busy-predicate-missing.
 *
 * Social selection must treat both a visible chat line and an active paired
 * dialogue session as busy. This protects the shared availability contract used
 * by ambient, workplace, and neighbour social behavior.
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

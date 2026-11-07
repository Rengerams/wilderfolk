/**
 * A `patchUi` message carries a snapshot that can be several ticks stale, so the host adopts only the
 * fields the player authors and keeps the worker's own `bigNews`, `floatingTexts` and `activeEvent`.
 */
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { applyWorkerUiPatch } from '../src/game/simWorker/uiPatch';

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    bigNews: [{ id: 'worker-b1', title: 'A stranger arrives' }],
    floatingTexts: [{ id: 9, text: '+1 Settler arrived' }],
    activeEvent: { id: 'worker-e1', kind: 'raid' },
    nextFloatingTextId: 10,
    autoSave: true,
    dismissedBigNewsIds: [],
    dismissedNotificationIds: [],
    dismissedActiveEventIds: [],
    tutorialSeen: [],
    ...overrides,
  } as unknown as WorldState;
}

/** A patch composed from a snapshot taken before the in-flight tick wrote its presentation state. */
function stalePatch() {
  return {
    bigNews: [],
    floatingTexts: [],
    activeEvent: null,
    nextFloatingTextId: 4,
    autoSave: false,
    dismissedBigNewsIds: ['old-banner'],
    dismissedNotificationIds: ['old-toast'],
    dismissedActiveEventIds: [],
    tutorialSeen: ['intro'],
  } as unknown as Parameters<typeof applyWorkerUiPatch>[1];
}

describe('worker-side UI patch merge (F2)', () => {
  it('keeps worker-authored big news, floating texts and the active event', () => {
    const state = world();
    applyWorkerUiPatch(state, stalePatch());

    expect(state.bigNews).toHaveLength(1);
    expect(state.bigNews[0]?.id).toBe('worker-b1');
    expect(state.floatingTexts).toHaveLength(1);
    expect(state.activeEvent).not.toBeNull();
  });

  it('still adopts the fields the player authors', () => {
    const state = world();
    applyWorkerUiPatch(state, stalePatch());

    expect(state.autoSave).toBe(false);
    expect(state.dismissedBigNewsIds).toEqual(['old-banner']);
    expect(state.dismissedNotificationIds).toEqual(['old-toast']);
    expect(state.tutorialSeen).toEqual(['intro']);
  });

  it('never rewinds the floating-text id allocator', () => {
    const state = world({ nextFloatingTextId: 10 });
    applyWorkerUiPatch(state, stalePatch());
    expect(state.nextFloatingTextId).toBe(10);
  });

  it('accepts a higher floating-text id from the host', () => {
    const state = world({ nextFloatingTextId: 4 });
    applyWorkerUiPatch(state, { ...stalePatch(), nextFloatingTextId: 12 });
    expect(state.nextFloatingTextId).toBe(12);
  });
});

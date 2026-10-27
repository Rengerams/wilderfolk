/**
 * The dismissed-event ledger at the load boundary. `dismissedNotificationIds` is already pinned in
 * `saveLoad.elementShape`, so this file covers its sibling rule and nothing else.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

beforeEach(() => {
  resetSimRng();
});

afterEach(() => {
  resetSimRng();
});

describe('a loaded dismissed-event ledger', () => {
  it('refuses a ledger that is not a list, naming the field', () => {
    const payload = realPayload();
    payload.dismissedActiveEventIds = { raid: true };

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('dismissedActiveEventIds');
  });

  it('keeps the ids the payload carried', () => {
    const payload = realPayload();
    payload.dismissedActiveEventIds = ['raid-1', 'raid-2'];

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.dismissedActiveEventIds).toEqual(['raid-1', 'raid-2']);
  });
});

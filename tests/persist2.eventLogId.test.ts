/**
 * A saved event-log id must be a number the allocator can advance; a non-numeric id
 * would make the next id `NaN`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { logEvent, syncEventLogIdFromState } from '../src/game/eventLog';
import { resetSimRng } from '../src/game/simRng';
import { MapSize, type GameEventLog } from '../src/game/gameTypes';

let cachedPayload: Record<string, unknown> | null = null;

function realPayload(): Record<string, unknown> {
  cachedPayload ??= buildPayload();
  return structuredClone(cachedPayload);
}

function buildPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

/** The payload's own log, as the mutable JSON a hand-edited or crafted file carries. */
function savedLog(payload: Record<string, unknown>): Record<string, unknown>[] {
  const log = payload.eventLog;
  if (!Array.isArray(log) || log.length === 0) throw new Error('fixture payload has no event log');
  return log as Record<string, unknown>[];
}

afterEach(() => {
  resetSimRng();
});

describe('a saved event-log id must be a usable number', () => {
  it('refuses a non-numeric string id by name, and shows the NaN it prevents', () => {
    const payload = realPayload();
    savedLog(payload)[0].id = 'later';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('eventLog[0].id');

    // The mechanism, on the owner itself: only a loaded payload can put a string where
    // `GameEventLog.id` promises a number, which is why the guard lives at the boundary.
    const world = initGame({ skipTerrain: true, seed: 4242 });
    world.eventLog = [{ ...world.eventLog[0], id: 'later' } as unknown as GameEventLog];
    syncEventLogIdFromState(world);
    logEvent(world, 'event', 'logged after the bad id');
    expect(Number.isNaN(world.eventLog[0].id)).toBe(true);

    // Leave the module allocator at a number, so this case cannot poison a later one.
    syncEventLogIdFromState(initGame({ skipTerrain: true, seed: 1 }));
  });

  it('refuses a numeric string too, which the engine would key on by a different type', () => {
    const payload = realPayload();
    savedLog(payload)[0].id = '17';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('eventLog[0].id');
  });

  it('still loads the integer ids this build writes, so the refusals above bite', () => {
    const outcome = loadGameFromParsedOutcome(realPayload());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.eventLog.length).toBeGreaterThan(0);
    for (const entry of outcome.world.eventLog) {
      expect(Number.isSafeInteger(entry.id)).toBe(true);
    }
  });
});

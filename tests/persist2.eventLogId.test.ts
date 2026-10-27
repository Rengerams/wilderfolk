/**
 * A saved chronicle id must be a number the allocator can advance.
 *
 * The event log is the one `WorldState` container whose ids are numeric, and the load boundary's
 * shared element rule accepted a string id for every one of them. The allocator is
 * `Math.max(…ids) + 1`, so a non-numeric string id makes `nextEventLogId` `NaN` and every line the
 * colony logs afterwards carries a `NaN` id, which the log's own dedupe and merge keys cannot match.
 *
 * Each case corrupts one field of a real `buildSaveData` payload, so green means the guard bites
 * without refusing the world the payload came from. The final case is the differential: the same
 * refusals would be vacuous against a boundary that refused every save.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { logEvent, syncEventLogIdFromState } from '../src/game/eventLog';
import { resetSimRng } from '../src/game/simRng';
import type { GameEventLog } from '../src/game/gameTypes';

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
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
    const world = initGame({ seed: 4242 });
    world.eventLog = [{ ...world.eventLog[0], id: 'later' } as unknown as GameEventLog];
    syncEventLogIdFromState(world);
    logEvent(world, 'event', 'logged after the bad id');
    expect(Number.isNaN(world.eventLog[0].id)).toBe(true);

    // Leave the module allocator at a number, so this case cannot poison a later one.
    syncEventLogIdFromState(initGame({ seed: 1 }));
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

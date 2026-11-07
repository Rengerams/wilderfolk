/**
 * Event-log ids are derived from the log they are written to, so an imported log keeps
 * issuing increasing ids in every realm.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EVENT_LOG_MAX_ENTRIES, logEvent } from '../src/game/eventLog';
import type { GameEventLog } from '../src/game/gameTypes';

function entry(id: number): GameEventLog {
  return { id, tick: 1, year: 0, day: 0, type: 'event', message: `e${id}` };
}

describe('event-log ids never collide with ids the log already uses', () => {
  it('continues above an imported log instead of restarting at 1', () => {
    const state = initGame({ seed: 20240913 });
    // A save (or a worker import) whose log already runs up to 5000.
    state.eventLog = [entry(5000), entry(4999), entry(4998)];

    logEvent(state, 'event', 'first event in this realm');

    expect(state.eventLog[0].id).toBe(5001);
    expect(new Set(state.eventLog.map((e) => e.id)).size).toBe(state.eventLog.length);
  });

  it('keeps issuing increasing ids across successive writes', () => {
    const state = initGame({ seed: 20240913 });
    state.eventLog = [entry(120)];

    logEvent(state, 'event', 'a');
    logEvent(state, 'event', 'b');

    expect(state.eventLog[0].id).toBe(122);
    expect(state.eventLog[1].id).toBe(121);
  });

  it('still bounds the log length', () => {
    const state = initGame({ seed: 20240913 });
    state.eventLog = Array.from({ length: EVENT_LOG_MAX_ENTRIES }, (_, index) => entry(EVENT_LOG_MAX_ENTRIES - index));

    logEvent(state, 'event', 'overflow');

    expect(state.eventLog).toHaveLength(EVENT_LOG_MAX_ENTRIES);
    expect(state.eventLog[0].message).toBe('overflow');
  });
});
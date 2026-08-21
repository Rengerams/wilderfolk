/**
 * Regression: event logs are stored newest-first. Worker deltas must therefore
 * ship the newest bounded prefix and merge it ahead of the main-thread history.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import type { GameEventLog } from '../src/game/gameTypes';
import { applySimTickDelta, simTickDeltaFromWorld, EVENT_LOG_DELTA_TAIL_MAX } from '../src/game/simBuffers/simDelta';

function makeEvent(id: number): GameEventLog {
  return {
    id,
    tick: id,
    year: 0,
    day: id,
    type: 'event',
    message: `Chronicle event ${id}`,
  };
}

describe('worker event-log delta propagation', () => {
  it('sends and merges the newest bounded events without duplicates or order reversal', () => {
    const workerWorld = initGame({ villageName: 'WorkerLog', size: 'small' });
    const mainWorld = initGame({ villageName: 'MainLog', size: 'small' });
    const allEvents = Array.from({ length: EVENT_LOG_DELTA_TAIL_MAX + 2 }, (_, index) =>
      makeEvent(EVENT_LOG_DELTA_TAIL_MAX + 2 - index),
    );

    // The main thread has the two events that existed before the worker logged
    // the newest bounded prefix. Event logs are newest-first by contract.
    workerWorld.eventLog = allEvents;
    mainWorld.eventLog = allEvents.slice(-2);

    const delta = simTickDeltaFromWorld(workerWorld);
    applySimTickDelta(mainWorld, delta);

    expect(delta.eventLogTail.map((event) => event.id)).toEqual(
      allEvents.slice(0, EVENT_LOG_DELTA_TAIL_MAX).map((event) => event.id),
    );
    expect(mainWorld.eventLog.map((event) => event.id)).toEqual(allEvents.map((event) => event.id));

    // A duplicate worker delta must be idempotent.
    applySimTickDelta(mainWorld, delta);
    expect(mainWorld.eventLog.map((event) => event.id)).toEqual(allEvents.map((event) => event.id));
  });
});

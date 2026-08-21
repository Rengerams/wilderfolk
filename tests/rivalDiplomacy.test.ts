import { describe, expect, it } from 'vitest';
import { tickPendingDiplomacyEvents } from '../src/game/groupEvents';
import type { WorldState } from '../src/game/gameTypes';

function stateWithEvents(tick: number, pendingDiplomacyEvents: WorldState['pendingDiplomacyEvents']): WorldState {
  return {
    tick,
    year: 1,
    dayInYear: 12,
    eventLog: [],
    pendingDiplomacyEvents,
  } as unknown as WorldState;
}

describe('R3 rival diplomacy expiry contract', () => {
  it('expires events at the explicit absolute expiry tick', () => {
    const state = stateWithEvents(100, [{
      id: 'dip_explicit', rivalId: 'r1', rivalName: 'North Camp', kind: 'tribute',
      title: 'A demand', description: 'Food requested.', emoji: '📜', choices: [],
      createdAtTick: 1, expiresAtTick: 100,
    }]);
    tickPendingDiplomacyEvents(state);
    expect(state.pendingDiplomacyEvents).toHaveLength(0);
    expect(state.eventLog[0]?.message).toContain('diplomacy message faded');
  });

  it('keeps a legacy event until its fourteen-day fallback expires', () => {
    const state = stateWithEvents(14 * 72 - 1, [{
      id: 'dip_legacy', rivalId: 'r1', rivalName: 'North Camp', kind: 'tribute',
      title: 'A demand', description: 'Food requested.', emoji: '📜', choices: [],
      createdAtTick: 0,
    }]);
    tickPendingDiplomacyEvents(state);
    expect(state.pendingDiplomacyEvents).toHaveLength(1);
  });

  it('removes an expired event without changing player resources', () => {
    const state = stateWithEvents(200, [{
      id: 'dip_stale', rivalId: 'r1', rivalName: 'North Camp', kind: 'peace_treaty',
      title: 'A truce', description: 'Truce requested.', emoji: '🕊️', choices: [],
      createdAtTick: 1, expiresAtTick: 2,
    }]);
    (state as unknown as { resources: { food: number; gold: number } }).resources = { food: 40, gold: 20 };
    tickPendingDiplomacyEvents(state);
    expect(state.pendingDiplomacyEvents).toHaveLength(0);
    expect((state as unknown as { resources: { food: number; gold: number } }).resources).toEqual({ food: 40, gold: 20 });
  });
});

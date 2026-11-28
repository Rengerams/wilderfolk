import { resetSimRng } from '../src/game/simRng';
import { describe, expect, it, afterEach } from 'vitest';
import { getPeaceTreatyEligibility, getRivalTradePactEligibility, tickPendingDiplomacyEvents, getDiplomacyChoiceEligibility, respondToDiplomacyEvent } from '../src/game/rivalDiplomacy';
import type { WorldState, DiplomacyEvent, RivalSettlement } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

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
    const state = stateWithEvents(14 * TICKS_PER_DAY - 1, [{
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

describe('peace treaty eligibility', () => {
  it('rejects an already-active truce before charging resources or repeating AI action', () => {
    const world = {
      rivalSettlements: [{ id: 'r1', relationship: 'neutral', peaceTreatyDays: 45 }],
      resources: { gold: 10000, food: 10000 },
    } as unknown as WorldState;
    expect(getPeaceTreatyEligibility(world, 'r1')).toEqual({
      ok: false, blockReason: 'Peace treaty already active',
    });
    // Peace should not accidentally block unrelated trade-pact eligibility.
    expect(getRivalTradePactEligibility(world, 'r1').ok).toBe(true);
    world.rivalSettlements[0]!.peaceTreatyDays = 0;
    expect(getPeaceTreatyEligibility(world, 'r1').ok).toBe(true);
  });
});

describe('Diplomacy answer eligibility', () => {
  afterEach(resetSimRng);

  describe('L33 — the diplomacy resolver answers through the eligibility owner', () => {
    it('leaves an unaffordable answer open while preserving the owner block reason', () => {
      const state = diplomacyWorld('tribute', 10, 0);
      const event = state.pendingDiplomacyEvents![0];
      expect(getDiplomacyChoiceEligibility(state, event, 'pay')).toMatchObject({
        ok: false,
        blockReason: 'Need 30🍖',
      });

      const next = respondToDiplomacyEvent(state, event.id, 'pay');

      expect(next.resources.food).toBe(10);
      expect(next.pendingDiplomacyEvents).toHaveLength(1);
    });

    it('applies the owner gate to the non-resource militia answer too', () => {
      const state = diplomacyWorld('border_dispute', 100, 100);
      const event = state.pendingDiplomacyEvents![0];
      expect(getDiplomacyChoiceEligibility(state, event, 'militia')).toMatchObject({
        ok: false,
        blockReason: 'Need spears',
      });

      const next = respondToDiplomacyEvent(state, event.id, 'militia');

      expect(next.pendingDiplomacyEvents).toHaveLength(1);
    });

    it('pays exactly once when the owner says the answer is affordable', () => {
      const state = diplomacyWorld('tribute', 40, 0);
      const event = state.pendingDiplomacyEvents![0];
      expect(getDiplomacyChoiceEligibility(state, event, 'pay').ok).toBe(true);

      const next = respondToDiplomacyEvent(state, event.id, 'pay');

      expect(next.resources.food).toBe(10);
      expect(next.pendingDiplomacyEvents).toHaveLength(0);
    });
  });

  function diplomacyWorld(
    kind: DiplomacyEvent['kind'],
    food: number,
    gold: number,
  ): WorldState {
    const event = {
      id: 'dip_1',
      rivalId: 'r1',
      rivalName: 'North Camp',
      kind,
      title: 'A demand',
      description: 'Food requested.',
      emoji: '📜',
      choices: [],
      createdAtTick: 0,
      expiresAtTick: 1000,
    } as DiplomacyEvent;
    const rival = {
      id: 'r1',
      name: 'North Camp',
      campX: 100,
      campY: 100,
      population: 4,
      relationship: 'neutral',
      foundedYear: 0,
      daysUntilAction: 0,
      raidCooldownDays: 0,
      peaceTreatyDays: 0,
    } as unknown as RivalSettlement;

    return {
      tick: 10,
      resources: { wood: 0, stone: 0, food, gold, iron: 0 },
      storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 500 },
      villageReputation: 50,
      humanPopulation: 0,
      unlockedTechs: [],
      researchNodes: [],
      villageForge: { activeOrder: null, progress: 0, completed: {} },
      floatingTexts: [],
      nextFloatingTextId: 1,
      bigNews: [],
      eventLog: [],
      pendingDiplomacyEvents: [event],
      rivalSettlements: [rival],
      buildings: [],
      entities: [],
    } as unknown as WorldState;
  }
});

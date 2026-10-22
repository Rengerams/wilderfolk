/**
 * Regression: worker-command validation allow-lists drifted from the source
 * unions/catalogs — `queueForgeOrder` rejected `iron_swords` / `scale_mail` /
 * `tower_ballistae` and `tradeWithVisitors` rejected `sell_wood`, so those
 * player actions silently no-op'd (both main-thread and worker paths).
 *
 * These tests pin the validator to the real catalogs (FORGE_ORDERS /
 * VISITOR_TRADE_COSTS) so any future order/action addition fails the gate
 * unless the validator accepts it too.
 */
import { describe, expect, it } from 'vitest';
import { isWorkerCommand } from '../src/game/simWorker/commands';
import { FORGE_ORDERS } from '../src/game/forge';
import { VISITOR_TRADE_COSTS, type VisitorTradeAction } from '../src/game/groupEvents';

describe('worker command validation parity', () => {
  it('accepts every forge order in FORGE_ORDERS', () => {
    expect(FORGE_ORDERS.length).toBeGreaterThan(0);
    for (const order of FORGE_ORDERS) {
      expect(
        isWorkerCommand({ proto: 1, op: 'queueForgeOrder', buildingId: 1, orderId: order.id }),
        `queueForgeOrder ${order.id} should be valid`,
      ).toBe(true);
    }
  });

  it('accepts every visitor trade action in VISITOR_TRADE_COSTS', () => {
    expect(Object.keys(VISITOR_TRADE_COSTS).length).toBeGreaterThan(0);
    for (const action of Object.keys(VISITOR_TRADE_COSTS) as VisitorTradeAction[]) {
      expect(
        isWorkerCommand({ proto: 1, op: 'tradeWithVisitors', groupId: 'g1', action }),
        `tradeWithVisitors ${action} should be valid`,
      ).toBe(true);
    }
  });

  it('accepts surrender decisions sent by the battle-report buttons', () => {
    for (const choiceId of ['mercy', 'tribute', 'raze']) {
      expect(
        isWorkerCommand({ proto: 1, op: 'resolveRaidVictory', eventId: 'raid-123', choiceId }),
        `resolveRaidVictory ${choiceId} must reach the worker`,
      ).toBe(true);
    }
    expect(isWorkerCommand({ proto: 1, op: 'resolveRaidVictory', eventId: '', choiceId: 'raze' })).toBe(false);
    expect(isWorkerCommand({ proto: 1, op: 'resolveRaidVictory', eventId: 'raid-123', choiceId: '' })).toBe(false);
  });

  it('rejects unknown ops and unknown values', () => {
    expect(isWorkerCommand({ proto: 1, op: 'queueForgeOrder', buildingId: 1, orderId: 'bogus_order' })).toBe(false);
    expect(isWorkerCommand({ proto: 1, op: 'tradeWithVisitors', groupId: 'g1', action: 'bogus_action' })).toBe(false);
    expect(isWorkerCommand({ proto: 1, op: 'nonsense_op' })).toBe(false);
    expect(isWorkerCommand(null)).toBe(false);
  });
});
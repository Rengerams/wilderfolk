/**
 * Worker-command validation must accept every value in the source catalogs (FORGE_ORDERS): a validator allow-list that drifts silently no-ops the player action.
 */
import { describe, expect, it } from 'vitest';
import { isWorkerCommand } from '../src/game/simWorker/commands';
import { FORGE_ORDERS } from '../src/game/forge';

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

  it('rejects all retired on-map visitor commands', () => {
    for (const command of [
      { op: 'talkToVisitorLeader', groupId: 'legacy' },
      { op: 'tradeWithVisitors', groupId: 'legacy', action: 'buy_food' },
      { op: 'resolveVillageRequest', requestId: 'legacy', choice: 'accept' },
      { op: 'negotiateRefugees', groupId: 'legacy', choice: 'welcome' },
    ]) expect(isWorkerCommand({ proto: 1, ...command })).toBe(false);
  });

  it('rejects unknown ops and unknown values', () => {
    expect(isWorkerCommand({ proto: 1, op: 'queueForgeOrder', buildingId: 1, orderId: 'bogus_order' })).toBe(false);
    expect(isWorkerCommand({ proto: 1, op: 'tradeWithVisitors', groupId: 'g1', action: 'bogus_action' })).toBe(false);
    expect(isWorkerCommand({ proto: 1, op: 'nonsense_op' })).toBe(false);
    expect(isWorkerCommand(null)).toBe(false);
  });
});
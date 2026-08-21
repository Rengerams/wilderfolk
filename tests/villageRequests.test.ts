import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import type { VisitorGroup, WorldState } from '../src/game/gameTypes';
import {
  resolveVillageRequest,
  tickVillageRequests,
  VILLAGE_REQUEST_PROVISIONS_COST_GOLD,
  VILLAGE_REQUEST_PROVISIONS_FOOD,
  VILLAGE_REQUEST_PROVISIONS_REPUTATION,
} from '../src/game/groupEvents';
import { WORKER_CMD_PROTO, applyWorkerCommand, isWorkerCommand } from '../src/game/simWorker/commands';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { applySimTickDelta, simTickDeltaFromWorld } from '../src/game/simBuffers/simDelta';

function trader(overrides: Partial<VisitorGroup> = {}): VisitorGroup {
  return {
    id: 'trader-1',
    name: 'The Brass Kettle Caravan',
    kind: 'traders',
    campX: 320,
    campY: 280,
    daysLeft: 4,
    entityIds: [],
    giftsGiven: 0,
    tradesCompleted: 0,
    gold: 80,
    refugeeResolved: false,
    leaderTalked: false,
    ...overrides,
  };
}

function worldWithTrader(): WorldState {
  const state = initGame();
  state.visitorGroups = [trader()];
  state.villageRequestCooldownUntilDay = 0;
  state.villageRequestHistory = [];
  return state;
}

function offerWorld(): WorldState {
  const state = worldWithTrader();
  tickVillageRequests(state);
  expect(state.activeVillageRequest).toBeDefined();
  return state;
}

describe('Village Requests — Caravan Provisions Offer', () => {
  it('generates one readable offer from an eligible trader and never duplicates the active request', () => {
    const state = worldWithTrader();

    tickVillageRequests(state);
    const request = state.activeVillageRequest!;
    expect(request.kind).toBe('caravan_provisions');
    expect(request.sourceVisitorGroupId).toBe('trader-1');
    expect(request.sourceName).toBe('The Brass Kettle Caravan');
    expect(request.choices.map((choice) => choice.id)).toEqual(['accept', 'decline']);
    expect(request.expiresDay).toBeGreaterThan(request.createdDay);

    tickVillageRequests(state);
    expect(state.activeVillageRequest?.id).toBe(request.id);
    expect(state.eventLog.filter((event) => event.message.includes('offered caravan provisions'))).toHaveLength(1);
  });

  it('does not generate a request without a live trader or while a cooldown remains', () => {
    const noTrader = initGame();
    tickVillageRequests(noTrader);
    expect(noTrader.activeVillageRequest).toBeUndefined();

    const cooldown = worldWithTrader();
    cooldown.villageRequestCooldownUntilDay = 20;
    tickVillageRequests(cooldown);
    expect(cooldown.activeVillageRequest).toBeUndefined();
  });

  it('accepts through the shared worker command path with exact resources, reputation, history, and source result', () => {
    const state = offerWorld();
    const requestId = state.activeVillageRequest!.id;
    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;
    const reputationBefore = state.villageReputation;

    const next = applyWorkerCommand(state, {
      proto: WORKER_CMD_PROTO,
      op: 'resolveVillageRequest',
      requestId,
      choice: 'accept',
    });

    expect(next).not.toBe(state);
    expect(next.activeVillageRequest).toBeUndefined();
    expect(next.resources.gold).toBe(goldBefore - VILLAGE_REQUEST_PROVISIONS_COST_GOLD);
    expect(next.resources.food).toBe(foodBefore + VILLAGE_REQUEST_PROVISIONS_FOOD);
    expect(next.villageReputation).toBe(reputationBefore + VILLAGE_REQUEST_PROVISIONS_REPUTATION);
    expect(next.visitorGroups[0]?.tradesCompleted).toBe(1);
    expect(next.villageRequestHistory).toMatchObject([{ outcome: 'accepted', sourceName: 'The Brass Kettle Caravan' }]);
    expect(next.eventLog.some((event) => event.type === 'trade' && event.message.includes('Accepted'))).toBe(true);
  });

  it('keeps the request open when the player cannot pay or cannot store the offer', () => {
    const poor = offerWorld();
    poor.resources.gold = 0;
    const poorRequest = poor.activeVillageRequest!.id;
    const afterPoor = resolveVillageRequest(poor, poorRequest, 'accept');
    expect(afterPoor.activeVillageRequest?.id).toBe(poorRequest);
    expect(afterPoor.resources.gold).toBe(0);
    expect(afterPoor.villageRequestHistory).toEqual([]);

    const full = offerWorld();
    full.resources.food = full.storageMax.food - VILLAGE_REQUEST_PROVISIONS_FOOD + 1;
    const fullRequest = full.activeVillageRequest!.id;
    const afterFull = resolveVillageRequest(full, fullRequest, 'accept');
    expect(afterFull.activeVillageRequest?.id).toBe(fullRequest);
    expect(afterFull.resources.food).toBe(full.resources.food);
    expect(afterFull.villageRequestHistory).toEqual([]);
  });

  it('declines once, rejects a repeated stale command as a no-op, and expires an offer whose caravan leaves', () => {
    const state = offerWorld();
    const requestId = state.activeVillageRequest!.id;
    const declined = resolveVillageRequest(state, requestId, 'decline');
    expect(declined.activeVillageRequest).toBeUndefined();
    expect(declined.villageRequestHistory).toMatchObject([{ outcome: 'declined' }]);

    const repeated = resolveVillageRequest(declined, requestId, 'decline');
    expect(repeated).toBe(declined);
    expect(repeated.villageRequestHistory).toHaveLength(1);

    const expiring = offerWorld();
    expiring.visitorGroups = [];
    tickVillageRequests(expiring);
    expect(expiring.activeVillageRequest).toBeUndefined();
    expect(expiring.villageRequestHistory).toMatchObject([{ outcome: 'expired' }]);
  });

  it('validates the typed command and carries request state through worker prep and delta reconciliation', () => {
    const state = offerWorld();
    const request = state.activeVillageRequest!;
    expect(isWorkerCommand({
      proto: WORKER_CMD_PROTO,
      op: 'resolveVillageRequest',
      requestId: request.id,
      choice: 'accept',
    })).toBe(true);
    expect(isWorkerCommand({
      proto: WORKER_CMD_PROTO,
      op: 'resolveVillageRequest',
      requestId: request.id,
      choice: 'invent_reward',
    })).toBe(false);

    const prepTarget = initGame();
    applySimPrep(prepTarget, extractSimPrep(state));
    expect(prepTarget.activeVillageRequest).toEqual(request);
    expect(prepTarget.villageRequestHistory).toEqual([]);

    const deltaTarget = initGame();
    applySimTickDelta(deltaTarget, simTickDeltaFromWorld(state));
    expect(deltaTarget.activeVillageRequest).toEqual(request);
    expect(deltaTarget.villageRequestCooldownUntilDay).toBe(state.villageRequestCooldownUntilDay);
  });
});

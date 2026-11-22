/**
 * A completed trade round trip must credit every resource the route says it receives, including
 * Ironport's iron, which `applyImports` and `canStoreImports` must both carry.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import { ensureFullTradeRoutes, initTradeRoutes } from '../src/game/economy';
import { enrichTradeRoute, getCaravanMoveTarget, tryAdvanceCaravanLeg } from '../src/game/tradeCaravans';
import type { Entity, TradeRoute, WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;

/** `initGame` leaves the route table empty — the app seeds it when the world is created. */
function freshWorld(): WorldState {
  const state = initGame({ villageName: 'Trade', size: 'medium', seed: FIXTURE_SEED });
  state.tradeRoutes = ensureFullTradeRoutes(initTradeRoutes());
  return state;
}

function route(state: WorldState, id: string): TradeRoute {
  const found = (state.tradeRoutes ?? []).find((r) => r.id === id);
  if (!found) throw new Error(`fixture has no route ${id}`);
  return found;
}

/** An active Ironport route with a living carrier on the given leg. */
function caravanOn(state: WorldState, id: string, leg: TradeRoute['caravanLeg']): Entity {
  const r = route(state, id);
  r.active = true;
  r.partnerX = 50;
  r.partnerY = 50;
  // The systems owner performs this normalization before running a live caravan.
  enrichTradeRoute(r, state, state.tradeRoutes.indexOf(r));
  r.caravanLeg = leg;
  r.caravanWaitTicks = 0;
  const carrier = createEntity(EntityType.Human, 50, 50, state.nextEntityId++, 300, false, {
    name: 'Ironport trader',
  });
  carrier.alive = true;
  carrier.faction = 'trade_caravan';
  carrier.groupId = id;
  state.entities.push(carrier);
  r.caravanCarrierId = carrier.id;
  return carrier;
}

describe('a trade round trip credits everything the route advertises', () => {
  it('Ironport pays the iron it advertises', () => {
    const state = freshWorld();
    const carrier = caravanOn(state, 'trade_3', 'inbound');

    // Park the carrier on the home hub — the inbound leg measures the distance to it.
    const target = getCaravanMoveTarget(state, carrier);
    expect(target).not.toBeNull();
    carrier.x = target!.x;
    carrier.y = target!.y;

    state.resources.iron = 0;
    state.resources.gold = 0;
    state.storageMax.iron = 500;
    state.storageMax.gold = 500;

    tryAdvanceCaravanLeg(state, carrier);

    expect(route(state, 'trade_3').caravansCompleted).toBe(1);
    // The gold figure also pins this fixture's multiplier at 1 (no trade research, no Town
    // Hall), which is what makes the iron figure below exact rather than "greater than zero".
    expect(state.resources.gold).toBe(30);
    expect(state.resources.iron).toBe(15);
  });

  it('keeps inbound cargo on the carrier when storage fills during the return trip', () => {
    const state = freshWorld();
    const carrier = caravanOn(state, 'trade_3', 'at_partner');
    const trade = route(state, 'trade_3');

    state.resources.iron = 0;
    state.resources.gold = 0;
    state.storageMax.iron = 500;
    state.storageMax.gold = 500;
    tryAdvanceCaravanLeg(state, carrier); // partner accepts the planned shipment
    expect(trade.caravanLeg).toBe('inbound');

    const home = getCaravanMoveTarget(state, carrier)!;
    carrier.x = home.x;
    carrier.y = home.y;
    state.resources.iron = 500; // iron filled while the carrier was travelling
    tryAdvanceCaravanLeg(state, carrier);
    expect(trade.caravanLeg).toBe('inbound');
    expect(trade.caravansCompleted).toBe(0);
    expect(trade.caravanWaitTicks).toBeGreaterThan(0);
    expect(state.resources.iron).toBe(500);
    expect(state.resources.gold).toBe(0); // neither cargo nor reward is applied partially

    state.resources.iron = 480;
    trade.caravanWaitTicks = 0; // retry after the cooldown
    tryAdvanceCaravanLeg(state, carrier);
    expect(trade.caravansCompleted).toBe(1);
    expect(trade.caravanCarrierId).toBeUndefined();
    expect(state.resources.iron).toBe(495);
    expect(state.resources.gold).toBe(30);
  });

  it('makes the caravan wait when the iron store is full, instead of dropping the cargo', () => {
    const state = freshWorld();
    const carrier = caravanOn(state, 'trade_3', 'at_partner');

    state.storageMax.iron = 100;
    state.resources.iron = 100; // no headroom for the 15 iron
    state.storageMax.gold = 500;
    state.resources.gold = 0;

    tryAdvanceCaravanLeg(state, carrier);

    expect(route(state, 'trade_3').caravanLeg).toBe('at_partner');
    expect(state.resources.iron).toBe(100);
  });
});

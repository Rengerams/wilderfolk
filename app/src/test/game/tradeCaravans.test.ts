import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { establishTradeRoute, initTradeRoutes } from '@/game/economy';
import {
  getTradeHubCenter,
  tickTradeCaravans,
  tryAdvanceCaravanLeg,
} from '@/game/tradeCaravans';
import { EntityType } from '@/game/gameTypes';

describe('trade caravans', () => {
  it('spawns a walking merchant after a route is established', () => {
    const state = initGame();
    state.tradeRoutes = initTradeRoutes();
    state.villageReputation = 50;
    state.resources = { wood: 200, stone: 200, food: 200, gold: 200 };
    const next = establishTradeRoute(state, 'trade_1');
    const route = next.tradeRoutes.find((r) => r.id === 'trade_1')!;
    expect(route.active).toBe(true);
    expect(route.nextDepartureTick).toBeDefined();

    next.tick = route.nextDepartureTick!;
    tickTradeCaravans(next);
    const carrier = next.entities.find((e) => e.id === route.caravanCarrierId);
    expect(carrier?.faction).toBe('trade_caravan');
    expect(carrier?.alive).toBe(true);
  });

  it('completes a round-trip and grants gold at the village hub', () => {
    const state = initGame();
    state.tradeRoutes = initTradeRoutes().map((r) =>
      r.id === 'trade_1' ? { ...r, active: true, partnerX: 120, partnerY: 120, caravanLeg: 'inbound' as const } : r,
    );
    const route = state.tradeRoutes.find((r) => r.id === 'trade_1')!;
    const hub = getTradeHubCenter(state);
    const carrier = state.entities.find((e) => e.type === EntityType.Human && e.faction !== 'visitor');
    if (!carrier) throw new Error('no settler');
    carrier.faction = 'trade_caravan';
    carrier.groupId = 'trade_1';
    carrier.x = hub.x;
    carrier.y = hub.y;
    route.caravanCarrierId = carrier.id;
    state.resources = { wood: 200, stone: 200, food: 200, gold: 0 };

    tryAdvanceCaravanLeg(state, carrier);

    expect(state.entities.some((e) => e.id === carrier.id)).toBe(false);
    expect(route.caravanCarrierId).toBeUndefined();
    expect(route.caravansCompleted).toBe(1);
    expect(state.lifetimeStats.tradeCaravansCompleted).toBe(1);
    expect(state.resources.gold).toBeGreaterThan(0);
  });
});
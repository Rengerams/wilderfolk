/**
 * Trade routes must not be able to leave a colony trapped.
 *
 * Every route used to *export* materials for coin, so a colony with coin but no wood or
 * stone had no way back — and nothing a colony builds is free, so the trap was total. Two
 * things fix it: routes that buy materials with coin, and the purchase route being
 * establishable without a Market (a Market costs 50 wood and 20 stone, the very materials
 * the trapped colony is out of).
 */
import { describe, expect, it } from 'vitest';
import { ensureFullTradeRoutes, initTradeRoutes } from '../src/game/economy';
import { canEstablishTradeRoute, isMaterialPurchaseRoute } from '../src/game/tradeCaravans';
import { initGame } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';

/** The App's own wiring: a new game starts with the full route list. */
function withRoutes() {
  const world = initGame({ size: MapSize.Medium, seed: 4242 });
  world.tradeRoutes = ensureFullTradeRoutes(initTradeRoutes());
  return world;
}

describe('trade route bootstrap', () => {
  it('offers a coin → wood route available from the first day', () => {
    const routes = initTradeRoutes();
    const buysWood = routes.filter(
      (route) => route.resourcesGiven.gold > 0 && route.resourcesReceived.wood > 0,
    );
    expect(buysWood.length).toBeGreaterThan(0);
    expect(Math.min(...buysWood.map((route) => route.reputationRequired))).toBe(0);
  });

  it('offers coin → stone and coin → food as well', () => {
    const routes = initTradeRoutes();
    expect(routes.some((r) => r.resourcesGiven.gold > 0 && r.resourcesReceived.stone > 0)).toBe(true);
    expect(routes.some((r) => r.resourcesGiven.gold > 0 && r.resourcesReceived.food > 0)).toBe(true);
  });

  it('lets a colony with coin but no materials buy timber without a Market', () => {
    const world = withRoutes();
    world.resources.wood = 0;
    world.resources.stone = 0;
    world.villageReputation = 0;
    expect(world.buildings.some((building) => building.type === 'market')).toBe(false);

    const timber = world.tradeRoutes.find(
      (route) => isMaterialPurchaseRoute(route) && route.resourcesReceived.wood > 0,
    );
    expect(timber).toBeDefined();
    expect(canEstablishTradeRoute(world, timber!.id)).toMatchObject({ ok: true });

    // An export route still needs its Market, exactly as before.
    const exportRoute = world.tradeRoutes.find((route) => !isMaterialPurchaseRoute(route));
    expect(exportRoute).toBeDefined();
    expect(canEstablishTradeRoute(world, exportRoute!.id).ok).toBe(false);
  });

  it('merges the new routes into a save that predates them', () => {
    const older = initTradeRoutes().filter((route) => route.id !== 'trade_8');
    const merged = ensureFullTradeRoutes(older);
    expect(merged.some((route) => route.id === 'trade_8')).toBe(true);
    expect(merged).toHaveLength(initTradeRoutes().length);
  });
});

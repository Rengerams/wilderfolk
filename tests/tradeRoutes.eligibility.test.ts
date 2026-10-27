/**
 * The trade-route eligibility rule lives in the trade owner, and the UI must ask it rather than
 * restate it. The owner exempts the coin→materials rescue routes from the Market requirement
 * (`isMaterialPurchaseRoute`: gold out, materials in), and a local `marketOk && repOk` copy in
 * `ProgressTabPanel`/`App` disabled exactly those three routes and labelled them "Need Market" —
 * while a Market costs the wood and stone the player is trying to buy
 * (`BUG_REPORTS/2026-09-16-material-purchase-trade-routes-unreachable.md`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Resources, TradeRoute, WorldState } from '../src/game/gameTypes';
import { canEstablishTradeRoute, isMaterialPurchaseRoute } from '../src/game/tradeCaravans';

function resources(overrides: Partial<Resources> = {}): Resources {
  return { wood: 0, stone: 0, food: 0, gold: 0, iron: 0, ...overrides };
}

/** `trade_8`: the gold → wood rescue route. */
function rescueRoute(overrides: Partial<TradeRoute> = {}): TradeRoute {
  return {
    id: 'trade_8',
    targetName: 'Timber Post',
    resourcesGiven: resources({ gold: 12 }),
    resourcesReceived: resources({ wood: 30 }),
    reputationRequired: 0,
    active: false,
    ...overrides,
  };
}

/** A normal route that trades materials for gold — still Market-gated. */
function normalRoute(overrides: Partial<TradeRoute> = {}): TradeRoute {
  return {
    id: 'trade_1',
    targetName: 'Fur Trader',
    resourcesGiven: resources({ wood: 20 }),
    resourcesReceived: resources({ gold: 30 }),
    reputationRequired: 0,
    active: false,
    ...overrides,
  };
}

function market(): Building {
  return { id: 1, type: BuildingType.Market, completed: true, faction: undefined, occupants: [] } as unknown as Building;
}

function state(buildings: Building[], routes: TradeRoute[], reputation = 50): WorldState {
  return { buildings, tradeRoutes: routes, villageReputation: reputation } as unknown as WorldState;
}

describe('trade-route eligibility (owner rule)', () => {
  it('allows a coin→materials rescue route without a Market', () => {
    const rescue = rescueRoute();
    expect(isMaterialPurchaseRoute(rescue)).toBe(true);
    expect(canEstablishTradeRoute(state([], [rescue]), rescue.id)).toEqual({ ok: true });
  });

  it('still requires a Market for a route that is not a material purchase', () => {
    const normal = normalRoute();
    expect(isMaterialPurchaseRoute(normal)).toBe(false);

    const withoutMarket = canEstablishTradeRoute(state([], [normal]), normal.id);
    expect(withoutMarket.ok).toBe(false);
    expect(withoutMarket.blockReason).toBe('Build a Market before establishing trade routes');
    expect(canEstablishTradeRoute(state([market()], [normal]), normal.id)).toEqual({ ok: true });
  });

  it('still enforces the reputation requirement on a rescue route', () => {
    const rescue = rescueRoute({ reputationRequired: 60 });
    const eligibility = canEstablishTradeRoute(state([], [rescue], 12), rescue.id);
    expect(eligibility.ok).toBe(false);
    expect(eligibility.blockReason).toBe('Need 60 reputation');
  });

  it('blocks a route that is already active', () => {
    const rescue = rescueRoute({ active: true });
    expect(canEstablishTradeRoute(state([], [rescue]), rescue.id).ok).toBe(false);
  });
});

describe('the trade UI asks the owner instead of restating the rule', () => {
  const panelSource = readFileSync(resolve(process.cwd(), 'src/components/tabPanels/ProgressTabPanel.tsx'), 'utf8');
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it('ProgressTabPanel derives eligibility from canEstablishTradeRoute', () => {
    expect(panelSource).toContain('canEstablishTradeRoute(state, route.id)');
    expect(panelSource).not.toContain('marketOk && repOk');
    expect(panelSource).not.toContain("'Need Market'");
  });

  it('App derives tradeReadyCount from canEstablishTradeRoute', () => {
    expect(appSource).toContain('canEstablishTradeRoute(world, r.id)');
  });
});

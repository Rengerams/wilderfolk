/** A foreign trade carrier has a route, not a village job, home or settler schedule. */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SelectedEntityPanel from '../src/components/SelectedEntityPanel';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { explainHumanMovement } from '../src/game/movementExplanation';
import { getCaravanMoveTarget } from '../src/game/tradeCaravans';
import { initTradeRoutes } from '../src/game/economy';
import { getRouteObstruction } from '../src/game/pathfinding';

describe('trade-caravan inspector', () => {
  it('shows the owner route and path verdict instead of reporting a dead settler', () => {
    const state = initGame({ seed: 20261122 });
    state.tradeRoutes = initTradeRoutes();
    const route = state.tradeRoutes.find((r) => r.targetName === 'Timberland Traders')!;
    route.active = true;
    route.partnerX = state.width - 90;
    route.partnerY = 90;
    route.caravanLeg = 'outbound';
    const carrier = {
      id: state.nextEntityId++, type: EntityType.Human, alive: true,
      x: 95, y: 95, vx: 0, vy: 0, faction: 'trade_caravan', groupId: route.id,
    } as Entity;
    state.entities.push(carrier);
    route.caravanCarrierId = carrier.id;

    const target = getCaravanMoveTarget(state, carrier)!;
    const ownerVerdict = getRouteObstruction(state.worldMap, state.buildings, carrier, target);
    const explanation = explainHumanMovement(state, carrier.id);

    expect(explanation.status).toBe(ownerVerdict);
    expect(explanation.lines).toContainEqual({
      label: 'Trade route', value: 'Timberland Traders', tone: 'neutral',
    });
    expect(explanation.lines.some((line) => line.label === 'Journey' && line.value.includes('Timberland Traders'))).toBe(true);
    expect(explanation.lines.some((line) => line.label === 'Path')).toBe(true);
    expect(explanation.lines.some((line) => /Settler not found|no home|workplace/i.test(line.value))).toBe(false);
    // The real Selected panel must present route diagnostics without village housing/shift advice.
    const markup = renderToStaticMarkup(createElement(SelectedEntityPanel, {
      entity: carrier, allEntities: state.entities, state, onOpenFamilyTree: () => {},
    }));
    expect(markup).toContain('Trade route');
    expect(markup).toContain('Timberland Traders');
    expect(markup).not.toContain('Settler not found');
    expect(markup).not.toContain('No home yet');
    expect(markup).not.toContain('No post assigned');
    expect(markup).not.toContain('Schedule');
  });

  it('reports an orphan carrier as missing its route, not missing from the world', () => {
    const state = initGame({ seed: 20261122 });
    state.tradeRoutes = initTradeRoutes();
    const carrier = {
      id: state.nextEntityId++, type: EntityType.Human, alive: true,
      x: 95, y: 95, faction: 'trade_caravan', groupId: 'missing-route',
    } as Entity;
    state.entities.push(carrier);

    const explanation = explainHumanMovement(state, carrier.id);
    expect(explanation.status).toBe('none');
    expect(explanation.lines.some((line) => line.label === 'Path' && /no active route/i.test(line.value))).toBe(true);
  });

  it('distinguishes scheduled unloading from an unreachable walk', () => {
    const state = initGame({ seed: 20261122 });
    state.tradeRoutes = initTradeRoutes();
    const route = state.tradeRoutes[0]!;
    route.active = true;
    route.caravanLeg = 'at_partner';
    route.caravanWaitTicks = 24;
    route.partnerX = 90;
    route.partnerY = 90;
    const carrier = {
      id: state.nextEntityId++, type: EntityType.Human, alive: true,
      x: 90, y: 90, faction: 'trade_caravan', groupId: route.id,
    } as Entity;
    state.entities.push(carrier);

    const explanation = explainHumanMovement(state, carrier.id);
    expect(explanation.status).toBe('none');
    expect(explanation.lines.some((line) => line.label === 'Movement' && /unload/i.test(line.value))).toBe(true);
  });
});

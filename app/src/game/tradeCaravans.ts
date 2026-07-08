import type { Entity, Resources, TradeRoute, WorldState } from './gameTypes';
import { BuildingType, EntityType, JobType } from './gameTypes';
import { EVENT_INTERVAL, ticksForDays } from './dayCycle';
import { getPlayerCampCenter } from './frontierCombat';
import { addFloatingText, addNotification, getMultiplier } from './gameEngine';
import { addResource } from './economy';
import { getTownHallTradeMultiplier } from './townHall';
import { logEvent } from './eventLog';
import { createEntity } from './worldGen';

export const TRADE_CARAVAN_ARRIVAL_DIST = 28;
const PARTNER_WAIT_TICKS = ticksForDays(1);
const FIRST_CARAVAN_DELAY = ticksForDays(2);

export type TradeCaravanLeg = 'outbound' | 'at_partner' | 'inbound';

function tradeMultiplier(state: WorldState): number {
  return getMultiplier(state, 'trade_bonus') * getTownHallTradeMultiplier(state, state.buildings);
}

export function getDefaultPartnerPosition(state: WorldState, index: number): { x: number; y: number } {
  const margin = 90;
  const anchors = [
    { x: margin, y: margin },
    { x: state.width - margin, y: margin },
    { x: margin, y: state.height - margin },
    { x: state.width - margin, y: state.height - margin },
    { x: state.width * 0.5, y: margin },
    { x: state.width - margin, y: state.height * 0.5 },
    { x: margin, y: state.height * 0.5 },
  ];
  return anchors[index % anchors.length];
}

export function getTradeHubCenter(state: WorldState): { x: number; y: number } {
  const hubTypes = [BuildingType.Market, BuildingType.Store, BuildingType.TownHall, BuildingType.Workshop];
  for (const type of hubTypes) {
    const building = state.buildings.find((b) => b.completed && b.faction !== 'rival' && b.type === type);
    if (building) {
      return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
    }
  }
  return getPlayerCampCenter(state, state.buildings);
}

export function enrichTradeRoute(route: TradeRoute, state: WorldState, index: number): void {
  if (route.partnerX == null || route.partnerY == null) {
    const pos = getDefaultPartnerPosition(state, index);
    route.partnerX = pos.x;
    route.partnerY = pos.y;
  }
  route.caravansCompleted ??= 0;
}

function canAffordExports(state: WorldState, route: TradeRoute): boolean {
  return state.resources.wood >= route.resourcesGiven.wood
    && state.resources.stone >= route.resourcesGiven.stone
    && state.resources.food >= route.resourcesGiven.food
    && state.resources.gold >= route.resourcesGiven.gold;
}

function canStoreImports(state: WorldState, route: TradeRoute, mult: number): boolean {
  const receives: { key: keyof Resources; amount: number }[] = [
    { key: 'wood', amount: Math.floor(route.resourcesReceived.wood * mult) },
    { key: 'stone', amount: Math.floor(route.resourcesReceived.stone * mult) },
    { key: 'food', amount: Math.floor(route.resourcesReceived.food * mult) },
    { key: 'gold', amount: Math.floor(route.resourcesReceived.gold * mult) },
  ];
  for (const r of receives) {
    if (r.amount <= 0) continue;
    const current = state.resources[r.key] as number;
    const max = state.storageMax[r.key] as number;
    if (current + r.amount > max) return false;
  }
  return true;
}

function deductExports(state: WorldState, route: TradeRoute): void {
  state.resources.wood -= route.resourcesGiven.wood;
  state.resources.stone -= route.resourcesGiven.stone;
  state.resources.food -= route.resourcesGiven.food;
  state.resources.gold -= route.resourcesGiven.gold;
}

function applyImports(state: WorldState, route: TradeRoute, mult: number): number {
  let goldGained = 0;
  const recvWood = Math.floor(route.resourcesReceived.wood * mult);
  const recvStone = Math.floor(route.resourcesReceived.stone * mult);
  const recvFood = Math.floor(route.resourcesReceived.food * mult);
  const recvGold = Math.floor(route.resourcesReceived.gold * mult);

  if (recvWood > 0) addResource(state, 'wood', recvWood);
  if (recvStone > 0) addResource(state, 'stone', recvStone);
  if (recvFood > 0) addResource(state, 'food', recvFood);
  if (recvGold > 0) goldGained = addResource(state, 'gold', recvGold);
  return goldGained;
}

function removeCarrier(state: WorldState, route: TradeRoute, entity: Entity): void {
  entity.alive = false;
  entity.residenceBuildingId = undefined;
  entity.homeBuildingId = undefined;
  const idx = state.entities.findIndex((e) => e.id === entity.id);
  if (idx >= 0) state.entities.splice(idx, 1);
  route.caravanCarrierId = undefined;
  route.caravanLeg = undefined;
  route.caravanWaitTicks = undefined;
}

export function scheduleTradeRouteDeparture(
  state: WorldState,
  route: TradeRoute,
  delayTicks = EVENT_INTERVAL.tradeRoute,
): void {
  route.nextDepartureTick = state.tick + delayTicks;
}

export function onTradeRouteEstablished(state: WorldState, routeId: string): void {
  const route = state.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return;
  const idx = state.tradeRoutes.findIndex((r) => r.id === routeId);
  enrichTradeRoute(route, state, idx);
  scheduleTradeRouteDeparture(state, route, FIRST_CARAVAN_DELAY);
  logEvent(
    state,
    'trade',
    `Caravans will walk to ${route.targetName} and back — first merchant departs soon`,
    route.targetName,
  );
}

function spawnCaravan(state: WorldState, route: TradeRoute): boolean {
  if (!canAffordExports(state, route)) {
    addFloatingText(
      state,
      state.width / 2,
      state.height / 2,
      `Caravan to ${route.targetName} waiting — missing export goods`,
      '#ef4444',
    );
    scheduleTradeRouteDeparture(state, route, EVENT_INTERVAL.tradeRoute / 2);
    return false;
  }

  const hub = getTradeHubCenter(state);
  const carrier = createEntity(EntityType.Human, hub.x, hub.y, state.nextEntityId++, 300, false, {
    name: `${route.targetName} trader`,
    gender: 'male',
  });
  carrier.job = JobType.Merchant;
  carrier.faction = 'trade_caravan';
  carrier.groupId = route.id;
  carrier.occupation = 'merchant';
  carrier.residenceBuildingId = undefined;
  carrier.homeBuildingId = undefined;
  carrier.relationshipStatus = 'single';
  carrier.reproductionCooldown = 9999;
  state.entities.push(carrier);
  route.caravanCarrierId = carrier.id;
  route.caravanLeg = 'outbound';
  route.caravanWaitTicks = 0;
  addFloatingText(state, hub.x, hub.y - 24, `🚚 → ${route.targetName}`, '#fbbf24');
  logEvent(state, 'trade', `Caravan departed for ${route.targetName}`, carrier.name);
  return true;
}

function hasActiveCarrier(state: WorldState, route: TradeRoute): boolean {
  if (route.caravanCarrierId == null) return false;
  return state.entities.some((e) => e.alive && e.id === route.caravanCarrierId);
}

export function tickTradeCaravans(state: WorldState): void {
  for (let i = 0; i < state.tradeRoutes.length; i++) {
    const route = state.tradeRoutes[i];
    if (!route.active) continue;
    enrichTradeRoute(route, state, i);

    if (!hasActiveCarrier(state, route)) {
      route.caravanCarrierId = undefined;
      route.caravanLeg = undefined;
      route.caravanWaitTicks = undefined;
      if (route.nextDepartureTick == null) {
        scheduleTradeRouteDeparture(state, route);
      }
      if (state.tick >= (route.nextDepartureTick ?? 0)) {
        if (spawnCaravan(state, route)) {
          route.nextDepartureTick = undefined;
        }
      }
    }
  }
}

export function getCaravanMoveTarget(
  state: WorldState,
  entity: Entity,
): { x: number; y: number; speedMult: number } | null {
  const route = state.tradeRoutes.find((r) => r.id === entity.groupId && r.active);
  if (!route || route.partnerX == null || route.partnerY == null) return null;

  const leg = route.caravanLeg ?? 'outbound';
  if (leg === 'outbound' || leg === 'at_partner') {
    return { x: route.partnerX, y: route.partnerY, speedMult: 0.48 };
  }
  const hub = getTradeHubCenter(state);
  return { x: hub.x, y: hub.y, speedMult: 0.52 };
}

export function tryAdvanceCaravanLeg(state: WorldState, entity: Entity): void {
  const route = state.tradeRoutes.find((r) => r.id === entity.groupId && r.active);
  if (!route || route.partnerX == null || route.partnerY == null) return;

  const hub = getTradeHubCenter(state);
  const leg = route.caravanLeg ?? 'outbound';
  const mult = tradeMultiplier(state);

  if (leg === 'outbound') {
    const dist = Math.hypot(route.partnerX - entity.x, route.partnerY - entity.y);
    if (dist > TRADE_CARAVAN_ARRIVAL_DIST) return;
    route.caravanLeg = 'at_partner';
    route.caravanWaitTicks = PARTNER_WAIT_TICKS;
    addFloatingText(state, entity.x, entity.y - 20, `📦 At ${route.targetName}`, '#fbbf24');
    return;
  }

  if (leg === 'at_partner') {
    route.caravanWaitTicks = Math.max(0, (route.caravanWaitTicks ?? 0) - 1);
    if ((route.caravanWaitTicks ?? 0) > 0) return;

    if (!canAffordExports(state, route)) {
      addFloatingText(state, entity.x, entity.y - 16, 'Waiting for export goods…', '#ef4444');
      route.caravanWaitTicks = EVENT_INTERVAL.tradeRoute / 4;
      return;
    }
    if (!canStoreImports(state, route, mult)) {
      addFloatingText(state, entity.x, entity.y - 16, 'Partner holding cargo — storage full', '#ef4444');
      route.caravanWaitTicks = EVENT_INTERVAL.tradeRoute / 4;
      return;
    }

    deductExports(state, route);
    route.caravanLeg = 'inbound';
    route.caravanWaitTicks = 0;
    addFloatingText(state, entity.x, entity.y - 20, '🚚 Returning home…', '#a3e635');
    return;
  }

  if (leg === 'inbound') {
    const dist = Math.hypot(hub.x - entity.x, hub.y - entity.y);
    if (dist > TRADE_CARAVAN_ARRIVAL_DIST) return;

    const goldGained = applyImports(state, route, mult);
    route.caravansCompleted = (route.caravansCompleted ?? 0) + 1;
    state.lifetimeStats = {
      ...state.lifetimeStats,
      tradeCaravansCompleted: state.lifetimeStats.tradeCaravansCompleted + 1,
      goldFromTradeRoutes: state.lifetimeStats.goldFromTradeRoutes + goldGained,
    };

    addNotification(
      state,
      'Caravan returned',
      `${route.targetName} — round trip complete (+${goldGained > 0 ? `${goldGained}g` : 'goods'})`,
      'success',
    );
    logEvent(state, 'trade', `Caravan returned from ${route.targetName} (trip #${route.caravansCompleted})`, entity.name);
    removeCarrier(state, route, entity);
    scheduleTradeRouteDeparture(state, route);
  }
}
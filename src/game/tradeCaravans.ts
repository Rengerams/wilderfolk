import { moveResident } from './housingPipeline';
import type { Entity, Resources, TradeRoute, WorldState } from './gameTypes';
import { BuildingType, EntityType, JobType } from './gameTypes';
import { EVENT_INTERVAL, ticksForDays } from './dayCycle';
import { getPlayerSettlerCenter } from './villageAnchor';
import { addFloatingText, addNotification } from './simEffects';
import { getMultiplier } from './simHelpers';
import { addResource } from './resourceUtils';
import { spendFood, recordFoodProduced } from './economyLedger';
import { getTownHallTradeMultiplier } from './townHall';
import { logEvent } from './eventLog';
import { createEntity, finalizeSettlerAge } from './entityFactory';
import { ensureEntityByIdMap, unindexEntityFromState } from './entityIndex';
import { clearWorkerAssignment } from './workforce';
import { pushNewEntity } from './simulation/simulationEntities';
import { buildingAccessPoint } from './buildingAccess';
import { SPECIES_CONFIG } from './speciesConfig';
import type { TickContext } from './simulation/simulationTypes';

/** Long-range trade routes require a completed player Market (EC-4). */
export function hasCompletedMarket(state: WorldState): boolean {
  return state.buildings.some(
    (b) => b.completed && b.faction !== 'rival' && b.type === BuildingType.Market,
  );
}

export const TRADE_CARAVAN_ARRIVAL_DIST = 28;
function getPartnerWaitTicks(): number {
  return ticksForDays(1);
}
function getFirstCaravanDelay(): number {
  return ticksForDays(2);
}

/** Merchant pace on each leg, as a fraction of a settler's walk speed. */
const CARAVAN_OUTBOUND_SPEED_MULT = 0.48;
const CARAVAN_INBOUND_SPEED_MULT = 0.52;
/** Straight-line travel slack that covers path detours so a legal trip is never cut short. */
const CARAVAN_TRIP_DETOUR_ALLOWANCE = 2.5;
/** Slack after both legs and the partner's unloading wait, in days, before a trip is abandoned. */
const CARAVAN_TRIP_SLACK_DAYS = 3;
/** Partner-side grace after the unloading wait, in days, before a blocked cargo returns home. */
const CARAVAN_CARGO_GRACE_DAYS = 3;

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
      // The building centre is inside a solid footprint; the caravan uses its door.
      return buildingAccessPoint(building);
    }
  }
  const fallback = state.buildings.find((b) => b.completed && b.faction !== 'rival');
  return fallback
    ? buildingAccessPoint(fallback)
    : getPlayerSettlerCenter(state);
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
    && state.resources.gold >= route.resourcesGiven.gold
    && state.resources.iron >= (route.resourcesGiven.iron ?? 0);
}

function canStoreImports(state: WorldState, route: TradeRoute, mult: number): boolean {
  const receives: { key: keyof Resources; amount: number }[] = [
    { key: 'wood', amount: Math.floor(route.resourcesReceived.wood * mult) },
    { key: 'stone', amount: Math.floor(route.resourcesReceived.stone * mult) },
    { key: 'food', amount: Math.floor(route.resourcesReceived.food * mult) },
    { key: 'gold', amount: Math.floor(route.resourcesReceived.gold * mult) },
    // Iron is a real fifth resource: omitting it here let a full iron store silently clamp the
    // cargo away.
    { key: 'iron', amount: Math.floor(route.resourcesReceived.iron * mult) },
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
  spendFood(state, 'trade', route.resourcesGiven.food);
  state.resources.gold -= route.resourcesGiven.gold;
  if ((route.resourcesGiven.iron ?? 0) > 0) {
    state.resources.iron -= route.resourcesGiven.iron;
  }
}

/** Return a departed caravan's reserved exports through the storage-cap owner. */
function refundExports(state: WorldState, route: TradeRoute): void {
  const given = route.resourcesGiven;
  if (given.wood > 0) addResource(state, 'wood', given.wood);
  if (given.stone > 0) addResource(state, 'stone', given.stone);
  if (given.gold > 0) addResource(state, 'gold', given.gold);
  if ((given.iron ?? 0) > 0) addResource(state, 'iron', given.iron);
  // A returned cargo is a trade inflow: the ledger records what storage actually accepted.
  if (given.food > 0) recordFoodProduced(state, 'trade', addResource(state, 'food', given.food));
}

/** How many ticks this trip may take before the route abandons it: both legs plus dock slack. */
function caravanTripDeadlineTicks(state: WorldState, route: TradeRoute): number {
  const hub = getTradeHubCenter(state);
  const distance = Math.hypot(
    (route.partnerX ?? hub.x) - hub.x,
    (route.partnerY ?? hub.y) - hub.y,
  );
  const speed = SPECIES_CONFIG[EntityType.Human].speed * CARAVAN_OUTBOUND_SPEED_MULT;
  const travelTicks = speed > 0 ? distance / speed : 0;
  return Math.ceil(travelTicks * CARAVAN_TRIP_DETOUR_ALLOWANCE) + ticksForDays(CARAVAN_TRIP_SLACK_DAYS);
}


function applyImports(state: WorldState, route: TradeRoute, mult: number): number {
  let goldGained = 0;
  const recvWood = Math.floor(route.resourcesReceived.wood * mult);
  const recvStone = Math.floor(route.resourcesReceived.stone * mult);
  const recvFood = Math.floor(route.resourcesReceived.food * mult);
  const recvGold = Math.floor(route.resourcesReceived.gold * mult);
  // Every non-zero field of `resourcesReceived` must actually be credited — see the iron note
  // in `canStoreImports` above.
  const recvIron = Math.floor(route.resourcesReceived.iron * mult);

  if (recvWood > 0) addResource(state, 'wood', recvWood);
  if (recvStone > 0) addResource(state, 'stone', recvStone);
  // Imported food is stored food like a harvest: the ledger must see what storage accepted or the
  // daily deficit/immigration verdict reads a full larder as zero production.
  if (recvFood > 0) recordFoodProduced(state, 'trade', addResource(state, 'food', recvFood));
  if (recvGold > 0) goldGained = addResource(state, 'gold', recvGold);
  if (recvIron > 0) addResource(state, 'iron', recvIron);
  return goldGained;
}

function removeCarrier(state: WorldState, route: TradeRoute, entity: Entity): void {
  entity.alive = false;
  unindexEntityFromState(state, entity.id);
  moveResident(entity, undefined, 'departure', { buildings: state.buildings });
  clearWorkerAssignment(entity);
  // No manual splice: clearing `alive` is how every other despawn leaves the world, and the tick's
  // `state.entities = allAlive` rebuild is the single writer of membership.
  route.caravanCarrierId = undefined;
  route.caravanLeg = undefined;
  route.caravanWaitTicks = undefined;
}

/**
 * The bounded resolution for a caravan that cannot finish: return its reserved exports, despawn the
 * carrier and put the route back on its normal departure cadence.
 */
function abandonCaravan(state: WorldState, route: TradeRoute): void {
  const carrierId = route.caravanCarrierId;
  const carrier = carrierId == null
    ? undefined
    : ensureEntityByIdMap(state).get(carrierId)
      ?? state.entities.find((entity) => entity.alive && entity.id === carrierId);
  refundExports(state, route);
  if (carrier) {
    addFloatingText(
      state,
      carrier.x,
      carrier.y - 20,
      `↩ ${route.targetName} caravan turned back — goods returned`,
      '#f59e0b',
    );
    removeCarrier(state, route, carrier);
  } else {
    route.caravanCarrierId = undefined;
    route.caravanLeg = undefined;
    route.caravanWaitTicks = undefined;
  }
  scheduleTradeRouteDeparture(state, route);
  logEvent(
    state,
    'trade',
    `Caravan to ${route.targetName} turned back before the deadline; reserved goods returned`,
    route.targetName,
  );
}

export function scheduleTradeRouteDeparture(
  state: WorldState,
  route: TradeRoute,
  delayTicks = EVENT_INTERVAL.tradeRoute,
): void {
  route.nextDepartureTick = state.tick + delayTicks;
}

/**
 * Whether `establishTradeRoute` would actually open this route: it exists, is not already open, a
 * completed player Market stands, and reputation meets the requirement.
 */
/**
 * A route that only buys materials with coin — gold out, materials in, no gold back — and may skip
 * the Market requirement, since a colony needing it cannot afford the Market.
 */
export function isMaterialPurchaseRoute(route: TradeRoute): boolean {
  const givesGoldOnly =
    route.resourcesGiven.gold > 0
    && route.resourcesGiven.wood === 0
    && route.resourcesGiven.stone === 0
    && route.resourcesGiven.food === 0
    && route.resourcesGiven.iron === 0;
  const receivesMaterials =
    route.resourcesReceived.wood > 0
    || route.resourcesReceived.stone > 0
    || route.resourcesReceived.food > 0;
  return givesGoldOnly && receivesMaterials && route.resourcesReceived.gold === 0;
}

export function canEstablishTradeRoute(
  state: WorldState,
  routeId: string,
): { ok: boolean; blockReason?: string } {
  const route = (state.tradeRoutes ?? []).find((r) => r.id === routeId);
  if (!route) return { ok: false, blockReason: 'No such trade route' };
  if (route.active) return { ok: false, blockReason: 'Route already established' };
  if (!hasCompletedMarket(state) && !isMaterialPurchaseRoute(route)) {
    return { ok: false, blockReason: 'Build a Market before establishing trade routes' };
  }
  if (state.villageReputation < route.reputationRequired) {
    return { ok: false, blockReason: `Need ${route.reputationRequired} reputation` };
  }
  return { ok: true };
}

/**
 * Village-level trade answer: the inactive routes that are ready, and the ones the owner refuses
 * counted under its own reason — the total a single per-route line cannot give.
 */
export function summarizeTradeRouteBlocks(
  state: WorldState,
): { ready: number; blocked: Array<{ reason: string; count: number }> } {
  const counts = new Map<string, number>();
  let ready = 0;
  for (const route of state.tradeRoutes ?? []) {
    if (route.active) continue;
    const eligibility = canEstablishTradeRoute(state, route.id);
    if (eligibility.ok) {
      ready++;
      continue;
    }
    const reason = eligibility.blockReason ?? 'Unavailable';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const blocked = [...counts].map(([reason, count]) => ({ reason, count }));
  blocked.sort((a, b) => b.count - a.count);
  return { ready, blocked };
}

export function establishTradeRoute(state: WorldState, routeId: string): WorldState {
  const s = structuredClone(state);
  const route = s.tradeRoutes.find(r => r.id === routeId);
  if (!route || route.active) return s;

  const eligibility = canEstablishTradeRoute(state, routeId);
  if (!eligibility.ok) {
    addNotification(s, 'Trade Failed', eligibility.blockReason ?? 'Cannot establish this route', 'warning');
    return s;
  }

  route.active = true;
  s.lifetimeStats = {
    ...s.lifetimeStats,
    tradeRoutesEstablished: s.lifetimeStats.tradeRoutesEstablished + 1,
  };
  onTradeRouteEstablished(s, routeId);
  addNotification(s, 'Trade Route Established', `Merchants will walk to ${route.targetName} and back!`, 'success');
  return s;
}

export function onTradeRouteEstablished(state: WorldState, routeId: string): void {
  const route = state.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return;
  const idx = state.tradeRoutes.findIndex((r) => r.id === routeId);
  enrichTradeRoute(route, state, idx);
  scheduleTradeRouteDeparture(state, route, getFirstCaravanDelay());
  logEvent(
    state,
    'trade',
    `Caravans will walk to ${route.targetName} and back — first merchant departs soon`,
    route.targetName,
  );
}

function spawnCaravan(state: WorldState, route: TradeRoute, ctx: TickContext): boolean {
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

  // Reserve the exports at departure: the caravan physically loads them, so there is no
  // double-spend window and a carrier that dies en route costs the goods.
  deductExports(state, route);

  const hub = getTradeHubCenter(state);
  const carrier = createEntity(EntityType.Human, hub.x, hub.y, state.nextEntityId++, 300, false, {
    name: `${route.targetName} trader`,
    gender: 'male',
    faction: 'trade_caravan',
  });
  finalizeSettlerAge(carrier, state);
  carrier.job = JobType.Merchant;
  carrier.groupId = route.id;
  carrier.occupation = 'merchant';
  moveResident(carrier, undefined, 'departure');
  carrier.relationshipStatus = 'single';
  carrier.reproductionCooldown = 9999;
  // The carrier must go through the tick's canonical spawn path, or `gameTick`'s entity rebuild
  // drops it in the same tick; `pushNewEntity` also indexes it and adds it to the spatial grid.
  pushNewEntity(state, ctx, carrier);
  route.caravanCarrierId = carrier.id;
  route.caravanLeg = 'outbound';
  route.caravanWaitTicks = 0;
  // The route timer bounds this trip: a carrier that cannot reach the partner (or unload) resolves at
  // the deadline, returning its reserved exports rather than holding them.
  route.nextDepartureTick = state.tick + caravanTripDeadlineTicks(state, route);
  addFloatingText(state, hub.x, hub.y - 24, `🚚 → ${route.targetName}`, '#fbbf24');
  logEvent(state, 'trade', `Caravan departed for ${route.targetName}`, carrier.name);
  return true;
}

function hasActiveCarrier(state: WorldState, route: TradeRoute): boolean {
  if (route.caravanCarrierId == null) return false;
  // `entityById` is the canonical id → living-entity map; the `state.entities` scan is the
  // map-miss fallback, and `?.alive` guards a corpse the map may still hold.
  const carrierId = route.caravanCarrierId;
  const indexed = ensureEntityByIdMap(state).get(carrierId);
  if (indexed) return indexed.alive;
  return state.entities.some((e) => e.alive && e.id === carrierId);
}

/**
 * Age a docked caravan's wait by `step` ticks, owned by the systems layer because the countdown is
 * measured in ticks while the per-human throttle only reaches an off-screen caravan every 24.
 */
function countDownCaravanWait(state: WorldState, route: TradeRoute, step: number): void {
  if ((route.caravanWaitTicks ?? 0) > 0) {
    route.caravanWaitTicks = Math.max(0, (route.caravanWaitTicks ?? 0) - step);
  }
  if ((route.caravanWaitTicks ?? 0) > 0) return;
  if ((route.caravanLeg ?? 'outbound') !== 'at_partner') return;

  const carrierId = route.caravanCarrierId;
  if (carrierId == null) return;
  const carrier =
    ensureEntityByIdMap(state).get(carrierId) ?? state.entities.find((e) => e.alive && e.id === carrierId);
  // Position gates are the tick owner's; this only decides the wait is over.
  if (!carrier) return;
  tryAdvanceCaravanLeg(state, carrier);
}

export function tickTradeCaravans(
  state: WorldState,
  ctx: TickContext,
  /** Ticks advanced per call — the cadence of the layer that calls this. */
  step: number,
): void {
  for (let i = 0; i < state.tradeRoutes.length; i++) {
    const route = state.tradeRoutes[i];
    if (!route.active) continue;
    enrichTradeRoute(route, state, i);

    if (!hasActiveCarrier(state, route)) {
      // A carrier that vanished mid-trip must not keep the trip deadline as its departure gate.
      if (route.caravanCarrierId != null) route.nextDepartureTick = undefined;
      route.caravanCarrierId = undefined;
      route.caravanLeg = undefined;
      route.caravanWaitTicks = undefined;
      if (route.nextDepartureTick == null) {
        scheduleTradeRouteDeparture(state, route);
      }
      if (state.tick >= (route.nextDepartureTick ?? 0)) {
        spawnCaravan(state, route, ctx);
      }
      continue;
    }

    // Bounded resolution: a trip past its deadline returns the reserved exports and frees the route.
    route.nextDepartureTick ??= state.tick + caravanTripDeadlineTicks(state, route);
    if (state.tick >= route.nextDepartureTick) {
      abandonCaravan(state, route);
      continue;
    }

    countDownCaravanWait(state, route, step);
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
    return { x: route.partnerX, y: route.partnerY, speedMult: CARAVAN_OUTBOUND_SPEED_MULT };
  }
  const hub = getTradeHubCenter(state);
  return { x: hub.x, y: hub.y, speedMult: CARAVAN_INBOUND_SPEED_MULT };
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
    route.caravanWaitTicks = getPartnerWaitTicks();
    // Docked: the cargo decision gets the unload wait plus a short grace, never the whole trip budget.
    route.nextDepartureTick = Math.min(
      route.nextDepartureTick ?? Infinity,
      state.tick + getPartnerWaitTicks() + ticksForDays(CARAVAN_CARGO_GRACE_DAYS),
    );
    addFloatingText(state, entity.x, entity.y - 20, `📦 At ${route.targetName}`, '#fbbf24');
    return;
  }

  if (leg === 'at_partner') {
    if ((route.caravanWaitTicks ?? 0) > 0) return;

    // ER-12: exports were already reserved at departure — only imports need room.
    if (!canStoreImports(state, route, mult)) {
      addFloatingText(state, entity.x, entity.y - 16, 'Partner holding cargo — storage full', '#ef4444');
      route.caravanWaitTicks = EVENT_INTERVAL.tradeRoute / 4;
      return;
    }

    route.caravanLeg = 'inbound';
    route.caravanWaitTicks = 0;
    // The return leg gets its own bounded window instead of inheriting the dock's cargo deadline.
    route.nextDepartureTick = state.tick + caravanTripDeadlineTicks(state, route);
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
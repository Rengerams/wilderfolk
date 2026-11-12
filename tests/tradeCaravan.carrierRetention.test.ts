/**
 * A trade-caravan carrier must survive the tick that creates it: entities spawned during a tick go
 * through `pushNewEntity(state, ctx, entity)`, or `gameTick` drops them from the new entity list.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tickTradeCaravans } from '../src/game/tradeCaravans';
import { initTradeRoutes } from '../src/game/economy';
import { LAYER_SYSTEMS_INTERVAL } from '../src/game/tickLayerSystems';
import { HUMAN_ADULT_MIN_AGE } from '../src/game/daycycleconstants';
import { byType } from '../src/test/factories';

const FIXTURE_SEED = 20240913;

function makeCtx(state: WorldState): TickContext {
  const entities = state.entities;
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 8,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType: byType(entities),
    aliveEntities: entities,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: [],
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
    predators: [],
  };
}

/** A world whose first trade route departs on `tick`, with plenty to export. */
function makeDepartingWorld(tick: number): WorldState {
  const state = initGame({ seed: FIXTURE_SEED });
  state.resources = { wood: 500, stone: 500, food: 500, gold: 500, iron: 500 };
  state.storageMax = { wood: 5000, stone: 5000, food: 5000, gold: 5000, iron: 500 };
  state.tradeRoutes = initTradeRoutes();
  const route = state.tradeRoutes[0];
  route.active = true;
  route.nextDepartureTick = tick;
  state.tick = tick;
  return state;
}

const isCarrier = (entity: Entity): boolean => entity.alive && entity.faction === 'trade_caravan';

describe('a caravan carrier leaves through the tick spawn path', () => {
  it('registers the carrier in ctx.newEntities so the end-of-tick rebuild keeps it', () => {
    const state = makeDepartingWorld(LAYER_SYSTEMS_INTERVAL);
    const ctx = makeCtx(state);

    tickTradeCaravans(state, ctx, LAYER_SYSTEMS_INTERVAL);

    const spawned = ctx.newEntities.filter(isCarrier);
    expect(spawned).toHaveLength(1);
    expect(state.tradeRoutes[0].caravanCarrierId).toBe(spawned[0].id);
    expect(spawned[0].job).toBe('merchant');
    expect(spawned[0].isJuvenile).toBe(false);
    expect(spawned[0].age).toBeGreaterThanOrEqual(HUMAN_ADULT_MIN_AGE);
    expect(ctx.entityById.get(spawned[0].id)).toBe(spawned[0]);
  });

  it('resolves a caravan that cannot finish at its trip deadline and returns the reserved exports', () => {
    const state = makeDepartingWorld(LAYER_SYSTEMS_INTERVAL);
    const ctx = makeCtx(state);
    const route = state.tradeRoutes[0];
    const before = { ...state.resources };

    tickTradeCaravans(state, ctx, LAYER_SYSTEMS_INTERVAL);
    expect(route.caravanCarrierId).toBeDefined();
    expect(route.nextDepartureTick, 'the trip carries a bounded deadline').toBeGreaterThan(state.tick);
    // The exports left the store with the carrier.
    expect(state.resources.wood).toBe(before.wood - route.resourcesGiven.wood);
    expect(state.resources.food).toBe(before.food - route.resourcesGiven.food);

    // The end-of-tick rebuild adopts the spawned carrier; the next systems pass reads it in the world.
    state.entities.push(...ctx.newEntities.filter(isCarrier));

    // The carrier never reaches the partner: the deadline is the one resolution owner.
    state.tick = route.nextDepartureTick!;
    tickTradeCaravans(state, ctx, LAYER_SYSTEMS_INTERVAL);

    expect(route.caravanCarrierId).toBeUndefined();
    expect(route.caravanLeg).toBeUndefined();
    expect(state.entities.some(isCarrier), 'the lost carrier leaves the world').toBe(false);
    expect(state.resources.wood, 'reserved wood returned').toBe(before.wood);
    expect(state.resources.food, 'reserved food returned').toBe(before.food);
    expect(route.nextDepartureTick).toBeGreaterThan(state.tick);
  });

  it('the carrier is still in the world after a full gameTick', () => {
    const tick = LAYER_SYSTEMS_INTERVAL * 3;
    const state = makeDepartingWorld(tick);
    // gameTick increments first, so land the departure on the very next tick.
    state.tick = tick - 1;
    state.tradeRoutes[0].nextDepartureTick = tick;

    gameTick(state);

    const carriers = state.entities.filter(isCarrier);
    expect(carriers).toHaveLength(1);
    expect(state.tradeRoutes[0].caravanCarrierId).toBe(carriers[0].id);
    expect(state.tradeRoutes[0].caravanLeg).toBe('outbound');
  });
});
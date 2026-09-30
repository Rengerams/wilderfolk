/**
 * A trade-caravan carrier survives the tick that creates it.
 *
 * `spawnCaravan` pushed the carrier into `state.entities` and indexed it, but nothing
 * registered it in `ctx.newEntities` — and `gameTick` finishes every tick by replacing
 * `state.entities` with the `allAlive` snapshot it built from the pre-tick entity list
 * plus `ctx.newEntities`. A carrier created in the systems layer was therefore discarded
 * in the same tick it departed, `hasActiveCarrier` saw no carrier again, and the route
 * restarted instead of walking: caravans could never travel (and the export goods were
 * already deducted at departure, so they were simply lost).
 *
 * The canonical spawn path for entities created during a tick is
 * `pushNewEntity(state, ctx, entity)`.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tickTradeCaravans } from '../src/game/tradeCaravans';
import { initTradeRoutes } from '../src/game/economy';
import { LAYER_SYSTEMS_INTERVAL } from '../src/game/tickLayerSystems';
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

    tickTradeCaravans(state, ctx);

    const spawned = ctx.newEntities.filter(isCarrier);
    expect(spawned).toHaveLength(1);
    expect(state.tradeRoutes[0].caravanCarrierId).toBe(spawned[0].id);
    expect(spawned[0].job).toBe('merchant');
    expect(ctx.entityById.get(spawned[0].id)).toBe(spawned[0]);
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
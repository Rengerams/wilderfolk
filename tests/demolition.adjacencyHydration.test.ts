/**
 * Regression for `BUG_REPORTS/2026-08-28-worker-demolition-adjacency-hydration.md`.
 *
 * A world that arrives from a save/snapshot carries `adjacency` as a plain
 * serialized object, not the live index. Demolishing through the worker command
 * door (and building the optimistic display world) must not call a method on that
 * plain object — it must rebuild the index, clean it, and leave a usable world.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { applyWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import { createOptimisticDisplayWorld } from '../src/game/worldRuntimeCaches';
import { BuildingType, MapSize } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';

const BUILDING_ID = 4242;

/** A completed player building, so demolition has something real to remove. */
function placeableWorld(seed: number): WorldState {
  const base = initGame({ size: MapSize.Medium, seed });
  const building = {
    id: BUILDING_ID,
    type: BuildingType.Store,
    x: 1200,
    y: 900,
    width: 46,
    height: 40,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  } as Building;
  return { ...base, tick: 0, paused: false, buildings: [...base.buildings, building] };
}

/** What a save/worker snapshot looks like: `adjacency` is no longer the live index. */
function withSerializedAdjacency(world: WorldState): WorldState {
  (world as { adjacency?: unknown }).adjacency = { cells: [], version: 1 };
  return world;
}

describe('demolition against a serialized adjacency index', () => {
  it('demolishes through the worker command door without throwing on the plain object', () => {
    const world = withSerializedAdjacency(placeableWorld(9001));

    const demolish = () =>
      applyWorkerCommand(world, { proto: WORKER_CMD_PROTO, op: 'demolishBuilding', buildingId: BUILDING_ID });

    expect(demolish).not.toThrow();

    const after = demolish();
    expect(after.buildings.some((building) => building.id === BUILDING_ID)).toBe(false);
    // The stale serialized index must not survive the demolition.
    expect(after.adjacency).toBeUndefined();
  });

  it('builds an optimistic display world with the stale index stripped', () => {
    const world = withSerializedAdjacency(placeableWorld(9002));

    const display = createOptimisticDisplayWorld(world);

    expect(display.adjacency).toBeUndefined();
    // The display world is still usable for a following command.
    expect(() =>
      applyWorkerCommand(display, { proto: WORKER_CMD_PROTO, op: 'demolishBuilding', buildingId: BUILDING_ID }),
    ).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { BuildingType } from '@/game/gameTypes';
import { freshState, makeAdultSettler } from '@/test/fixtures/gameFixtures';
import { gameTick } from '@/game/gameEngine';
import {
  applySimTickDelta,
  extractSimTickDelta,
  simTickDeltaFromWorld,
  syncCatalogEntitiesToWorld,
} from '@/game/simBuffers/simDelta';
import { aliveIdSet } from '@/game/simWorker/commands';


describe('syncCatalogEntitiesToWorld', () => {
  it('patches existing main-thread humans from worker catalog snapshots', () => {
    const state = freshState();
    const settler = makeAdultSettler(1);
    state.entities = [settler];

    const workerSnapshot = { ...settler, homeBuildingId: 9 };
    syncCatalogEntitiesToWorld(state, [workerSnapshot]);

    expect(state.entities[0].homeBuildingId).toBe(9);
    expect(state.entities[0]).toBe(settler);
  });
});

describe('sim delta clone modes', () => {
  it('transfer mode isolates via postMessage clone boundary', () => {
    const initial = freshState();
    initial.paused = false;

    const workerWorld = freshState();
    workerWorld.paused = false;
    const before = aliveIdSet(workerWorld);
    gameTick(workerWorld);
    const alive = workerWorld.entities.filter((e) => e.alive);
    const delta = extractSimTickDelta(workerWorld, before, alive, {
      headless: true,
      cloneMode: 'transfer',
    });

    const wireDelta = structuredClone(delta);
    const foodAfterTick = wireDelta.resources.food;
    workerWorld.resources.food = -999;

    const mainWorld = freshState();
    applySimTickDelta(mainWorld, wireDelta, { cloneMode: 'transfer' });

    expect(mainWorld.tick).toBe(wireDelta.tick);
    expect(mainWorld.resources.food).toBe(foodAfterTick);
    expect(mainWorld.resources.food).not.toBe(-999);
    expect(mainWorld.entities).not.toBe(workerWorld.entities);
  });

  it('isolated mode prevents aliasing without postMessage', () => {
    const state = freshState();
    const settler = makeAdultSettler(1);
    state.entities = [settler];
    const delta = simTickDeltaFromWorld(state);

    const shadow = freshState();
    applySimTickDelta(shadow, delta);

    delta.resources.food = -1;
    expect(shadow.resources.food).not.toBe(-1);
  });
});

describe('applySimTickDelta', () => {
  it('merges catalogEntities into world entities', () => {
    const state = freshState();
    const settler = makeAdultSettler(2);
    state.entities = [settler];
    const delta = simTickDeltaFromWorld(state);
    delta.catalogEntities = [{ ...settler, homeBuildingId: 4 }];

    const shadow = freshState();
    applySimTickDelta(shadow, delta);

    const patched = shadow.entities.find((e) => e.id === settler.id);
    expect(patched?.homeBuildingId).toBe(4);
  });

  it('applies building updates from command deltas', () => {
    const state = freshState();
    const settler = makeAdultSettler(1);
    state.entities = [settler];
    state.buildings.push({
      id: 2,
      type: BuildingType.Farm,
      x: 0,
      y: 0,
      width: 80,
      height: 60,
      completed: true,
      constructionProgress: 100,
      occupants: [1],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: undefined,
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    settler.homeBuildingId = 2;
    const delta = simTickDeltaFromWorld(state);

    const shadow = freshState();
    shadow.entities = [settler];
    applySimTickDelta(shadow, delta);

    expect(shadow.buildings.find((b) => b.id === 2)?.occupants).toContain(1);
    expect(shadow.entities.find((e) => e.id === 1)?.homeBuildingId).toBe(2);
  });

  it('replaces entities with compacted aliveEntities', () => {
    const state = freshState();
    const dead = makeAdultSettler(99);
    dead.alive = false;
    const alive = makeAdultSettler(1);
    state.entities = [dead, alive];

    const delta = simTickDeltaFromWorld(state);
    delta.aliveEntities = [alive];

    const shadow = freshState();
    shadow.entities = [dead, alive];
    applySimTickDelta(shadow, delta);

    expect(shadow.entities).toHaveLength(1);
    expect(shadow.entities[0].id).toBe(1);
  });
});
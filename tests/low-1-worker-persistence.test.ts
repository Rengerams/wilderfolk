/**
 * Regression coverage for worker persistence and cache transport: prep/rollback snapshots restore
 * nested entity state and ledger/history fields, transient visuals ride the delta, and reused grids reconcile.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType, MapSize } from '../src/game/gameTypes';
import type { Entity, HuntVisual, TradeRoute, WorldState } from '../src/game/gameTypes';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import {
  isGrassGridEntity,
  isTreeGridEntity,
  syncGrassRenderGrid,
  syncTreeGrid,
} from '../src/game/spatialGrid';

function settlerFixture(): Entity {
  return {
    id: 1,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [7, 8],
    childhoodFriendsIds: [9],
    skills: { [JobType.Farmer]: 1 },
    friendships: { '2': 0.5 },
    feuds: { '3': 0.25 },
    moonHowlerSaved: { energy: 5, maxEnergy: 10, speed: 1, size: 2 },
  } as unknown as Entity;
}

function treeAt(id: number, x: number, y: number): Entity {
  return { id, type: EntityType.Tree, x, y, alive: true, size: 20 } as Entity;
}

function grassAt(id: number, x: number, y: number): Entity {
  return { id, type: EntityType.Grass, x, y, alive: true, size: 8 } as Entity;
}

/** The map every fixture in this suite is built on: a plain Medium world. */
function mediumWorld(seed: number): WorldState {
  return initGame({ size: MapSize.Medium, seed });
}

describe('worker persistence + cache transport (audit low-1)', () => {
  it('L65 — rolls back the economy ledger, food history and spoilage rate', () => {
    const world = mediumWorld(11);
    world.economyLedger = { day: 3, produced: { food: 10 }, consumed: { food: 2 } };
    world.foodHistory = [{ day: 2, produced: { food: 5 }, consumed: { food: 1 } }];
    world.foodSpoilageRate = 0.03;

    const prep = extractSimPrep(world);

    // The backup must own copies of the nested records, not references into live state.
    expect(prep.economyLedger).toEqual(world.economyLedger);
    expect(prep.economyLedger).not.toBe(world.economyLedger);
    expect(prep.economyLedger!.produced).not.toBe(world.economyLedger.produced);
    expect(prep.foodHistory).toEqual(world.foodHistory);
    expect(prep.foodHistory).not.toBe(world.foodHistory);

    // A daily tick that fails after writing the ledger leaves these in-place edits behind.
    world.economyLedger.produced.food = 99;
    world.foodHistory![0].consumed.food = 77;
    world.foodSpoilageRate = 0.008;

    applySimPrep(world, prep);

    expect(world.economyLedger).toEqual({ day: 3, produced: { food: 10 }, consumed: { food: 2 } });
    expect(world.foodHistory).toEqual([{ day: 2, produced: { food: 5 }, consumed: { food: 1 } }]);
    expect(world.foodSpoilageRate).toBe(0.03);
  });

  it('L66 — rolls back nested entity state and mutable array elements', () => {
    const world = mediumWorld(12);
    const settler = settlerFixture();
    world.entities = [settler];
    const route: TradeRoute = {
      id: 'route-1',
      targetName: 'North',
      resourcesGiven: { wood: 10, stone: 0, food: 0, gold: 0, iron: 0 },
      resourcesReceived: { wood: 0, stone: 0, food: 5, gold: 0, iron: 0 },
      reputationRequired: 0,
      active: true,
      caravanLeg: 'outbound',
      caravanWaitTicks: 0,
      caravansCompleted: 0,
    };
    world.tradeRoutes = [route];
    world.disasters = [{ type: 'fire', x: 1, y: 2, radius: 10, duration: 5, progress: 0 }];

    const prep = extractSimPrep(world);

    // In-place writes of the failed attempt — the writers the rollback must undo.
    settler.skills![JobType.Farmer] = 99;
    settler.childrenIds!.push(9);
    settler.childhoodFriendsIds!.push(10);
    // Relationship records are copy-on-write: a writer replaces the record, never mutates it.
    settler.friendships = { ...settler.friendships, '2': 0.9 };
    settler.feuds = { ...settler.feuds, '3': 0.8 };
    settler.moonHowlerSaved!.energy = 500;
    world.tradeRoutes[0].caravanWaitTicks = 9;
    world.tradeRoutes[0].caravansCompleted = 4;
    world.disasters[0].progress = 3;

    applySimPrep(world, prep);

    const restored = world.entities.find((e) => e.id === settler.id)!;
    expect(restored.skills).toEqual({ [JobType.Farmer]: 1 });
    expect(restored.childrenIds).toEqual([7, 8]);
    expect(restored.childhoodFriendsIds).toEqual([9]);
    expect(restored.friendships).toEqual({ '2': 0.5 });
    expect(restored.feuds).toEqual({ '3': 0.25 });
    expect(restored.moonHowlerSaved?.energy).toBe(5);
    expect(world.tradeRoutes[0].caravanWaitTicks).toBe(0);
    expect(world.tradeRoutes[0].caravansCompleted).toBe(0);
    expect(world.disasters[0].progress).toBe(0);
  });

  it('L59 — ships worker-authored hunt visuals to the display world', () => {
    const world = mediumWorld(13);
    const visual: HuntVisual = {
      id: 'hunt-1',
      hunterId: 1,
      preyType: EntityType.Deer,
      fromX: 5,
      fromY: 6,
      toX: 30,
      toY: 40,
      startedAtTick: world.tick,
      startedAtMs: 1_000,
      success: true,
      foughtBack: false,
    };
    world.huntVisuals = [visual];

    const delta = extractSimTickDelta(world, undefined, {
      cloneMode: 'isolated',
    });
    expect(delta.huntVisuals).toEqual([visual]);

    const display = mediumWorld(13);
    display.huntVisuals = [];
    applySimTickDelta(display, delta, { cloneMode: 'isolated' });
    expect(display.huntVisuals).toEqual([visual]);

    // The worker prunes the arrows itself; the removal has to reach the display too.
    world.huntVisuals = [];
    const cleared = extractSimTickDelta(world, undefined, {
      cloneMode: 'isolated',
    });
    applySimTickDelta(display, cleared, { cloneMode: 'isolated' });
    expect(display.huntVisuals).toEqual([]);
  });

  it('X5 — ships the workforce and village-mood HUD counters', () => {
    const world = mediumWorld(14);
    world.workingSettlers = 5;
    world.idleSettlers = 2;
    world.villageHappiness = 63;
    world.villageCanHeat = false;

    const delta = extractSimTickDelta(world, undefined, {
      cloneMode: 'isolated',
    });
    expect(delta.workingSettlers).toBe(5);
    expect(delta.idleSettlers).toBe(2);
    expect(delta.villageHappiness).toBe(63);
    expect(delta.villageCanHeat).toBe(false);

    const display = mediumWorld(14);
    applySimTickDelta(display, delta, { cloneMode: 'isolated' });
    expect(display.workingSettlers).toBe(5);
    expect(display.idleSettlers).toBe(2);
    expect(display.villageHappiness).toBe(63);
    expect(display.villageCanHeat).toBe(false);
  });

  it('L67 — reconciles a reused tree grid (late trees indexed, dead ones evicted)', () => {
    const first = treeAt(1, 10, 10);

    let grid = syncTreeGrid(undefined, 400, 300, [first]);
    expect(grid).toBeDefined();
    expect(grid!.validateInvariant([first], isTreeGridEntity)).toEqual([]);

    // A yearly `nature_boom` tree enters after the grid was first built.
    const grown = treeAt(2, 200, 150);
    grid = syncTreeGrid(grid, 400, 300, [first, grown]);
    expect(grid!.validateInvariant([first, grown], isTreeGridEntity)).toEqual([]);

    // A footprint chop kills one; the grid must evict it, not retain a dead entity.
    const chopped = { ...first, alive: false } as Entity;
    grid = syncTreeGrid(grid, 400, 300, [grown, chopped]);
    expect(grid!.validateInvariant([grown, chopped], isTreeGridEntity)).toEqual([]);
  });

  it('X4 — reconciles a reused grass render grid', () => {
    const first = grassAt(1, 20, 20);

    let grid = syncGrassRenderGrid(undefined, 400, 300, [first]);
    expect(grid).toBeDefined();
    expect(grid!.validateInvariant([first], isGrassGridEntity)).toEqual([]);

    // Grass spawns mid-run (daily ecology / world events).
    const sprouted = grassAt(2, 120, 90);
    grid = syncGrassRenderGrid(grid, 400, 300, [first, sprouted]);
    expect(grid!.validateInvariant([first, sprouted], isGrassGridEntity)).toEqual([]);

    // And it dies: the renderer draws from this grid, so a retained shim is ghost grass.
    const eaten = { ...first, alive: false } as Entity;
    grid = syncGrassRenderGrid(grid, 400, 300, [sprouted, eaten]);
    expect(grid!.validateInvariant([sprouted, eaten], isGrassGridEntity)).toEqual([]);
  });
});

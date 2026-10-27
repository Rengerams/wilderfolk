/**
 * Audit 2026-09-13, low-tier batch "low-1" — worker persistence and cache transport.
 *
 * Regression coverage for the findings fixed in this batch:
 * - L65: the worker prep/rollback snapshot carries the economy ledger, the rolling food
 *   history and the food spoilage rate. A tick that is rolled back after writing them used
 *   to keep the entries it produced before failing, so the retried/lost tick double-counted
 *   the Food ledger and its 30-day history.
 * - L66: the prep snapshot owns the nested entity state and object-array elements the tick
 *   mutates in place (`skills`, `childrenIds`, friendships/feuds, the Moon Howler snapshot,
 *   trade-route/disaster fields), so `applySimPrep` really restores them.
 * - L59: `huntVisuals` — produced and pruned only inside the worker — rides the tick delta
 *   like the neighbouring transient presentation arrays, so hunt arrows draw in worker mode.
 * - X5: the workforce/mood HUD counters (`workingSettlers`, `idleSettlers`,
 *   `villageHappiness`, `villageCanHeat`) reach the main-thread display world.
 * - L67: a reused tree grid is reconciled, so trees added or chopped after the first build
 *   are indexed/evicted instead of frozen at their create-time snapshot.
 * - X4: the same for the reusable grass render grid, whose renderer draws straight from it.
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

/**
 * The map every fixture in this suite is built on.
 *
 * These six fixtures used to pass `MapSize.Small`, which does not exist — `MapSize` is
 * `Medium | Large | Huge` (`src/game/gameTypes.ts`). The value was `undefined`, so `initGame`'s
 * `size = MapSize.Medium` destructuring default fired and every fixture was a 1200x900 **Medium**
 * map already. Naming the real size keeps the round-trip payload byte-identical and the intent
 * honest. A genuinely *small* map would need a new production `MapSize` member, which is a
 * production decision this suite must not make on its own.
 */
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

    // In-place writes of the failed attempt — the exact writers the audit names.
    settler.skills![JobType.Farmer] = 99;
    settler.childrenIds!.push(9);
    settler.childhoodFriendsIds!.push(10);
    settler.friendships!['2'] = 0.9;
    settler.feuds!['3'] = 0.8;
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
      headless: true,
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
      headless: true,
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
      headless: true,
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

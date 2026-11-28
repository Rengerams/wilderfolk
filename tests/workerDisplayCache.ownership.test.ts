import { GRASS_CELL_SIZE, TREE_CELL_SIZE, isGrassGridEntity, isTreeGridEntity, syncEntitySpatialGrid } from '../src/game/spatialGrid';
import type { Entity } from '../src/game/gameTypes';
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { MapSize, EntityType } from '../src/game/gameTypes';
import { EntityCatalog } from '../src/game/entityCatalog';
import {
  hydrateWorldRuntimeCaches,
} from '../src/game/worldRuntimeCaches';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

describe('worker display cache ownership', () => {
  it('adopts the validated live lookup after a worker tick without a second entity scan', () => {
    const world = initGame({ size: MapSize.Medium, seed: 417 });
    hydrateWorldRuntimeCaches(world);
    const catalog = new EntityCatalog();
    catalog.rebuild(world.entities);
    const expected = catalog.getAlive().map((entity) => entity.id);
    const worldIndex = world.entityById;
    catalog.adoptWorldIndex(world);
    expect(world.entityById).toBe(worldIndex);
    expect(catalog.getAlive().map((entity) => entity.id)).toEqual(expected);
    expect(catalog.getAliveByType(EntityType.Human).map((entity) => entity.id))
      .toEqual(world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human).map((entity) => entity.id));

    const removed = world.entities.find((entity) => entity.alive);
    if (!removed) throw new Error('the scenario contains no live entities');
    world.entities = world.entities.filter((entity) => entity.id !== removed.id);
    hydrateWorldRuntimeCaches(world);
    catalog.adoptWorldIndex(world);
    expect(catalog.get(removed.id)).toBeUndefined();
    expect(catalog.countAlive()).toBe(world.entities.filter((entity) => entity.alive).length);
  });

  it('retains geometry caches when the caller verified the geometry is unchanged', () => {
    const world = initGame({ size: MapSize.Medium, seed: 418 });
    hydrateWorldRuntimeCaches(world);
    const previousAdjacency = world.adjacency;
    const previousRoadAvoidance = world.roadAvoidance;
    const sentinelAdjacency = { generation: 11 } as unknown as NonNullable<typeof world.adjacency>;
    const sentinelRoadAvoidance = { generation: 13 } as unknown as NonNullable<typeof world.roadAvoidance>;
    world.adjacency = sentinelAdjacency;
    world.roadAvoidance = sentinelRoadAvoidance;
    hydrateWorldRuntimeCaches(world, true);
    expect(world.adjacency).toBe(sentinelAdjacency);
    expect(world.roadAvoidance).toBe(sentinelRoadAvoidance);
    hydrateWorldRuntimeCaches(world);
    expect(world.adjacency).toBe(previousAdjacency);
    expect(world.roadAvoidance).toBe(previousRoadAvoidance);
  });

  it('rebuilds geometry caches on save/import instead of carrying the old session', () => {
    const world = initGame({ size: MapSize.Medium, seed: 419 });
    hydrateWorldRuntimeCaches(world);
    const sentinelAdjacency = { generation: 21 } as unknown as NonNullable<typeof world.adjacency>;
    const sentinelBeauty = { generation: 22 } as unknown as NonNullable<typeof world.beautyGrid>;
    world.adjacency = sentinelAdjacency;
    world.beautyGrid = sentinelBeauty;
    const json = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
    const parsed = parseSaveJson(json);
    if (!parsed.valid) throw new Error('fixture save was refused');
    const loaded = loadGameFromParsed(parsed.parsed);
    if (!loaded) throw new Error('fixture load failed');

    expect(loaded.world.adjacency).not.toBe(sentinelAdjacency);
    expect(loaded.world.beautyGrid).not.toBe(sentinelBeauty);
    hydrateWorldRuntimeCaches(loaded.world);
    expect(loaded.world.adjacency).not.toBe(sentinelAdjacency);
    const sourceById = new Map(world.buildings.map((building) => [building.id, building]));
    for (const building of loaded.world.buildings) {
      const source = sourceById.get(building.id);
      if (source) expect([building.x, building.y]).toEqual([source.x, source.y]);
    }
  });
});

describe('reused spatial grids reconcile their live entries', () => {
  function treeAt(id: number, x: number, y: number): Entity {
    return { id, type: EntityType.Tree, x, y, alive: true, size: 20 } as Entity;
  }

  function grassAt(id: number, x: number, y: number): Entity {
    return { id, type: EntityType.Grass, x, y, alive: true, size: 8 } as Entity;
  }

  it('L67 — reconciles a reused tree grid (late trees indexed, dead ones evicted)', () => {
    const first = treeAt(1, 10, 10);

    let grid = syncEntitySpatialGrid(undefined, 400, 300, [first], TREE_CELL_SIZE, isTreeGridEntity);
    expect(grid).toBeDefined();
    expect(grid!.validateInvariant([first], isTreeGridEntity)).toEqual([]);

    // A yearly `nature_boom` tree enters after the grid was first built.
    const grown = treeAt(2, 200, 150);
    grid = syncEntitySpatialGrid(grid, 400, 300, [first, grown], TREE_CELL_SIZE, isTreeGridEntity);
    expect(grid!.validateInvariant([first, grown], isTreeGridEntity)).toEqual([]);

    // A footprint chop kills one; the grid must evict it, not retain a dead entity.
    const chopped = { ...first, alive: false } as Entity;
    grid = syncEntitySpatialGrid(grid, 400, 300, [grown, chopped], TREE_CELL_SIZE, isTreeGridEntity);
    expect(grid!.validateInvariant([grown, chopped], isTreeGridEntity)).toEqual([]);
  });

  it('X4 — reconciles a reused grass render grid', () => {
    const first = grassAt(1, 20, 20);

    let grid = syncEntitySpatialGrid(undefined, 400, 300, [first], GRASS_CELL_SIZE, isGrassGridEntity);
    expect(grid).toBeDefined();
    expect(grid!.validateInvariant([first], isGrassGridEntity)).toEqual([]);

    // Grass spawns mid-run (daily ecology / world events).
    const sprouted = grassAt(2, 120, 90);
    grid = syncEntitySpatialGrid(grid, 400, 300, [first, sprouted], GRASS_CELL_SIZE, isGrassGridEntity);
    expect(grid!.validateInvariant([first, sprouted], isGrassGridEntity)).toEqual([]);

    // And it dies: the renderer draws from this grid, so a retained shim is ghost grass.
    const eaten = { ...first, alive: false } as Entity;
    grid = syncEntitySpatialGrid(grid, 400, 300, [sprouted, eaten], GRASS_CELL_SIZE, isGrassGridEntity);
    expect(grid!.validateInvariant([sprouted, eaten], isGrassGridEntity)).toEqual([]);
  });
});

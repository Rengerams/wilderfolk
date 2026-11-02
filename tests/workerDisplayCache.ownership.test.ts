import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { MapSize, EntityType } from '../src/game/gameTypes';
import { EntityCatalog } from '../src/game/entityCatalog';
import {
  hydrateWorldRuntimeCaches,
} from '../src/game/worldRuntimeCaches';

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

  it('retains geometry-only caches only when the authoritative building diff is empty', () => {
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
});

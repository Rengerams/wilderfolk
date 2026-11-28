import { EntityType, MapSize } from '../src/game/gameTypes';
/**
 * The per-world entity-bucket cache must validate against the current population: unchanged →
 * the same bucket object, a spawn between ticks → rebuilt buckets.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { buildEntityByType } from '../src/game/simFocus';
import { cacheEntityByType, getCachedEntityByType } from '../src/game/entityTypeCache';
import type { Entity } from '../src/game/gameTypes';

describe('entity-type cache validation', () => {
  it('reuses the buckets for an unchanged population and rebuilds them after a between-tick spawn', () => {
    const world = initGame({ seed: 7 });
    const alive = world.entities.filter((e) => e.alive);
    expect(alive.length).toBeGreaterThan(0);

    // What a tick leaves behind: the buckets for this population, cached on this world object.
    const cached = buildEntityByType(alive);
    cacheEntityByType(world, cached);

    // Unchanged population → same object (the perf contract the cache exists for).
    expect(getCachedEntityByType(world, alive)).toBe(cached);

    // A spawn that happens *between* ticks: the world gains an entity and nothing clears the cache.
    const newcomer: Entity = { ...alive[0], id: world.nextEntityId++ };
    const aliveAfterSpawn = [...alive, newcomer];

    const rebuilt = getCachedEntityByType(world, aliveAfterSpawn);
    expect(rebuilt).not.toBe(cached);
    expect(rebuilt[newcomer.type].includes(newcomer)).toBe(true);
    // The fingerprint is the bucket total: every alive entity is represented exactly once.
    const total = Object.values(rebuilt).reduce((sum, bucket) => sum + bucket.length, 0);
    expect(total).toBe(aliveAfterSpawn.length);
  });
});

describe('fresh world entity buckets', () => {
  it('L80 — initGame fills entityByType instead of leaving defined-but-empty buckets', () => {
    const world = initGame({ seed: 3, size: MapSize.Medium });
    const livingGrass = world.entities.filter(e => e.alive && e.type === EntityType.Grass).length;
    expect(livingGrass).toBeGreaterThan(0);
    // `entityByType` is optional on the save-compatibility surface; this test is exactly the
    // claim that a freshly generated world defines it.
    expect(world.entityByType).toBeTruthy();
    const byType = world.entityByType!;
    expect(byType[EntityType.Grass].length).toBe(livingGrass);
    expect(byType[EntityType.Rabbit].length).toBe(world.entities.filter(e => e.alive && e.type === EntityType.Rabbit).length);
  });
});

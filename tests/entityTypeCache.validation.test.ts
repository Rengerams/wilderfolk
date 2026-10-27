/**
 * The per-world entity-bucket cache must not outlive the population it describes.
 *
 * `getCachedEntityByType` is the cache's only reader, and the entry is cleared only by
 * `invalidateCachedEntityByType` (`worldRuntimeCaches.ts`) or by the tick's own composition
 * heuristic (`gameTick.ts`, `deathsThisTick` / `untrackedSpawns`) — and that heuristic counts only
 * spawns that happen *during* a tick, because it diffs the tick's opening list. An entity added
 * between ticks therefore left the stale entry in place: the next tick read buckets that omitted it
 * and then republished them as `state.entityByType`, so `ctx.byType` (predator selection,
 * `playerHumans`, workforce counts) and every `byType` renderer for one tick described a population
 * that no longer existed. The only detector was `assertSimInvariants`' bucket-count check
 * (`simulation/simInvariants.ts`), which is dev-only and runs once per colony day.
 *
 * The reuse contract is as important as the rebuild: an unchanged population must still return the
 * same bucket object, which is what the cache exists for (`gameTick` compares `state.entityByType`
 * identity to decide whether the render catalog has to rebuild).
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

import type { Entity, EntityByType, WorldState } from './gameTypes';
import { buildEntityByType } from './simFocus';

/**
 * Identity-stable entity buckets for unchanged local ticks, keyed by WorldState so a worker delta
 * can explicitly invalidate them.
 */
const stableByTypeByWorld = new WeakMap<WorldState, EntityByType>();

/** Entities held in a bucket set — the cheap fingerprint the cache is validated against. */
function bucketedEntityCount(byType: EntityByType): number {
  let total = 0;
  for (const bucket of Object.values(byType)) total += bucket.length;
  return total;
}

/**
 * The cached buckets for this world, or freshly built ones, validated against the caller's entity
 * count: an entity added between ticks would otherwise be missing from the republished buckets.
 */
export function getCachedEntityByType(state: WorldState, aliveEntities: readonly Entity[]): EntityByType {
  const cached = stableByTypeByWorld.get(state);
  if (cached && bucketedEntityCount(cached) === aliveEntities.length) return cached;
  if (cached) stableByTypeByWorld.delete(state);
  const fresh = buildEntityByType(aliveEntities);
  stableByTypeByWorld.set(state, fresh);
  return fresh;
}

export function cacheEntityByType(state: WorldState, byType: EntityByType): void {
  stableByTypeByWorld.set(state, byType);
}

export function invalidateCachedEntityByType(state: WorldState): void {
  stableByTypeByWorld.delete(state);
  state.entityByType = undefined;
}

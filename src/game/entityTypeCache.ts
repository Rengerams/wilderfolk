import type { Entity, EntityByType, WorldState } from './gameTypes';
import { buildEntityByType } from './simFocus';

/**
 * Identity-stable entity buckets for unchanged local ticks. The cache is keyed
 * by WorldState so it can be explicitly invalidated when a worker delta swaps
 * the entity array beneath an existing world object.
 */
const stableByTypeByWorld = new WeakMap<WorldState, EntityByType>();

/** Entities held in a bucket set — the cheap fingerprint the cache is validated against. */
function bucketedEntityCount(byType: EntityByType): number {
  let total = 0;
  for (const bucket of Object.values(byType)) total += bucket.length;
  return total;
}

/**
 * The cached buckets for this world, or freshly built ones.
 *
 * The cache is validated against the caller's entity list before it is reused. Without that check a
 * bucket set could outlive the population it describes: the cache is only cleared by
 * `invalidateCachedEntityByType` (`worldRuntimeCaches.ts`) and by the tick's own composition
 * heuristic (`gameTick.ts`, `deathsThisTick`/`untrackedSpawns`), and that heuristic counts only
 * spawns that happen *during* a tick — an entity added between ticks (a command, a harness) leaves
 * the entry in place, and the next tick then republishes buckets that omit it, which is exactly the
 * divergence `assertSimInvariants`' bucket-count check (`simulation/simInvariants.ts`) exists to
 * catch — but that check is dev-only and runs once per colony day.
 *
 * The fingerprint is the bucket total, so a same-size composition swap (one death + one spawn
 * between ticks) is still the tick's own business — `gameTick` rebuilds on `deathsThisTick > 0`.
 */
export function getCachedEntityByType(state: WorldState, aliveEntities: readonly Entity[]): EntityByType {
  const cached = stableByTypeByWorld.get(state);
  if (cached && bucketedEntityCount(cached) === aliveEntities.length) return cached;
  if (cached) stableByTypeByWorld.delete(state);
  return buildEntityByType(aliveEntities);
}

export function cacheEntityByType(state: WorldState, byType: EntityByType): void {
  stableByTypeByWorld.set(state, byType);
}

export function invalidateCachedEntityByType(state: WorldState): void {
  stableByTypeByWorld.delete(state);
  state.entityByType = undefined;
}

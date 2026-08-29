import type { WorldState } from './gameTypes';
import { invalidateEntityByIdMap, rebuildEntityByIdMap } from './entityIndex';
import { invalidateCachedEntityByType } from './entityTypeCache';

/**
 * Strips all non-serializable class instances and transient runtime caches from WorldState.
 *
 * Called whenever state crosses thread boundaries (Web Worker postMessage),
 * is imported from a save file, or is prepped for cloning.
 */
export function invalidateWorldRuntimeCaches(world: WorldState): void {
  if (!world || typeof world !== 'object') return;

  // 1. Invalidate entity lookup maps
  invalidateCachedEntityByType(world);
  invalidateEntityByIdMap(world);

  // 2. Drop stripped spatial hash grid prototypes
  world.grassGrid = undefined;
  world.mobileGrid = undefined;
  world.humanSocialGrid = undefined;
  world.treeGrid = undefined;
  world.scentGrid = undefined;

  // 3. Drop road index and adjacency graphs
  world.roadAvoidance = undefined;
  world.roadAvoidanceStamp = undefined;
  world.adjacency = undefined;
}

/**
 * Restores essential runtime indices (such as entityById) so that subsequent
 * commands or immediate tick lookups execute with O(1) performance.
 */
export function hydrateWorldRuntimeCaches(world: WorldState): WorldState {
  if (!world || typeof world !== 'object') return world;

  invalidateWorldRuntimeCaches(world);
  rebuildEntityByIdMap(world);

  return world;
}

/**
 * Creates a detached, fully hydrated copy of WorldState safe for
 * optimistic UI presentation and immediate inspector lookups.
 */
export function createOptimisticDisplayWorld(authoritative: WorldState): WorldState {
  if (!authoritative) return authoritative;

  // Deep clone authoritative game state
  const cloned = structuredClone(authoritative);

  // Hydrate entity lookup indices for immediate UI queries
  return hydrateWorldRuntimeCaches(cloned);
}

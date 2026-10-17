import type { WorldState } from './gameTypes';
import { invalidateEntityByIdMap, rebuildEntityByIdMap } from './entityIndex';
import { invalidateCachedEntityByType } from './entityTypeCache';


export function invalidateWorldRuntimeCaches(world: WorldState): void {
  if (!world || typeof world !== 'object') return;

  // 1. Invalidate entity lookup maps
  invalidateCachedEntityByType(world);
  invalidateEntityByIdMap(world);

  // 2. Drop stripped spatial hash grids and the derived beauty field.
  world.grassGrid = undefined;
  world.mobileGrid = undefined;
  world.humanSocialGrid = undefined;
  world.treeGrid = undefined;
  world.scentGrid = undefined;
  world.beautyGrid = undefined;
  world.roadAvoidance = undefined;
  world.roadAvoidanceStamp = undefined;
  world.adjacency = undefined;
}


export function hydrateWorldRuntimeCaches(world: WorldState): WorldState {
  if (!world || typeof world !== 'object') return world;

  invalidateWorldRuntimeCaches(world);
  rebuildEntityByIdMap(world);

  return world;
}


export interface PreservedSimulationState {
  scentGrid: WorldState['scentGrid'];
}

/** Take the simulation state out before a rebuild, so it can be put back after one. */
export function captureSimulationState(world: WorldState): PreservedSimulationState {
  if (!world || typeof world !== 'object') return { scentGrid: undefined };
  return { scentGrid: world.scentGrid };
}

/** Put captured simulation state back onto `world` (see `PreservedSimulationState`). */
export function restoreSimulationState(world: WorldState, preserved: PreservedSimulationState): void {
  if (!world || typeof world !== 'object') return;
  world.scentGrid = preserved.scentGrid;
}

export function rebuildWorldRuntimeCaches(world: WorldState): WorldState {
  if (!world || typeof world !== 'object') return world;

  const preserved = captureSimulationState(world);
  hydrateWorldRuntimeCaches(world); // invalidates the derived caches, then rebuilds entityById
  restoreSimulationState(world, preserved);

  return world;
}

export function createOptimisticDisplayWorld(authoritative: WorldState): WorldState {
  if (!authoritative) return authoritative;

  // Deep clone authoritative game state
  const cloned = structuredClone(authoritative);

  // Hydrate entity lookup indices for immediate UI queries
  return hydrateWorldRuntimeCaches(cloned);
}

export function carryPresentationControls(
  display: WorldState,
  presentationSource: WorldState | null | undefined,
): WorldState {
  if (!display || !presentationSource) return display;
  display.speed = presentationSource.speed;
  display.paused = presentationSource.paused;
  return display;
}
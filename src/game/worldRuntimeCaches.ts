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

/**
 * Copies the player-authored scheduling controls from the current display world
 * onto a freshly built display world.
 *
 * `speed` and `paused` live inside `WorldState` — the worker needs its own copies
 * so `gameTick()` can early-return while paused and so prep/sync round-trips stay
 * coherent — but the simulation never *authors* them. The player does, on the
 * main thread, and the main thread is also what reads `speed` to schedule ticks
 * (`GameLoop.frame()`: `msPerTick = 1000 / (BASE_TICKS_PER_SECOND * speed)`).
 *
 * That split makes the values revertible: a display rebuild clones the worker's
 * **last received** snapshot, which can predate the player's click because the
 * `setSpeed` / `setPaused` message is still in flight. Without this carry-over,
 * choosing 5× and then building anything silently drops the game back to the
 * snapshot's speed, and nothing resends it (`mutateWorld` forwards a control only
 * when it changed). Pause is the same hazard in mirror image: the loop would
 * request ticks the worker still ignores, while the UI reads "playing".
 *
 * Deliberately limited to these two fields. Everything else — including the
 * worker-authored presentation slices (`bigNews`, `floatingTexts`, and the
 * dismissed-id sets) — must keep coming from the authoritative snapshot, because
 * the simulation produces those and a stale display copy would hide new entries.
 */
export function carryPresentationControls(
  display: WorldState,
  presentationSource: WorldState | null | undefined,
): WorldState {
  if (!display || !presentationSource) return display;
  display.speed = presentationSource.speed;
  display.paused = presentationSource.paused;
  return display;
}

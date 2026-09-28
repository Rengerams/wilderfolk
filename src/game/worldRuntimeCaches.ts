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

  // 2. Drop stripped spatial hash grids and the derived beauty field.
  world.grassGrid = undefined;
  world.mobileGrid = undefined;
  world.humanSocialGrid = undefined;
  world.treeGrid = undefined;
  world.scentGrid = undefined;
  // `beautyGrid` is derived daily from the decor layout (`beautyGrid.ts`), held as a typed array, and
  // read by the sim gated on `state.beautyGrid != null` (`humanTick`). It was missing here while
  // `saveLoad` stripped it as a runtime field and `workerBoundary.closure.test.ts` listed it as one, so
  // this function did not in fact strip every runtime cache — a live `Int16Array` could ride an export
  // clone, and nothing forced the load path to recompute it.
  world.beautyGrid = undefined;

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
 * Simulation state that happens to sit in a runtime-cache slot.
 *
 * `scentGrid` shares the slot family with the derived spatial hashes, but it is not one of them: it
 * is the accumulated predator-odour field that grazers sample to flee (`tickLayerSystems.ts` →
 * `sampleFleeGradient`), decayed and deposited into in place every tick (`tickLayerRealtime.ts`).
 * Dropping it is correct when the world is *replaced* — the save path's `stripRuntimeWorldFields`
 * drops it too and `loadGameFromParsed` recreates it — and wrong whenever the simulation keeps
 * running on the same world, because the trail then restarts from zero.
 *
 * Keep this knowledge here, once: a rebuild that continues the simulation goes through
 * `rebuildWorldRuntimeCaches` (or the `capture`/`restore` pair when something has to happen in
 * between), so no call site has to remember which slots are state and which are derived.
 */
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

/**
 * Drops and re-hydrates the derived runtime caches while carrying the simulation state across.
 *
 * Use this instead of `invalidateWorldRuntimeCaches` + `hydrateWorldRuntimeCaches` wherever the
 * simulation continues on `world`: the invalidate cannot tell the odour field from a spatial hash
 * and would zero the trail.
 */
export function rebuildWorldRuntimeCaches(world: WorldState): WorldState {
  if (!world || typeof world !== 'object') return world;

  const preserved = captureSimulationState(world);
  hydrateWorldRuntimeCaches(world); // invalidates the derived caches, then rebuilds entityById
  restoreSimulationState(world, preserved);

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
 * last received snapshot, which can predate the player's click because the
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
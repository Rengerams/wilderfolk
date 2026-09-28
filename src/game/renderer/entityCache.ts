import type { Camera, Entity, EntityByType } from '../gameTypes';
import { EntityType as EntityTypeEnum, UNCACHED_RENDER_TICK } from '../gameTypes';
import type { RenderSnapshot } from '../renderSnapshot';
import {
  invalidateRenderSoABucketsCache,
  updateRenderSoABuckets,
  type RenderSoABuckets,
} from '../simBuffers/renderSoAEntities';
import { collectGrassInViewport, viewportFromCamera } from '../spatialGrid';
import { buildEntityDrawBuckets } from '../simFocus';

/** Viewport cache key precision — sub-pixel camera drift should not invalidate grass. */
const GRASS_VIEWPORT_KEY_XY_DIGITS = 1;
const GRASS_VIEWPORT_KEY_ZOOM_DIGITS = 3;
const ENTITY_VIEWPORT_KEY_XY_DIGITS = 1;
const ENTITY_VIEWPORT_KEY_ZOOM_DIGITS = 3;

let _cachedEntityTick = UNCACHED_RENDER_TICK;
/**
 * The render buffer the draw buckets were built from.
 *
 * A tick counter alone is not a sufficient key. The `tick` only advances inside `gameTick`, so a
 * **command** that changes what the render SoA shows produces a fresh buffer at an unchanged tick —
 * a spawned entity, cleared `chatTicks`, changed residence or hidden flags. Keyed on the tick alone,
 * `updateCachedEntitiesFromSoA` took the "nothing changed" branch and the canvas kept drawing the
 * previous buffer's shims while `GameLoop` had already adopted the new reader and patched the
 * inspector from it. While the game is **paused** — the natural moment to issue such a command — no
 * tick ever arrives, so the change was invisible until the player unpaused.
 *
 * `GameWorkerHost.buildRender` creates a new `RenderSoAReaderV1` per message, so its identity is the
 * buffer's identity and a command refresh is detected as a change. `useRef`-style identity compares
 * are exact here: two messages never share a reader.
 */
let _cachedRenderReader: RenderSnapshot['renderSoA'] = null;
let _cachedEntityViewportKey = '';
let _cachedGrassKey = '';

/** Full per-tick entity lists (not viewport-culled). */
export let _tickTrees: Entity[] = [];
export let _tickAnimals: Entity[] = [];
export let _tickHumans: Entity[] = [];

/** Viewport-culled entity lists used for rendering. */
export let _cachedTrees: Entity[] = [];
export let _cachedAnimals: Entity[] = [];
export let _cachedHumans: Entity[] = [];
export let _cachedGrass: Entity[] = [];

export const _cachedPartnerById = new Map<number, number>();

export let _renderSoABuckets: RenderSoABuckets | null = null;

/** Clear all entity draw caches. Called by {@link resetRendererCaches}. */
export function resetEntityCaches(): void {
  _cachedEntityTick = UNCACHED_RENDER_TICK;
  _cachedRenderReader = null;
  _cachedEntityViewportKey = '';
  _cachedGrassKey = '';
  _tickTrees = [];
  _tickAnimals = [];
  _tickHumans = [];
  _cachedTrees = [];
  _cachedAnimals = [];
  _cachedHumans = [];
  _cachedGrass = [];
  _cachedPartnerById.clear();
  _renderSoABuckets = null;
  invalidateRenderSoABucketsCache();
}

function grassViewportKey(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
): string {
  return `${tick}|${cam.x.toFixed(GRASS_VIEWPORT_KEY_XY_DIGITS)}|${cam.y.toFixed(GRASS_VIEWPORT_KEY_XY_DIGITS)}|${cam.zoom.toFixed(GRASS_VIEWPORT_KEY_ZOOM_DIGITS)}|${cw}|${ch}`;
}

function entityViewportKey(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
): string {
  return `${tick}|${cam.x.toFixed(ENTITY_VIEWPORT_KEY_XY_DIGITS)}|${cam.y.toFixed(ENTITY_VIEWPORT_KEY_XY_DIGITS)}|${cam.zoom.toFixed(ENTITY_VIEWPORT_KEY_ZOOM_DIGITS)}|${cw}|${ch}`;
}

function syncDrawCacheTick(tick: number): boolean {
  if (tick === _cachedEntityTick) return false;
  _cachedEntityTick = tick;
  _cachedGrassKey = '';
  _cachedEntityViewportKey = '';
  return true;
}

/**
 * Whether the draw buckets must be rebuilt for this snapshot — a new tick **or** a new render buffer.
 *
 * The two are different events: a command refresh replaces the buffer without advancing the tick (see
 * `_cachedRenderReader`), and both must invalidate the tick-keyed grass and entity viewport caches.
 */
function syncDrawCacheSource(snapshot: RenderSnapshot): boolean {
  const tickChanged = syncDrawCacheTick(snapshot.tick);
  if (snapshot.renderSoA === _cachedRenderReader) return tickChanged;

  _cachedRenderReader = snapshot.renderSoA;
  // Same tick, new buffer: the viewport keys embed the tick, so they would otherwise still match and
  // serve the previous buffer's lists.
  _cachedGrassKey = '';
  _cachedEntityViewportKey = '';
  return true;
}

function filterEntitiesInViewport(entities: Entity[], cam: Camera, cw: number, ch: number): Entity[] {
  // `viewportFromCamera` is a constant of this call, so it is built once instead of once per
  // candidate entity (it was previously re-derived inside the predicate for all ~N candidates).
  const pad = 72;
  const vp = viewportFromCamera(cam.x, cam.y, cam.zoom, cw, ch, pad);
  return entities.filter(
    (entity) =>
      !entity.hiddenFromPlayer
      && entity.x >= vp.minX
      && entity.x <= vp.maxX
      && entity.y >= vp.minY
      && entity.y <= vp.maxY,
  );
}

function syncGrassDrawCache(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
  collectVisibleGrass: () => Entity[],
): void {
  const grassKey = grassViewportKey(tick, cam, cw, ch);
  if (grassKey === _cachedGrassKey) return;
  _cachedGrassKey = grassKey;
  _cachedGrass = collectVisibleGrass();
}

function entitiesFromSoASlots(slots: number[], shimBySlot: Map<number, Entity>): Entity[] {
  const entities: Entity[] = [];
  for (const slot of slots) {
    const entity = shimBySlot.get(slot);
    if (entity) entities.push(entity);
  }
  return entities;
}

function syncEntityDrawViewport(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
): void {
  const viewportKey = entityViewportKey(tick, cam, cw, ch);
  if (viewportKey === _cachedEntityViewportKey) return;
  _cachedEntityViewportKey = viewportKey;
  _cachedTrees = filterEntitiesInViewport(_tickTrees, cam, cw, ch);
  _cachedAnimals = filterEntitiesInViewport(_tickAnimals, cam, cw, ch);
  _cachedHumans = filterEntitiesInViewport(_tickHumans, cam, cw, ch);

  _cachedPartnerById.clear();
  for (const h of _cachedHumans) {
    if (h.partnerId && h.relationshipStatus === 'married') {
      _cachedPartnerById.set(h.id, h.partnerId);
    }
  }
}

export function updateCachedEntities(
  byType: EntityByType,
  grassGrid: RenderSnapshot['grassGrid'],
  tick: number,
  cam: Camera,
  mapW: number,
  mapH: number,
  cw: number,
  ch: number,
) {
  const tickChanged = syncDrawCacheTick(tick);
  if (tickChanged) {
    const buckets = buildEntityDrawBuckets(byType);
    _tickTrees = buckets.trees;
    _tickAnimals = buckets.animals;
    _tickHumans = buckets.humans;
    _renderSoABuckets = null;
  }
  syncEntityDrawViewport(tick, cam, cw, ch);

  syncGrassDrawCache(tick, cam, cw, ch, () =>
    collectGrassInViewport(
      grassGrid,
      byType[EntityTypeEnum.Grass],
      mapW,
      mapH,
      cam.x,
      cam.y,
      cam.zoom,
      cw,
      ch,
    ),
  );
}

/** Phase B — bucket render SoA slots into draw lists (no Entity[] hydration on main). */
export function updateCachedEntitiesFromSoA(state: RenderSnapshot, cw: number, ch: number) {
  if (!state.renderSoA) return;
  const sourceChanged = syncDrawCacheSource(state);
  if (sourceChanged) {
    _renderSoABuckets = updateRenderSoABuckets(
      state.renderSoA,
      state.renderMetaBySlot ?? undefined,
      state.tick,
    );
    _tickTrees = entitiesFromSoASlots(_renderSoABuckets.treeSlots, _renderSoABuckets.shimBySlot);
    _tickAnimals = entitiesFromSoASlots(_renderSoABuckets.animalSlots, _renderSoABuckets.shimBySlot);
    _tickHumans = entitiesFromSoASlots(_renderSoABuckets.humanSlots, _renderSoABuckets.shimBySlot);
  } else if (!_renderSoABuckets) {
    _renderSoABuckets = updateRenderSoABuckets(
      state.renderSoA,
      state.renderMetaBySlot ?? undefined,
      state.tick,
    );
  }
  syncEntityDrawViewport(state.tick, state.camera, cw, ch);

  // The fallback list is the SoA path's own shims, not `[]`. `syncGrassRenderGridFromSoA` returns
  // `undefined` when the spatial grid is switched off (`VITE_USE_SPATIAL_GRID=0`), and
  // `collectGrassInViewport` then falls back to a linear scan of the array it is handed — so a
  // hard-coded empty array drew **no grass at all** on the worker path while the main-thread path
  // still drew it, which is exactly the A/B comparison the switch exists to make. The shims are the
  // same objects the grid would have indexed, so the two paths now differ only in the lookup.
  const grassFallback = _renderSoABuckets
    ? entitiesFromSoASlots(_renderSoABuckets.grassSlots, _renderSoABuckets.shimBySlot)
    : [];
  syncGrassDrawCache(state.tick, state.camera, cw, ch, () =>
    collectGrassInViewport(
      state.grassGrid,
      grassFallback,
      state.width,
      state.height,
      state.camera.x,
      state.camera.y,
      state.camera.zoom,
      cw,
      ch,
    ),
  );
}

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
  _treeBands = null;
  _animalBands = null;
  _humanBands = null;
  _soaGrassFallback = [];
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

/** World-px pad added to the visible rect before culling, so a sprite cannot pop in at the edge. */
const ENTITY_VIEWPORT_PAD_PX = 72;

/** The viewport membership rule: visible, and inside the world rect. */
function pushEntitiesInBounds(
  entities: readonly Entity[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  out: Entity[],
): void {
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (entity.hiddenFromPlayer) continue;
    if (entity.x < minX || entity.x > maxX || entity.y < minY || entity.y > maxY) continue;
    out.push(entity);
  }
}

/** Entities of one tick list inside a world rect, in list order — the linear reference walk. */
export function filterEntitiesInViewportBounds(
  entities: readonly Entity[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Entity[] {
  const visible: Entity[] = [];
  pushEntitiesInBounds(entities, minX, minY, maxX, maxY, visible);
  return visible;
}

/** Contiguous groups a tick list is cut into for viewport queries. */
const VIEWPORT_CHUNK_COUNT = 16;

/** One contiguous group of a tick list, with the y range its entities actually occupy. */
export interface ViewportChunk {
  readonly entities: readonly Entity[];
  readonly minY: number;
  readonly maxY: number;
}

/**
 * A tick list cut into contiguous chunks, each labelled by the y range it covers.
 *
 * A camera pan rebuilds the viewport lists every frame, and the previous code re-tested every tree,
 * animal and settler in the world to do it. Chunks are contiguous slices, so a query returns entities
 * in the list's own depth order; the y range is a *conservative* box around each chunk, so a list that
 * is not y-sorted widens a chunk's range instead of hiding an entity from the query.
 */
export interface ViewportBands {
  readonly chunks: readonly ViewportChunk[];
}

/** Cut a tick list into {@link VIEWPORT_CHUNK_COUNT} contiguous chunks with their y ranges. */
export function buildViewportBands(entities: readonly Entity[]): ViewportBands {
  const chunks: ViewportChunk[] = [];
  if (entities.length === 0) return { chunks };
  const perChunk = Math.ceil(entities.length / VIEWPORT_CHUNK_COUNT);
  for (let start = 0; start < entities.length; start += perChunk) {
    const end = Math.min(entities.length, start + perChunk);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = start; i < end; i++) {
      const y = entities[i].y;
      if (!Number.isFinite(y)) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    chunks.push({ entities: entities.slice(start, end), minY, maxY });
  }
  return { chunks };
}

/** Entities inside a world rect, in list order — only the chunks that can hold one are scanned. */
export function collectInViewportBounds(
  bands: ViewportBands | null,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Entity[] {
  const visible: Entity[] = [];
  if (!bands) return visible;
  for (let c = 0; c < bands.chunks.length; c++) {
    const chunk = bands.chunks[c];
    if (chunk.maxY < minY || chunk.minY > maxY) continue;
    pushEntitiesInBounds(chunk.entities, minX, minY, maxX, maxY, visible);
  }
  return visible;
}

/** Tick-keyed chunk indexes for the three viewport-culled draw lists. */
let _treeBands: ViewportBands | null = null;
let _animalBands: ViewportBands | null = null;
let _humanBands: ViewportBands | null = null;
/** The SoA grass shims, rebuilt with the buckets — the linear fallback `collectGrassInViewport` reads. */
let _soaGrassFallback: Entity[] = [];

function rebuildViewportBands(): void {
  _treeBands = buildViewportBands(_tickTrees);
  _animalBands = buildViewportBands(_tickAnimals);
  _humanBands = buildViewportBands(_tickHumans);
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
  const vp = viewportFromCamera(cam.x, cam.y, cam.zoom, cw, ch, ENTITY_VIEWPORT_PAD_PX);
  // The chunk indexes are built with the lists they describe; the linear walks below are the
  // fallback for a caller that filled a list without one.
  _cachedTrees = _treeBands
    ? collectInViewportBounds(_treeBands, vp.minX, vp.minY, vp.maxX, vp.maxY)
    : filterEntitiesInViewportBounds(_tickTrees, vp.minX, vp.minY, vp.maxX, vp.maxY);
  _cachedAnimals = _animalBands
    ? collectInViewportBounds(_animalBands, vp.minX, vp.minY, vp.maxX, vp.maxY)
    : filterEntitiesInViewportBounds(_tickAnimals, vp.minX, vp.minY, vp.maxX, vp.maxY);
  _cachedHumans = _humanBands
    ? collectInViewportBounds(_humanBands, vp.minX, vp.minY, vp.maxX, vp.maxY)
    : filterEntitiesInViewportBounds(_tickHumans, vp.minX, vp.minY, vp.maxX, vp.maxY);

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
    rebuildViewportBands();
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
    rebuildViewportBands();
    // The fallback list is the SoA path's own shims, not `[]`. `syncGrassRenderGridFromSoA` returns
    // `undefined` when the spatial grid is switched off (`VITE_USE_SPATIAL_GRID=0`), and
    // `collectGrassInViewport` then falls back to a linear scan of the array it is handed — so a
    // hard-coded empty array drew **no grass at all** on the worker path while the main-thread path
    // still drew it, which is exactly the A/B comparison the switch exists to make. It is rebuilt
    // with the buckets, not per frame: a pan used to re-materialise every grass shim each frame.
    _soaGrassFallback = entitiesFromSoASlots(_renderSoABuckets.grassSlots, _renderSoABuckets.shimBySlot);
  } else if (!_renderSoABuckets || !_treeBands) {
    _renderSoABuckets = updateRenderSoABuckets(
      state.renderSoA,
      state.renderMetaBySlot ?? undefined,
      state.tick,
    );
    rebuildViewportBands();
    _soaGrassFallback = entitiesFromSoASlots(_renderSoABuckets.grassSlots, _renderSoABuckets.shimBySlot);
  }
  syncEntityDrawViewport(state.tick, state.camera, cw, ch);

  syncGrassDrawCache(state.tick, state.camera, cw, ch, () =>
    collectGrassInViewport(
      state.grassGrid,
      _soaGrassFallback,
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

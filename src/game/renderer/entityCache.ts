/// <reference lib="es2022" />
import type { Camera, Entity, EntityByType } from '../gameTypes';
import type { RenderEntity } from '../simBuffers/entityRenderMeta';
import { EntityType as EntityTypeEnum, UNCACHED_RENDER_TICK } from '../gameTypes';
import type { RenderSnapshot } from '../renderSnapshot';
import {
  invalidateRenderSoABucketsCache,
  updateRenderSoABuckets,
  type RenderSoABuckets,
} from '../simBuffers/renderSoAEntities';
import { collectGrassInViewport, viewportFromCamera } from '../spatialGrid';
import { buildEntityDrawBuckets } from '../simFocus';

/* -------------------------------------------------------------------------- */
/*  Viewport cache key precision – sub‑pixel camera drift should not invalidate grass. */
const GRASS_VIEWPORT_KEY_XY_DIGITS = 1;
const GRASS_VIEWPORT_KEY_ZOOM_DIGITS = 3;
const ENTITY_VIEWPORT_KEY_XY_DIGITS = 1;
const ENTITY_VIEWPORT_KEY_ZOOM_DIGITS = 3;

/* -------------------------------------------------------------------------- */
/*  Entity draw caches (main thread).                                         */
let _cachedEntityTick = UNCACHED_RENDER_TICK;
let _cachedEntityViewportKey = '';
let _cachedGrassKey = '';

/* Full per‑tick entity lists (not viewport‑culled). */
export let _tickTrees: Entity[] = [];
export let _tickAnimals: Entity[] = [];
export let _tickHumans: Entity[] = [];

/* Viewport‑culled entity lists used for rendering. */
export let _cachedTrees: Entity[] = [];
export let _cachedAnimals: Entity[] = [];
export let _cachedHumans: Entity[] = [];
export let _cachedGrass: Entity[] = [];

export const _cachedPartnerById = new Map<number, number>();

export let _renderSoABuckets: RenderSoABuckets | null = null;

/* -------------------------------------------------------------------------- */
/*  Cache clearing.                                                           */
export function resetEntityCaches(): void {
  _cachedEntityTick = UNCACHED_RENDER_TICK;
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

/* -------------------------------------------------------------------------- */
/*  Helper utilities.                                                          */
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

function entityInViewport(entity: Entity, cam: Camera, cw: number, ch: number, pad = 72): boolean {
  const vp = viewportFromCamera(cam.x, cam.y, cam.zoom, cw, ch, pad);
  return entity.x >= vp.minX && entity.x <= vp.maxX && entity.y >= vp.minY && entity.y <= vp.maxY;
}

function filterEntitiesInViewport(entities: Entity[], cam: Camera, cw: number, ch: number): Entity[] {
  return entities.filter((entity) => !entity.hiddenFromPlayer && entityInViewport(entity, cam, cw, ch));
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

/*
 * Convert SoA slot indices back into Entity instances for the main‑thread draw lists.
 *
 * `shimBySlot` maps a slot index to a `RenderEntity` (the minimal shape needed for rendering),
 * which is assignable to the broader `Entity` type expected by the rest of the renderer.
 */
function entitiesFromSoASlots(
  slots: number[],
  shimBySlot: Map<number, RenderEntity>,
): Entity[] {
  const entities: Entity[] = [];
  for (const slot of slots) {
    const entity = shimBySlot.get(slot);
    if (entity) entities.push(entity as Entity);
  }
  return entities;
}

/* -------------------------------------------------------------------------- */
/*  Sync draw lists for viewport‑culled entities.                             */
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

/* -------------------------------------------------------------------------- */
/*  Public API – update main‑thread entity caches.                             */
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

/* -------------------------------------------------------------------------- */
/*  Phase B – hydrate SoA buckets into the main‑thread draw lists when the worker sends them. */
export function updateCachedEntitiesFromSoA(state: RenderSnapshot, cw: number, ch: number) {
  if (!state.renderSoA) return;
  const tickChanged = syncDrawCacheTick(state.tick);
  if (tickChanged) {
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

  syncGrassDrawCache(state.tick, state.camera, cw, ch, () =>
    collectGrassInViewport(
      state.grassGrid,
      [],
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
import { getRenderEntityLayer, UNCACHED_RENDER_TICK, type Entity } from '../gameTypes';
import {
  syncGrassRenderGrid,
  type EntitySpatialGrid,
  USE_SPATIAL_GRID,
} from '../spatialGrid';
import type { EntityRenderMeta } from './entityRenderMeta';
import { buildRenderEntityShim } from './entityRenderMeta';
import type { RenderSoAReaderV1 } from './renderSoAReader';

export interface RenderSoABuckets {
  tick: number;
  grassSlots: number[];
  treeSlots: number[];
  animalSlots: number[];
  humanSlots: number[];
  shims: Entity[];
  shimBySlot: Map<number, Entity>;
}

let cachedTick = UNCACHED_RENDER_TICK;
let cachedMetaBySlot: EntityRenderMeta[] | undefined;
let buckets: RenderSoABuckets = emptyBuckets();
let grassRenderGrid: EntitySpatialGrid | undefined;
let grassGridTick = UNCACHED_RENDER_TICK;
let grassGridMapW = 0;
let grassGridMapH = 0;

function emptyBuckets(): RenderSoABuckets {
  return {
    tick: UNCACHED_RENDER_TICK,
    grassSlots: [],
    treeSlots: [],
    animalSlots: [],
    humanSlots: [],
    shims: [],
    shimBySlot: new Map(),
  };
}

export function invalidateRenderSoABucketsCache(): void {
  cachedTick = UNCACHED_RENDER_TICK;
  cachedMetaBySlot = undefined;
  buckets = emptyBuckets();
  grassRenderGrid = undefined;
  grassGridTick = UNCACHED_RENDER_TICK;
  grassGridMapW = 0;
  grassGridMapH = 0;
}

export function updateRenderSoABuckets(
  reader: RenderSoAReaderV1,
  metaBySlot: EntityRenderMeta[] | undefined,
  tick: number,
): RenderSoABuckets {
  if (cachedTick === tick && cachedMetaBySlot === metaBySlot) return buckets;

  try {
    cachedTick = tick;
    cachedMetaBySlot = metaBySlot;

    const grassSlots: number[] = [];
    const treeSlots: number[] = [];
    const animalSlots: number[] = [];
    const humanSlots: number[] = [];
    const shims: Entity[] = [];
    const shimBySlot = new Map<number, Entity>();

    reader.forEachSlot((slot) => {
      if (!reader.isKnownType(slot)) return;

      const shim = buildRenderEntityShim(reader, slot, metaBySlot?.[slot]);
      if (!shim) return;

      const type = reader.type(slot)!;
      switch (getRenderEntityLayer(type)) {
        case 'grass': grassSlots.push(slot); break;
        case 'tree': treeSlots.push(slot); break;
        case 'human': humanSlots.push(slot); break;
        case 'animal': animalSlots.push(slot); break;
        default: animalSlots.push(slot); break;
      }

      shims.push(shim);
      shimBySlot.set(slot, shim);
    });

    treeSlots.sort((a, b) => reader.y(a) - reader.y(b));
    animalSlots.sort((a, b) => reader.y(a) - reader.y(b));
    humanSlots.sort((a, b) => reader.y(a) - reader.y(b));

    buckets = { tick, grassSlots, treeSlots, animalSlots, humanSlots, shims, shimBySlot };
    return buckets;
  } catch (err) {
    invalidateRenderSoABucketsCache();
    throw err;
  }
}

/** Build (or reuse) a tick-keyed grass spatial index from render SoA shims for the worker path. */
export function syncGrassRenderGridFromSoA(
  reader: RenderSoAReaderV1,
  metaBySlot: EntityRenderMeta[] | undefined,
  mapWidth: number,
  mapHeight: number,
  tick: number,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;

  const bucketData = updateRenderSoABuckets(reader, metaBySlot, tick);
  if (
    grassRenderGrid
    && grassGridTick === tick
    && grassGridMapW === mapWidth
    && grassGridMapH === mapHeight
  ) {
    return grassRenderGrid;
  }

  const grassEntities: Entity[] = [];
  for (const slot of bucketData.grassSlots) {
    const shim = bucketData.shimBySlot.get(slot);
    if (shim) grassEntities.push(shim);
  }

  grassRenderGrid = syncGrassRenderGrid(grassRenderGrid, mapWidth, mapHeight, grassEntities);
  grassGridTick = tick;
  grassGridMapW = mapWidth;
  grassGridMapH = mapHeight;
  return grassRenderGrid;
}

export function getRenderSoABuckets(): RenderSoABuckets {
  return buckets;
}
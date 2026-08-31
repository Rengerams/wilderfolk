import { getRenderEntityLayer, UNCACHED_RENDER_TICK } from '../gameTypes';
import {
  syncGrassRenderGrid,
  type EntitySpatialGrid,
  USE_SPATIAL_GRID,
} from '../spatialGrid';
import type { EntityRenderMeta, RenderEntity } from './entityRenderMeta';
import { buildRenderEntityShim } from './entityRenderMeta';
import type { RenderSoAReaderV1 } from './renderSoAReader';

export interface RenderSoABuckets {
  readonly tick: number;
  readonly grassSlots: number[];
  readonly treeSlots: number[];
  readonly animalSlots: number[];
  readonly humanSlots: number[];
  readonly shims: RenderEntity[];
  readonly shimBySlot: Map<number, RenderEntity>;
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
  if (cachedTick === tick && cachedMetaBySlot === metaBySlot) {
    return buckets;
  }

  try {
    cachedTick = tick;
    cachedMetaBySlot = metaBySlot;

    const grassSlots: number[] = [];
    const treeSlots: number[] = [];
    const animalSlots: number[] = [];
    const humanSlots: number[] = [];
    const shims: RenderEntity[] = [];
    const shimBySlot = new Map<number, RenderEntity>();

    reader.forEachSlot((slot) => {
      if (!reader.isKnownType(slot)) return;

      const shim = buildRenderEntityShim(reader, slot, metaBySlot?.[slot]);
      if (!shim || shim.hiddenFromPlayer) return;

      const type = reader.type(slot);
      if (!type) return;

      switch (getRenderEntityLayer(type)) {
        case 'grass':
          grassSlots.push(slot);
          break;
        case 'tree':
          treeSlots.push(slot);
          break;
        case 'human':
          humanSlots.push(slot);
          break;
        case 'animal':
        default:
          animalSlots.push(slot);
          break;
      }

      shims.push(shim);
      shimBySlot.set(slot, shim);
    });

    // Depth sort based on Y coordinate
    treeSlots.sort((a, b) => reader.y(a) - reader.y(b));
    animalSlots.sort((a, b) => reader.y(a) - reader.y(b));
    humanSlots.sort((a, b) => reader.y(a) - reader.y(b));

    buckets = {
      tick,
      grassSlots,
      treeSlots,
      animalSlots,
      humanSlots,
      shims,
      shimBySlot,
    };

    return buckets;
  } catch (err) {
    invalidateRenderSoABucketsCache();
    throw err;
  }
}

/** Builds or reuses a tick-keyed grass spatial index from render SoA shims for the worker path. */
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
    grassRenderGrid &&
    grassGridTick === tick &&
    grassGridMapW === mapWidth &&
    grassGridMapH === mapHeight
  ) {
    return grassRenderGrid;
  }

  const grassEntities: RenderEntity[] = [];
  for (let i = 0; i < bucketData.grassSlots.length; i++) {
    const slot = bucketData.grassSlots[i];
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

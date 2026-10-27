/**
 * F-RND-6 — a moving camera must not re-scan the whole world every frame.
 *
 * The draw lists are viewport-culled, and the camera lerps at frame rate while the simulation ticks
 * once a second, so the cull re-ran on almost every frame. The tick lists are now cut into
 * contiguous chunks with a y range, and a query scans only the chunks it can see.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityType, emptyEntityByType, type Camera, type Entity, type EntityByType } from '../src/game/gameTypes';
import { viewportFromCamera } from '../src/game/spatialGrid';
import {
  _cachedTrees,
  buildViewportBands,
  collectInViewportBounds,
  filterEntitiesInViewportBounds,
  resetEntityCaches,
  updateCachedEntities,
} from '../src/game/renderer/entityCache';

const MAP_W = 2000;
const MAP_H = 2000;
const CW = 800;
const CH = 600;
/** The renderer's own cull pad — the visible rect is padded by this before culling. */
const RENDER_PAD = 72;

interface Counted {
  entity: Entity;
  reads: () => number;
}

/** A tree whose `x`/`y` reads are counted, so a test can see how much of the list a query touched. */
function countedTree(id: number, x: number, y: number): Counted {
  let count = 0;
  const entity = { id, type: EntityType.Tree, alive: true, size: 12 } as unknown as Entity;
  Object.defineProperty(entity, 'x', { get: () => { count += 1; return x; }, enumerable: true });
  Object.defineProperty(entity, 'y', { get: () => { count += 1; return y; }, enumerable: true });
  return { entity, reads: () => count };
}

/** A dense forest spread over the map, in y order like the real tick list. */
function forest(count: number): Counted[] {
  const trees: Counted[] = [];
  const columns = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const x = (i % columns) * (MAP_W / columns) + 5;
    const y = Math.floor(i / columns) * (MAP_H / columns) + 5;
    trees.push(countedTree(i + 1, x, y));
  }
  return trees.sort((a, b) => a.entity.y - b.entity.y);
}

function camera(x: number, y: number, zoom: number): Camera {
  return { x, y, zoom, targetX: x, targetY: y, targetZoom: zoom };
}

function byTypeOf(trees: Counted[]): EntityByType {
  const byType = emptyEntityByType();
  for (const tree of trees) byType[EntityType.Tree].push(tree.entity);
  return byType;
}

function referenceIds(trees: Counted[], cam: Camera): number[] {
  const vp = viewportFromCamera(cam.x, cam.y, cam.zoom, CW, CH, RENDER_PAD);
  return filterEntitiesInViewportBounds(trees.map((t) => t.entity), vp.minX, vp.minY, vp.maxX, vp.maxY)
    .map((entity) => entity.id);
}

beforeEach(() => {
  resetEntityCaches();
});

describe('F-RND-6 — the viewport cull is chunked, not a full-list scan', () => {
  it('returns exactly the linear walk\'s result, in the list\'s own order', () => {
    const trees = forest(400);
    const bands = buildViewportBands(trees.map((t) => t.entity));
    const viewports: Array<[number, number, number, number]> = [
      [0, 0, MAP_W, MAP_H],
      [900, 900, 1100, 1100],
      [-500, -500, 100, 100],
      [1990, 1990, 2600, 2600],
      [0, 900, MAP_W, 1000],
    ];
    for (const [minX, minY, maxX, maxY] of viewports) {
      const banded = collectInViewportBounds(bands, minX, minY, maxX, maxY);
      const linear = filterEntitiesInViewportBounds(trees.map((t) => t.entity), minX, minY, maxX, maxY);
      expect(banded).toEqual(linear);
      expect(banded.map((e) => e.id)).toEqual(linear.map((e) => e.id));
    }
  });

  it('does not drop an entity when a chunk\'s list is not y-sorted', () => {
    const trees = forest(120);
    const shuffled = [...trees].sort((a, b) => a.entity.id - b.entity.id);
    const bands = buildViewportBands(shuffled.map((t) => t.entity));
    const linear = filterEntitiesInViewportBounds(shuffled.map((t) => t.entity), 900, 900, 1100, 1100);
    const banded = collectInViewportBounds(bands, 900, 900, 1100, 1100);
    expect(banded.length).toBe(linear.length);
    expect(new Set(banded.map((e) => e.id))).toEqual(new Set(linear.map((e) => e.id)));
  });

  it('reads a small slice of the list for a pan at play zoom, where the linear walk reads it all', () => {
    const trees = forest(600);
    const byType = byTypeOf(trees);
    const first = camera(1000, 1000, 2);
    updateCachedEntities(byType, null, 1, first, MAP_W, MAP_H, CW, CH);
    const vp = viewportFromCamera(first.x, first.y, first.zoom, CW, CH, RENDER_PAD);
    expect(filterEntitiesInViewportBounds(trees.map((t) => t.entity), vp.minX, vp.minY, vp.maxX, vp.maxY).length)
      .toBeGreaterThan(0);

    const readBefore = trees.reduce((sum, t) => sum + t.reads(), 0);
    const second = camera(1008, 1000, 2);
    updateCachedEntities(byType, null, 1, second, MAP_W, MAP_H, CW, CH);
    const readDuringPan = trees.reduce((sum, t) => sum + t.reads(), 0) - readBefore;

    expect(_cachedTrees.map((e) => e.id)).toEqual(referenceIds(trees, second));
    // A full re-scan costs two reads per tree; the chunked query must stay well under one.
    expect(readDuringPan).toBeLessThan(trees.length);
  });
});

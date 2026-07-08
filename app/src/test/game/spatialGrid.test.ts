import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import {
  EntitySpatialGrid,
  GRASS_CELL_SIZE,
  MOBILE_CELL_SIZE,
  buildGrassGrid,
  buildMobileGrid,
  collectGrassInViewport,
  distSq,
  isGrassGridEntity,
  syncGrassRenderGrid,
  syncMobileSimGrid,
  isMobileGridEntity,
  assertSpatialGridInvariants,
  syncSpatialGridEntity,
  viewportFromCamera,
} from '@/game/spatialGrid';

describe('EntitySpatialGrid', () => {
  it('inserts each alive entity into exactly one cell', () => {
    const grid = new EntitySpatialGrid(400, 300, 80);
    const a = createEntity(EntityType.Deer, 10, 20, 1, 200);
    const b = createEntity(EntityType.Rabbit, 200, 150, 2, 200);
    grid.rebuild([a, b], isMobileGridEntity);
    expect(grid.validateInvariant([a, b], isMobileGridEntity)).toEqual([]);
  });

  it('findClosestInRadius applies narrow-phase distance after broad-phase cells', () => {
    const grid = new EntitySpatialGrid(500, 500, MOBILE_CELL_SIZE);
    const near = createEntity(EntityType.Wolf, 100, 100, 1, 200);
    const far = createEntity(EntityType.Wolf, 250, 100, 2, 200);
    grid.rebuild([near, far], isMobileGridEntity);

    const prey = createEntity(EntityType.Rabbit, 105, 100, 3, 200);
    const hit = grid.findClosestInRadius(prey.x, prey.y, 40, (e) => e.type === EntityType.Wolf);
    expect(hit?.entity.id).toBe(near.id);
    expect(hit?.distSq).toBe(distSq(prey.x, prey.y, near.x, near.y));
  });

  it('excludes entities outside radius even in neighboring cells', () => {
    const grid = new EntitySpatialGrid(800, 600, MOBILE_CELL_SIZE);
    const wolf = createEntity(EntityType.Wolf, 400, 300, 1, 200);
    grid.rebuild([wolf], isMobileGridEntity);

    const rabbit = createEntity(EntityType.Rabbit, 100, 100, 2, 200);
    const hits: number[] = [];
    grid.forEachInRadius(rabbit.x, rabbit.y, 70, (e) => hits.push(e.id));
    expect(hits).toHaveLength(0);
  });

  it('grass grid only indexes grass patches', () => {
    const grass = createEntity(EntityType.Grass, 50, 50, 1, 100);
    const deer = createEntity(EntityType.Deer, 55, 55, 2, 200);
    const grid = buildGrassGrid(400, 400, [grass, deer]);
    expect(grid.validateInvariant([grass, deer], isGrassGridEntity)).toEqual([]);

    const grazer = createEntity(EntityType.Rabbit, 52, 52, 3, 200);
    const hit = grid.findClosestInRadius(grazer.x, grazer.y, 50, (g) => g.energy >= 5);
    expect(hit?.entity.id).toBe(grass.id);
  });

  it('mobile grid covers predator flee queries without scanning all humans', () => {
    const grid = buildMobileGrid(1600, 1200, []);
    const humans = Array.from({ length: 40 }, (_, i) =>
      createEntity(EntityType.Human, 800 + i, 600, i + 10, 250),
    );
    const wolf = createEntity(EntityType.Wolf, 200, 200, 1, 200);
    const deer = createEntity(EntityType.Deer, 210, 205, 2, 200);
    grid.rebuild([...humans, wolf, deer], isMobileGridEntity);

    const fleeHit = grid.findClosestInRadius(deer.x, deer.y, 90, (e) => e.type === EntityType.Wolf);
    expect(fleeHit?.entity.id).toBe(wolf.id);
  });

  it('assertSpatialGridInvariants passes for dual-layer rebuild', () => {
    const grass = createEntity(EntityType.Grass, 30, 30, 1, 80);
    const deer = createEntity(EntityType.Deer, 200, 200, 2, 200);
    const entities = [grass, deer];
    const grassGrid = buildGrassGrid(400, 400, entities);
    const mobileGrid = buildMobileGrid(400, 400, entities);
    expect(() => assertSpatialGridInvariants(grassGrid, mobileGrid, entities)).not.toThrow();
  });

  it('reports ghosts when an alive entity is missing from the grid', () => {
    const grid = new EntitySpatialGrid(200, 200, GRASS_CELL_SIZE);
    const grass = createEntity(EntityType.Grass, 30, 30, 1, 80);
    grid.rebuild([grass], isGrassGridEntity);
    const errors = grid.validateInvariant([grass], isGrassGridEntity);
    expect(errors).toEqual([]);

    grid.clear();
    const ghostErrors = grid.validateInvariant([grass], isGrassGridEntity);
    expect(ghostErrors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('ignores NaN coordinates instead of crashing insert', () => {
    const grid = new EntitySpatialGrid(200, 200, MOBILE_CELL_SIZE);
    const bad = createEntity(EntityType.Deer, Number.NaN, 50, 1, 200);
    expect(() => grid.rebuild([bad], isMobileGridEntity)).not.toThrow();
    const hits: number[] = [];
    grid.forEachInRadius(0, 0, 200, (e) => hits.push(e.id));
    expect(hits).toHaveLength(0);
  });

  it('skips dead entities in radius queries after mid-tick deaths', () => {
    const grid = new EntitySpatialGrid(400, 400, MOBILE_CELL_SIZE);
    const wolf = createEntity(EntityType.Wolf, 100, 100, 1, 200);
    const deer = createEntity(EntityType.Deer, 110, 100, 2, 200);
    grid.rebuild([wolf, deer], isMobileGridEntity);

    wolf.alive = false;
    const hits: number[] = [];
    grid.forEachInRadius(105, 100, 50, (e) => hits.push(e.id));
    expect(hits).toEqual([2]);
  });

  it('does not report false orphan errors when entities die after rebuild', () => {
    const grid = new EntitySpatialGrid(400, 400, MOBILE_CELL_SIZE);
    const deer = createEntity(EntityType.Deer, 100, 100, 1, 200);
    grid.rebuild([deer], isMobileGridEntity);
    deer.alive = false;
    grid.rebuild([deer], isMobileGridEntity);
    expect(grid.validateInvariant([deer], isMobileGridEntity)).toEqual([]);
  });

  it('update removes stale cell entries when an entity moves', () => {
    const grid = new EntitySpatialGrid(800, 600, MOBILE_CELL_SIZE);
    const deer = createEntity(EntityType.Deer, 50, 50, 1, 200);
    grid.rebuild([deer], isMobileGridEntity);

    deer.x = 400;
    deer.y = 300;
    grid.update(deer);

    const hits: number[] = [];
    grid.forEachInRadius(50, 50, 60, (e) => hits.push(e.id));
    expect(hits).toHaveLength(0);

    const moved = grid.findClosestInRadius(400, 300, 40, () => true);
    expect(moved?.entity.id).toBe(1);
  });

  it('forEachNeighborCell stops early when callback returns false', () => {
    const grid = new EntitySpatialGrid(200, 200, MOBILE_CELL_SIZE);
    const deer = createEntity(EntityType.Deer, 80, 80, 1, 200);
    grid.rebuild([deer], isMobileGridEntity);

    let calls = 0;
    const stopped = grid.forEachNeighborCell(82, 82, () => {
      calls++;
      return false;
    });
    expect(stopped).toBe(true);
    expect(calls).toBe(1);
  });

  it('forEachNeighborCell omits dead entities from neighbor buckets', () => {
    const grid = new EntitySpatialGrid(200, 200, MOBILE_CELL_SIZE);
    const deer = createEntity(EntityType.Deer, 80, 80, 1, 200);
    grid.rebuild([deer], isMobileGridEntity);
    deer.alive = false;

    let ids: number[] = [];
    grid.forEachNeighborCell(82, 82, (_c, _r, _i, bucket) => {
      ids = bucket.map((e) => e.id);
    });
    expect(ids).toEqual([]);
  });

  it('update keeps a valid index after small moves within one cell', () => {
    const grid = new EntitySpatialGrid(400, 400, MOBILE_CELL_SIZE);
    const deer = createEntity(EntityType.Deer, 80, 80, 1, 200);
    grid.rebuild([deer], isMobileGridEntity);

    deer.x = 82;
    deer.y = 83;
    grid.update(deer);
    expect(grid.validateInvariant([deer], isMobileGridEntity)).toEqual([]);
  });

  it('forEachNeighborCell yields bucket contents', () => {
    const grid = new EntitySpatialGrid(200, 200, MOBILE_CELL_SIZE);
    const deer = createEntity(EntityType.Deer, 80, 80, 1, 200);
    grid.rebuild([deer], isMobileGridEntity);

    let found = false;
    grid.forEachNeighborCell(82, 82, (_col, _row, _idx, bucket) => {
      if (bucket.some((e) => e.id === deer.id)) found = true;
    });
    expect(found).toBe(true);
  });

  it('buildGrassGrid can enable the influence layer', () => {
    const grid = buildGrassGrid(200, 200, [], true);
    expect(grid.influence).toBeInstanceOf(Float32Array);
    expect(grid.influence?.length).toBe(grid.gridCols * grid.gridRows);
  });

  it('forEachInRect returns only entities inside the viewport bounds', () => {
    const grid = new EntitySpatialGrid(800, 600, GRASS_CELL_SIZE);
    const inside = createEntity(EntityType.Grass, 120, 120, 1, 80);
    const outside = createEntity(EntityType.Grass, 500, 400, 2, 80);
    grid.rebuild([inside, outside], isGrassGridEntity);

    const ids: number[] = [];
    grid.forEachInRect(80, 80, 200, 200, (g) => ids.push(g.id));
    expect(ids).toEqual([1]);
  });

  it('syncSpatialGridEntity updates both grass and mobile layers', () => {
    const grassGrid = buildGrassGrid(400, 400, []);
    const mobileGrid = buildMobileGrid(400, 400, []);
    const deer = createEntity(EntityType.Deer, 40, 40, 1, 200);
    const patch = createEntity(EntityType.Grass, 44, 44, 2, 80);
    syncSpatialGridEntity(deer, grassGrid, mobileGrid);
    syncSpatialGridEntity(patch, grassGrid, mobileGrid);

    deer.x = 300;
    deer.y = 280;
    syncSpatialGridEntity(deer, grassGrid, mobileGrid);

    const mobileHits: number[] = [];
    mobileGrid.forEachInRadius(300, 280, 30, (e) => mobileHits.push(e.id));
    expect(mobileHits).toEqual([1]);

    const oldMobileHits: number[] = [];
    mobileGrid.forEachInRadius(40, 40, 30, (e) => oldMobileHits.push(e.id));
    expect(oldMobileHits).toHaveLength(0);
  });

  it('viewportFromCamera expands with canvas size and shrinks with zoom', () => {
    const tight = viewportFromCamera(400, 300, 2, 800, 600);
    const wide = viewportFromCamera(400, 300, 0.5, 800, 600);
    expect(wide.maxX - wide.minX).toBeGreaterThan(tight.maxX - tight.minX);
    expect(wide.maxY - wide.minY).toBeGreaterThan(tight.maxY - tight.minY);
  });
});

describe('grass render grid reuse', () => {
  it('syncGrassRenderGrid reuses the same grid object across tick rebuilds', () => {
    const near = createEntity(EntityType.Grass, 100, 100, 1, 100);
    const far = createEntity(EntityType.Grass, 900, 900, 2, 100);
    const first = syncGrassRenderGrid(undefined, 1000, 1000, [near, far]);
    expect(first).toBeDefined();

    const added = createEntity(EntityType.Grass, 110, 110, 3, 100);
    const second = syncGrassRenderGrid(first, 1000, 1000, [near, far, added]);
    expect(second).toBe(first);
  });

  it('collectGrassInViewport queries a persistent grid without rebuilding on camera move', () => {
    const near = createEntity(EntityType.Grass, 200, 200, 1, 100);
    const far = createEntity(EntityType.Grass, 900, 900, 2, 100);
    const grid = syncGrassRenderGrid(undefined, 1000, 1000, [near, far])!;

    const centered = collectGrassInViewport(grid, [], 1000, 1000, 200, 200, 1, 800, 600);
    const panned = collectGrassInViewport(grid, [], 1000, 1000, 900, 900, 1, 800, 600);

    expect(centered.map((g) => g.id)).toContain(1);
    expect(centered.map((g) => g.id)).not.toContain(2);
    expect(panned.map((g) => g.id)).toContain(2);
    expect(panned.map((g) => g.id)).not.toContain(1);
  });
});

describe('spatial grid structuredClone recovery', () => {
  it('syncMobileSimGrid allocates a fresh grid when existing lost class methods', () => {
    const stale = structuredClone(buildMobileGrid(400, 400, [])) as unknown as EntitySpatialGrid;
    expect(typeof stale.rebuild).not.toBe('function');

    const deer = createEntity(EntityType.Deer, 10, 20, 1, 200);
    const grid = syncMobileSimGrid(stale, 400, 400, [deer]);
    expect(grid).toBeInstanceOf(EntitySpatialGrid);
    expect(typeof grid?.rebuild).toBe('function');
    expect(grid?.validateInvariant([deer], isMobileGridEntity)).toEqual([]);
  });

  it('syncGrassRenderGrid allocates a fresh grid when existing lost class methods', () => {
    const stale = structuredClone(buildGrassGrid(400, 400, [])) as unknown as EntitySpatialGrid;
    const patch = createEntity(EntityType.Grass, 44, 44, 2, 80);
    const grid = syncGrassRenderGrid(stale, 400, 400, [patch]);
    expect(grid).toBeInstanceOf(EntitySpatialGrid);
    expect(typeof grid?.rebuild).toBe('function');
  });
});
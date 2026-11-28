import { human } from '../src/test/factories';
import { EntitySpatialGrid, gridCellAxis } from '../src/game/spatialGrid';
/**
 * `scentGrid` is simulation state, not a derived index: realtime decays it, systems samples it, and
 * save-load treats it as transient; these cases drive the real paths and assert its values.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { ensureScentGrid, ScentGrid } from '../src/game/scentGrid';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import { MapSize, type WorldState, type Entity } from '../src/game/gameTypes';

interface SelfShim {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  onerror: unknown;
  onunhandledrejection: unknown;
  postMessage: (message: unknown, transfer?: unknown) => void;
}

/** The worker module reads `self` at import time, so the shim has to exist first. */
let loaded: { shim: SelfShim; posted: WorkerResponse[] } | null = null;

async function workerWithSelfShim(): Promise<{ shim: SelfShim; posted: WorkerResponse[] }> {
  if (loaded) return loaded;
  const posted: WorkerResponse[] = [];
  const shim: SelfShim = {
    onmessage: null,
    onerror: null,
    onunhandledrejection: null,
    postMessage: (message) => {
      posted.push(message as WorkerResponse);
    },
  };
  (globalThis as { self?: unknown }).self = shim;
  const { installWorkerMessageHandlers } = await import('../src/game/simWorker/gameWorker');
  installWorkerMessageHandlers();
  if (!shim.onmessage) throw new Error('gameWorker did not register an onmessage handler');
  loaded = { shim, posted };
  return loaded;
}

describe('scent field rollback and save persistence (F-1/F-2/F-3)', () => {
  it('F-1 — rolls the scent field back to the snapshot the prep payload took', () => {
    const world = initGame({ size: MapSize.Medium, seed: 17 });
    const grid = ensureScentGrid(world);
    grid.values[3] = 5;

    const prep = extractSimPrep(world);
    expect(prep.scentGrid).toBeDefined();
    // The backup is a copy: the tick mutates the live grid in place, so a reference is not a backup.
    expect(prep.scentGrid).not.toBe(grid);

    // What a failed tick leaves behind — the realtime layer decays and spreads before anything throws.
    grid.values[3] = 99;
    grid.values[4] = 42;
    expect(prep.scentGrid?.values[3]).toBe(5);
    expect(prep.scentGrid?.values[4]).toBe(0);

    applySimPrep(world, prep);

    expect(world.scentGrid?.values[3]).toBe(5);
    expect(world.scentGrid?.values[4]).toBe(0);
    expect(Array.from(world.scentGrid?.values ?? [])).toEqual(Array.from(prep.scentGrid?.values ?? []));
  });

  it('F-2 — keeps the live scent field when the worker exports a save', async () => {
    const { shim, posted } = await workerWithSelfShim();
    const world = initGame({ size: MapSize.Medium, seed: 31 });
    // The worker adopts the uploaded world (`init` → `resetWorkerSession`) by reference.
    await shim.onmessage!({ data: { type: 'init', proto: WORKER_PROTO, world, features: [], headless: true } });

    const grid = ensureScentGrid(world);
    grid.values[3] = 11;
    const laidDown = Float32Array.from(grid.values);
    const entityIndex = world.entityById;
    const originalRngStamp = world.simRng;

    posted.length = 0;
    await shim.onmessage!({ data: { type: 'exportSave', proto: WORKER_PROTO } });

    const result = posted.find((message) => message.type === 'exportSaveResult');
    expect(result).toBeDefined();
    // Scent is simulation state, not a rebuildable cache: the exported world keeps the trail so a
    // worker-written save reloads without a cold prey-flee field. Other runtime caches are dropped.
    expect((result as { world: WorldState }).world.scentGrid).toBeDefined();
    expect(Array.from((result as { world: WorldState }).world.scentGrid?.values ?? [])).toEqual(Array.from(laidDown));
    expect((result as { world: WorldState }).world).not.toBe(world);
    expect((result as { world: WorldState }).world.simRng?.seed).toBe(31);
    // ...while the live worker keeps its runtime cache identity, RNG stamp
    // and the trail it was midway through laying down.
    expect(world.scentGrid).toBe(grid);
    expect(world.scentGrid?.values).toEqual(laidDown);
    expect(world.scentGrid?.values[3]).toBe(11);
    expect(world.entityById).toBe(entityIndex);
    expect(world.simRng).toBe(originalRngStamp);
  });

  it('keeps live state intact when save serialization throws', async () => {
    const { shim, posted } = await workerWithSelfShim();
    const world = initGame({ size: MapSize.Medium, seed: 37 });
    await shim.onmessage!({ data: { type: 'init', proto: WORKER_PROTO, world, features: [], headless: true } });
    const grid = ensureScentGrid(world);
    grid.values[3] = 17;
    const entityIndex = world.entityById;
    const originalRngStamp = world.simRng;
    const originalPost = shim.postMessage;
    posted.length = 0;
    shim.postMessage = (message) => {
      if ((message as WorkerResponse).type === 'exportSaveResult') {
        throw new Error('simulated serialization failure');
      }
      originalPost(message);
    };
    try {
      await shim.onmessage!({ data: { type: 'exportSave', proto: WORKER_PROTO } });
      expect(posted.some((message) => message.type === 'error' && message.source === 'export')).toBe(true);
      expect(world.scentGrid).toBe(grid);
      expect(world.scentGrid?.values[3]).toBe(17);
      expect(world.entityById).toBe(entityIndex);
      expect(world.simRng).toBe(originalRngStamp);
    } finally {
      shim.postMessage = originalPost;
    }
  });

  it('F-3 — rolls the ledger totals back with the maps they summarize', () => {
    const world = initGame({ size: MapSize.Medium, seed: 19 });
    world.economyLedger = {
      day: 3,
      produced: { farms: 12 },
      consumed: { meals: 4 },
      producedTotal: 12,
      consumedTotal: 4,
    };

    const prep = extractSimPrep(world);
    expect(prep.economyLedger).toEqual(world.economyLedger);
    expect(prep.economyLedger).not.toBe(world.economyLedger);

    // The day's production the failed tick recorded before throwing.
    world.economyLedger = {
      day: 3,
      produced: { farms: 30 },
      consumed: { meals: 25 },
      producedTotal: 30,
      consumedTotal: 25,
    };

    applySimPrep(world, prep);

    expect(world.economyLedger).toEqual({
      day: 3,
      produced: { farms: 12 },
      consumed: { meals: 4 },
      producedTotal: 12,
      consumedTotal: 4,
    });
  });
});

describe('N-19 — predator scent survives a save and load', () => {
  afterEach(resetSimRng);

  it('restores the decaying field instead of starting cold', () => {
    const world = initGame({ skipTerrain: true, size: MapSize.Medium, seed: 20_261_112 });
    ensureScentGrid(world).deposit(300, 300, 9);
    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    const parsed = parseSaveJson(JSON.stringify(saved));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    expect(loaded.world.scentGrid?.getScentAt(300, 300)).toBeCloseTo(9);
    expect(loaded.world.scentGrid?.cols).toBe(world.scentGrid?.cols);
  });

  it('drops a malformed sidecar and loads a legacy save without one', () => {
    const world = initGame({ skipTerrain: true, size: MapSize.Medium, seed: 20_261_112 });
    ensureScentGrid(world).deposit(300, 300, 9);
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    payload.scentGrid = { cols: 1_000_000, rows: 2, cellSize: 80, values: [1, 2] };
    const parsed = parseSaveJson(JSON.stringify(payload));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    expect(loadGameFromParsed(parsed.parsed)?.world.scentGrid).toBeUndefined();

    const legacy = buildSaveData(world, createInitialView(world.width, world.height));
    delete legacy.scentGrid;
    const legacyParsed = parseSaveJson(JSON.stringify(legacy));
    expect(legacyParsed.valid).toBe(true);
    if (!legacyParsed.valid) return;
    expect(loadGameFromParsed(legacyParsed.parsed)?.world.scentGrid).toBeUndefined();
  });
});

describe('A12 — one owner for world→cell coordinate clamping', () => {
  it('keeps both grids on the same cell for every coordinate', () => {
    const entityGrid = new EntitySpatialGrid(800, 600, 80);
    const scentGrid = new ScentGrid(800, 600, 80);
    const probes: Array<[number, number]> = [
      [0, 0],
      [1, 79],
      [79, 1],
      [80, 80],
      [640.5, 320.25],
      [799, 599],
      [800, 600],
      [-1, -1],
      [-40, 700],
    ];
    for (const [x, y] of probes) {
      const scent = scentGrid.cellCoords(x, y);
      expect(entityGrid.cellCoords(x, y), `entity grid at (${x}, ${y})`).toEqual(scent);
      expect(scent, `both grids at (${x}, ${y})`).toEqual({
        col: gridCellAxis(x, 80, 10),
        row: gridCellAxis(y, 80, 8),
      });
    }
  });

  it('negotiates the non-finite case explicitly rather than by accident', () => {
    const entityGrid = new EntitySpatialGrid(800, 600, 80);
    const scentGrid = new ScentGrid(800, 600, 80);
    // The entity grid rejects non-finite input; the scent grid has no guard and its callers only
    // deposit finite coordinates, so the shared clamp propagates NaN. Pinned, not hidden.
    expect(entityGrid.cellCoords(Number.NaN, 10)).toBeNull();
    expect(Number.isNaN(scentGrid.cellCoords(Number.NaN, 10).col)).toBe(true);
  });
});

describe('the spatial grid refreshes an object that did not change cell', () => {
  /** Everything the grid holds in a rectangle, via its own traversal primitive. */
  function inRect(grid: EntitySpatialGrid<Entity>, minX: number, minY: number, maxX: number, maxY: number): Entity[] {
    const found: Entity[] = [];
    grid.forEachInRect(minX, minY, maxX, maxY, (entity) => found.push(entity));
    return found;
  }

  it('replaces the stored entry when a fresh object arrives for the same cell', () => {
    // The worker's render path builds a new shim per slot per tick with the same id and cell, so the
    // grid must replace the stored entry to carry fields that changed without a cell change.
    const grid = new EntitySpatialGrid<Entity>(100, 100, 10);
    const first = human(1, { x: 5, y: 5 });
    const refreshed = human(1, { x: 5, y: 5, flash: 9 });
    expect(first.id).toBe(refreshed.id);

    grid.reconcile([first]);
    grid.reconcile([refreshed]);

    const cell = inRect(grid, 0, 0, 10, 10);
    expect(cell).toHaveLength(1);
    expect(cell[0], 'the grid kept the stale object').toBe(refreshed);
    expect(cell[0].flash).toBe(9);
  });

  it('still moves an entity between cells', () => {
    const grid = new EntitySpatialGrid<Entity>(100, 100, 10);
    grid.reconcile([human(1, { x: 5, y: 5 })]);
    grid.reconcile([human(1, { x: 55, y: 55 })]);

    expect(inRect(grid, 0, 0, 10, 10)).toHaveLength(0);
    expect(inRect(grid, 50, 50, 60, 60)).toHaveLength(1);
  });
});

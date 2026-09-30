/**
 * Scent-grid rollback and save-time persistence — worker-boundary audit F-1/F-2/F-3.
 *
 * `scentGrid` is simulation state, not a derived index: `tickLayerRealtime` decays it and deposits
 * predator odour in place, `tickLayerSystems` samples it so grazers flee, and `saveLoad` treats it
 * as transient (`stripRuntimeWorldFields` drops it, `loadGameFromParsed` recreates it). It shares a
 * slot family with the derived caches, which is why two paths dropped it by accident.
 *
 * `tests/simPrep.rollbackFields.test.ts` and `tests/simPrep.rollbackClosure.test.ts` cannot see
 * these: they enumerate the payload's keys and assert it round-trips, which a *reference* to the
 * live grid satisfies. These cases drive the real paths and assert the field's values instead.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { ensureScentGrid } from '../src/game/scentGrid';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import { MapSize, type WorldState } from '../src/game/gameTypes';

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
  await import('../src/game/simWorker/gameWorker');
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
    shim.onmessage!({ data: { type: 'init', proto: WORKER_PROTO, world, features: [], headless: true } });

    const grid = ensureScentGrid(world);
    grid.values[3] = 11;
    const laidDown = Float32Array.from(grid.values);

    posted.length = 0;
    shim.onmessage!({ data: { type: 'exportSave', proto: WORKER_PROTO } });

    const result = posted.find((message) => message.type === 'exportSaveResult');
    expect(result).toBeDefined();
    // The save payload carries no runtime caches — the same set `stripRuntimeWorldFields` drops,
    // so the transient trail is not shipped to disk either.
    expect((result as { world: WorldState }).world.scentGrid).toBeUndefined();
    // ...while the live worker keeps the trail it was midway through laying down.
    expect(world.scentGrid?.values).toEqual(laidDown);
    expect(world.scentGrid?.values[3]).toBe(11);
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

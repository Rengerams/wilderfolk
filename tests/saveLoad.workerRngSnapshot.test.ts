/** A save records the RNG positions of the colony that was ticked, not of the realm that writes it;
 *  worker and host are separate module registries here, as they are in the browser. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSaveData } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { GameWorkerHost } from '../src/game/simWorker/GameWorkerHost';
import { initGame } from '../src/game/worldGen';
import {
  createSeededRng,
  getSimRng,
  resetSimRng,
  restoreSimRng,
  snapshotSimRng,
} from '../src/game/simRng';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import type { WorldState } from '../src/game/gameTypes';

const SEED = 9091;
const TICKS = 3;

/** The `self` the worker module registers itself on when it is imported. */
interface WorkerSelf {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  onerror: unknown;
  onunhandledrejection: unknown;
  postMessage: (message: unknown, transfer?: unknown) => void;
}

type HostListener = (event: { data: WorkerResponse }) => void;

/** `new Worker(...)` in Node: relays to the worker module loaded through `self`, cloning both ways and
 *  delivering on a microtask, because a real worker's reply can never arrive inside `postMessage`. */
function installFakeWorker(workerSelf: WorkerSelf): void {
  const listeners: HostListener[] = [];
  // The worker side posts through the shim, so route that onto the host's listeners.
  workerSelf.postMessage = (message) => {
    const clone = structuredClone(message) as WorkerResponse;
    queueMicrotask(() => {
      for (const listener of listeners) listener({ data: clone });
    });
  };

  class FakeWorker {
    postMessage(message: WorkerRequest): void {
      const clone = structuredClone(message) as WorkerRequest;
      queueMicrotask(() => {
        workerSelf.onmessage?.({ data: clone });
      });
    }
    addEventListener(type: string, handler: HostListener): void {
      if (type === 'message') listeners.push(handler);
    }
    removeEventListener(): void {
      /* the host never removes one */
    }
    terminate(): void {
      /* nothing to unwind: the worker module is the test's own import */
    }
  }

  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
}

describe('the saved RNG snapshot belongs to the world that was ticked', () => {
  afterEach(() => {
    resetSimRng();
    delete (globalThis as { Worker?: unknown }).Worker;
    delete (globalThis as { self?: unknown }).self;
    vi.resetModules();
  });

  it('continues the worker colony after a reload even though the saving realm never ticked it', async () => {
    const world: WorldState = initGame({ seed: SEED });

    // ---- The worker realm: a second `simRng` instance behind the host's message boundary. ----
    const workerSelf: WorkerSelf = {
      onmessage: null,
      onerror: null,
      onunhandledrejection: null,
      postMessage: () => {},
    };
    (globalThis as { self?: unknown }).self = workerSelf;
    vi.resetModules();
    const workerSimRng = await import('../src/game/simRng');
    const workerNameLoader = await import('../src/game/nameLoader');
    await workerNameLoader.loadNames().catch(() => {});
    await import('../src/game/simWorker/gameWorker');
    if (!workerSelf.onmessage) throw new Error('gameWorker did not register an onmessage handler');
    installFakeWorker(workerSelf);

    const host = new GameWorkerHost();
    await host.init(world);
    for (let i = 0; i < TICKS; i++) {
      expect(host.requestTick()).toBe(true);
      await host.whenIdle();
    }
    expect(world.tick).toBeGreaterThan(TICKS);
    expect(world.entities.length).toBeGreaterThan(0);

    // The colony the worker ticked: positions only the worker's own registry holds.
    const tickedRealm = workerSimRng.snapshotSimRng();
    expect(tickedRealm.seed).toBe(SEED);
    expect(tickedRealm.owners.length).toBeGreaterThan(0);

    // Move the saving realm's registry off that colony, as a main-thread draw or a host swap does.
    resetSimRng();
    expect(snapshotSimRng().owners).toEqual([]);
    expect(snapshotSimRng().seed).not.toBe(tickedRealm.seed);

    const exported = await host.exportSave();
    expect(exported.simRng).toEqual(tickedRealm);

    const payload = buildSaveData(
      exported,
      createInitialView(exported.width, exported.height),
    ) as Record<string, unknown>;
    expect(payload.simRng).toEqual(tickedRealm);

    // A reload resumes the ticked colony's next draw instead of replaying a fresh stream.
    const owner = tickedRealm.owners[0][0];
    const continuation = workerSimRng.getSimRng(owner)();
    const freshFirstDraw = createSeededRng(tickedRealm.seed, owner)();
    restoreSimRng(payload.simRng);
    const resumed = getSimRng(owner)();
    expect(resumed).toBe(continuation);
    expect(resumed).not.toBe(freshFirstDraw);

    host.dispose();
  });
});

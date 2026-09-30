/**
 * O3 — seeded worker-versus-main-thread parity.
 *
 * `workerBoundary.closure.test.ts` proves that state *crosses* the host <-> worker boundary and
 * survives a save. This case proves the other half of roadmap O3's acceptance: that a **seeded run**
 * produces the same colony whether the ticks execute in the simulation worker or on the main thread.
 *
 * Why the two sides must live in separate module registries: in one registry the worker module and
 * the main thread share a single `simRng` instance, so the assertion would compare a computation with
 * itself and would pass even if the worker's session hand-off were broken. The real host sends the
 * world plus its stream positions — `GameWorkerHost` stamps `world.simRng = snapshotSimRng()` at
 * hand-off — and `gameWorker.resetWorkerSession` adopts the world seed and then restores those
 * positions (`gameWorker.ts:119-126`). This test reproduces exactly that payload in a second registry
 * (`vi.resetModules()`), so dropping the position restore makes the two colonies diverge.
 *
 * The name pool is per-registry module state too (`nameLoader.ts`), so both sides load it explicitly:
 * otherwise one side could name settlers from the full census and the other from the embedded
 * fallback, and a name difference would read as a simulation divergence.
 */
import { describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { buildSaveData } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { loadNames } from '../src/game/nameLoader';
import { resetSimRng, snapshotSimRng, type SimRngSnapshot } from '../src/game/simRng';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import type { WorldState } from '../src/game/gameTypes';

const SEED = 4242;
const TICKS = 240; // 5 colony days — the same fixture length the closure suite uses

/** The `self` the worker module registers itself on when it is imported. */
interface WorkerSelf {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  onerror: unknown;
  onunhandledrejection: unknown;
  postMessage: (message: unknown, transfer?: unknown) => void;
}

function installWorkerSelf(): { self: WorkerSelf; posted: WorkerResponse[] } {
  const posted: WorkerResponse[] = [];
  const self: WorkerSelf = {
    onmessage: null,
    onerror: null,
    onunhandledrejection: null,
    postMessage: (message) => {
      posted.push(message as WorkerResponse);
    },
  };
  (globalThis as { self?: unknown }).self = self;
  return { self, posted };
}

describe('seeded worker versus main-thread parity', () => {
  it('persists the same colony whether the ticks ran in the worker or on the main thread', async () => {
    // ---- Main thread: the path `GameLoop.frame` takes with the worker unavailable. ----
    await loadNames().catch(() => {});
    resetSimRng();
    const mainThread = initGame({ seed: SEED });
    for (let i = 0; i < TICKS; i++) gameTick(mainThread);
    const mainThreadRng = snapshotSimRng();
    const mainThreadPayload = buildSaveData(
      mainThread,
      createInitialView(mainThread.width, mainThread.height),
    ) as Record<string, unknown>;

    // ---- The real worker module, in its own module registry. ----
    const { self, posted } = installWorkerSelf();
    vi.resetModules();
    const workerWorldGen = await import('../src/game/worldGen');
    const workerSimRng = await import('../src/game/simRng');
    const workerNameLoader = await import('../src/game/nameLoader');
    await workerNameLoader.loadNames().catch(() => {});
    await import('../src/game/simWorker/gameWorker');
    if (!self.onmessage) throw new Error('gameWorker did not register an onmessage handler');
    const send = self.onmessage;

    // What `GameWorkerHost.queueFullWorldUpload` posts: the world plus its RNG positions.
    const seedWorld = workerWorldGen.initGame({ seed: SEED });
    seedWorld.simRng = workerSimRng.snapshotSimRng();
    const seedWorldRng: SimRngSnapshot | undefined = seedWorld.simRng;

    send({ data: { type: 'init', proto: WORKER_PROTO, world: seedWorld, features: [], headless: true } });
    for (let i = 0; i < TICKS; i++) send({ data: { type: 'tick', proto: WORKER_PROTO } });
    send({ data: { type: 'exportSave', proto: WORKER_PROTO } });

    const exported = posted.filter(
      (message): message is Extract<WorkerResponse, { type: 'exportSaveResult' }> =>
        (message as { type?: unknown }).type === 'exportSaveResult',
    );
    expect(exported, 'the worker must answer exportSave').toHaveLength(1);
    const exportResult = exported[0];
    if (!exportResult) throw new Error('worker exportSaveResult is missing its world');
    const workerWorld: WorldState = exportResult.world;
    const workerRng = workerSimRng.snapshotSimRng();

    // Guard the fixture: the run must have actually moved the colony, or equality proves little.
    expect(seedWorldRng, 'the hand-off must carry RNG positions').toBeDefined();
    expect(mainThread.tick).toBeGreaterThan(TICKS);
    expect(mainThread.entities.length).toBeGreaterThan(2);
    expect(workerWorld.tick).toBe(mainThread.tick);

    // The two realms drew the same streams, from the same hand-off ...
    expect(workerRng).toEqual(mainThreadRng);

    // ... and therefore persist the same colony. `_savedAt` is a wall-clock stamp, not state.
    const workerPayload = buildSaveData(
      workerWorld,
      createInitialView(workerWorld.width, workerWorld.height),
    ) as Record<string, unknown>;
    delete mainThreadPayload._savedAt;
    delete workerPayload._savedAt;
    expect(workerPayload).toEqual(mainThreadPayload);
  });
});

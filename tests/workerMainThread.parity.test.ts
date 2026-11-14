/**
 * A seeded run must persist the same colony whether the ticks ran in the simulation worker or on the
 * main thread. `vi.resetModules()` gives the worker its own registry, so the two `simRng` are distinct.
 */
import { describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { buildSaveData } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { loadNames } from '../src/game/nameLoader';
import { resetSimRng, snapshotSimRng, type SimRngSnapshot } from '../src/game/simRng';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import type { WorldState } from '../src/game/gameTypes';

const SEED = 4242;
const TICKS = TICKS_PER_DAY * 2; // Two full 24-hour days, including both midnight boundaries

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
    const mainThread = initGame({ skipTerrain: true, seed: SEED });
    // Both engines must start from the very same generated world, as a real host upload does.
    const initialWorld = structuredClone(mainThread);
    initialWorld.simRng = snapshotSimRng();
    for (let i = 0; i < TICKS; i++) gameTick(mainThread);
    const mainThreadRng = snapshotSimRng();
    const mainThreadPayload = buildSaveData(
      mainThread,
      createInitialView(mainThread.width, mainThread.height),
    ) as Record<string, unknown>;

    // ---- The real worker module, in its own module registry. ----
    const { self, posted } = installWorkerSelf();
    vi.resetModules();
    const workerSimRng = await import('../src/game/simRng');
    const workerNameLoader = await import('../src/game/nameLoader');
    await workerNameLoader.loadNames().catch(() => {});
    const { installWorkerMessageHandlers } = await import('../src/game/simWorker/gameWorker');
    installWorkerMessageHandlers();
    if (!self.onmessage) throw new Error('gameWorker did not register an onmessage handler');
    const send = self.onmessage;

    // What `GameWorkerHost.queueFullWorldUpload` posts: the world plus its RNG positions.
    const seedWorld = structuredClone(initialWorld);
    const seedWorldRng: SimRngSnapshot | undefined = seedWorld.simRng;

    await send({ data: { type: 'init', proto: WORKER_PROTO, world: seedWorld, features: [], headless: true } });
    for (let i = 0; i < TICKS; i++) await send({ data: { type: 'tick', proto: WORKER_PROTO } });
    await send({ data: { type: 'exportSave', proto: WORKER_PROTO } });

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
    expect(Math.floor(mainThread.tick / TICKS_PER_DAY)).toBe(
      Math.floor(initialWorld.tick / TICKS_PER_DAY) + 2,
    );
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
    // Saves cross a JSON boundary in production, so compare the persisted representation rather
    // than in-memory object identity.
    const workerSaved = JSON.parse(JSON.stringify(workerPayload)) as Record<string, unknown>;
    const mainSaved = JSON.parse(JSON.stringify(mainThreadPayload)) as Record<string, unknown>;
    // The predator-scent sidecar is a derived AI cache shipped to the worker on its own transferable
    // buffer; it is not colony state. Compare the colony, like the other rebuilt runtime caches.
    delete workerSaved.scentGrid;
    delete mainSaved.scentGrid;
    // Report the first concrete divergent field instead of allowing Vitest to
    // truncate a 2,500-entity object into "no visual difference".
    function differences(a: unknown, b: unknown, path = '$', found: string[] = []): string[] {
      if (found.length >= 20 || Object.is(a, b)) return found;
      if (typeof a !== typeof b || a === null || b === null ||
          typeof a !== 'object' || typeof b !== 'object') {
        found.push(`${path}: worker=${JSON.stringify(a)} main=${JSON.stringify(b)}`);
        return found;
      }
      const left = a as Record<string, unknown>;
      const right = b as Record<string, unknown>;
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        differences(left[key], right[key], `${path}.${key}`, found);
        if (found.length >= 20) break;
      }
      return found;
    }
    const mismatches = differences(workerSaved, mainSaved);
    expect(mismatches, `First ${mismatches.length} divergent saved fields:\\n${mismatches.join('\\n')}`).toEqual([]);

  });
});

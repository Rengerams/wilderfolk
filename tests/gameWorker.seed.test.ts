/**
 * End-to-end seed adoption in the simulation worker.
 *
 * `gameWorker.resetWorkerSession` runs for `init`, `importSave` and `syncWorld`, and the
 * worker is a separate realm whose `simRng` module state starts at the default seed 1. This
 * drives the real worker module — with a `self` shim, the same way the browser provides it —
 * through an `init` message and asserts the realm adopted the seed the world carries, so the
 * worker draws the same streams the world was created with instead of silently using seed 1.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import { initGame } from '../src/game/gameEngine';
import { createSeededRng, getSimRng, getSimSeed, resetSimRng } from '../src/game/simRng';
import { MapSize } from '../src/game/gameTypes';

interface SelfShim {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  onerror: unknown;
  onunhandledrejection: unknown;
  postMessage: (message: unknown, transfer?: unknown) => void;
}

/** The worker module reads `self` at import time, so the shim has to exist first. */
let loaded: { shim: SelfShim; posted: unknown[] } | null = null;

async function workerWithSelfShim(): Promise<{ shim: SelfShim; posted: unknown[] }> {
  if (loaded) return loaded;
  const posted: unknown[] = [];
  const shim: SelfShim = {
    onmessage: null,
    onerror: null,
    onunhandledrejection: null,
    postMessage: (message) => {
      posted.push(message);
    },
  };
  (globalThis as { self?: unknown }).self = shim;
  // Imported once: the module registers its handler on the shim above, and a second import
  // would return the cached module without touching a new shim.
  const { installWorkerMessageHandlers } = await import('../src/game/simWorker/gameWorker');
  installWorkerMessageHandlers();
  if (!shim.onmessage) throw new Error('gameWorker did not register an onmessage handler');
  loaded = { shim, posted };
  return loaded;
}

describe('sim worker realm adopts the world seed', () => {
  afterEach(() => {
    resetSimRng();
  });

  it('seeds simRng from the incoming world on init', async () => {
    const { shim, posted } = await workerWithSelfShim();
    const world = initGame({ size: MapSize.Medium, seed: 24680 });

    // A fresh realm: nothing has seeded this module state yet.
    resetSimRng();
    expect(getSimSeed()).toBe(1);

    shim.onmessage!({
      data: { type: 'init', proto: WORKER_PROTO, world, features: [], headless: true },
    });

    expect(posted[0]).toMatchObject({ type: 'ready', proto: WORKER_PROTO });
    expect(getSimSeed()).toBe(24680);
    // …and the realm really draws the creating realm's stream, not the seed-1 one.
    expect(getSimRng('entityFactory')()).toBe(createSeededRng(24680, 'entityFactory')());
  });

  it('re-seeds on importSave, so a swapped world cannot keep the old streams', async () => {
    const { shim, posted } = await workerWithSelfShim();

    const first = initGame({ size: MapSize.Medium, seed: 111 });
    shim.onmessage!({
      data: { type: 'init', proto: WORKER_PROTO, world: first, features: [], headless: true },
    });
    expect(getSimSeed()).toBe(111);
    getSimRng('entityFactory')(); // consume a draw, as a running tick would

    const second = initGame({ size: MapSize.Medium, seed: 222 });
    shim.onmessage!({
      data: { type: 'importSave', proto: WORKER_PROTO, world: second, uploadId: 42 },
    });

    expect(posted.at(-1)).toMatchObject({ type: 'worldUploaded', proto: WORKER_PROTO, uploadId: 42 });
    expect(getSimSeed()).toBe(222);
    expect(getSimRng('entityFactory')()).toBe(createSeededRng(222, 'entityFactory')());
  });
});
describe('worker copy boundaries', () => {
  it('does not commit delta baselines when posting fails and resets them on upload', async () => {
    const { shim } = await workerWithSelfShim();
    const world = initGame({ size: MapSize.Medium, seed: 71 });
    const initialTick = world.tick;
    const received: WorkerResponse[] = [];
    const originalPost = shim.postMessage;
    let failTick = true;
    shim.postMessage = (message) => {
      const response = message as WorkerResponse;
      if (response.type === 'tickResult' && failTick) throw new Error('serialization failed');
      received.push(structuredClone(response));
    };
    try {
      shim.onmessage!({ data: { type: 'init', proto: WORKER_PROTO, world, features: [] } });
      shim.onmessage!({ data: { type: 'tick', proto: WORKER_PROTO } });
      expect(received.at(-1)).toMatchObject({ type: 'error', source: 'tick' });
      expect(world.tick).toBe(initialTick);
      failTick = false;
      shim.onmessage!({ data: { type: 'tick', proto: WORKER_PROTO } });
      const result = received.at(-1);
      expect(result?.type).toBe('tickResult');
      if (result?.type !== 'tickResult') throw new Error('missing tick result');
      expect(result.delta).toHaveProperty('populationHistory');
      expect(result.delta).toHaveProperty('genealogyRegistry');
      if (result.renderBuffer && result.bufferIndex !== undefined) {
        shim.onmessage!({ data: {
          type: 'returnBuffer', proto: WORKER_PROTO,
          bufferIndex: result.bufferIndex, buffer: result.renderBuffer,
        } });
      }
      const replacement = initGame({ size: MapSize.Medium, seed: 72 });
      shim.onmessage!({ data: { type: 'syncWorld', proto: WORKER_PROTO, world: replacement, uploadId: 5 } });
      shim.onmessage!({ data: { type: 'tick', proto: WORKER_PROTO } });
      const synced = received.at(-1);
      if (synced?.type !== 'tickResult') throw new Error('missing synced tick result');
      expect(synced.delta).toHaveProperty('populationHistory');
    } finally {
      shim.postMessage = originalPost;
    }
  });
});

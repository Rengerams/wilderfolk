import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { self?: unknown }).self;
});

describe('simulation worker message admission waits for the name pool', () => {
  it('queues early init and tick until the shared load completes in arrival order', async () => {
    const world = initGame({ size: MapSize.Medium, seed: 81 });
    vi.resetModules();
    const names = await import('../src/game/nameLoader');
    let releaseLoad: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { releaseLoad = resolve; });
    vi.spyOn(names, 'loadNames').mockReturnValue(pending);
    names.resetNamePoolForTest();

    const posted: WorkerResponse[] = [];
    const shim: {
      onmessage: ((event: { data: WorkerRequest }) => Promise<void>) | null;
      postMessage: (message: WorkerResponse) => void;
      onerror: unknown;
      onunhandledrejection: unknown;
    } = {
      onmessage: null,
      postMessage: (message) => { posted.push(message); },
      onerror: null,
      onunhandledrejection: null,
    };
    (globalThis as { self?: unknown }).self = shim;
    const { installWorkerMessageHandlers } = await import('../src/game/simWorker/gameWorker');
    installWorkerMessageHandlers();
    if (!shim.onmessage) throw new Error('worker failed to install its message handler');

    const initializing = shim.onmessage({
      data: { type: 'init', proto: WORKER_PROTO, world, features: [], headless: true },
    });
    const ticking = shim.onmessage({ data: { type: 'tick', proto: WORKER_PROTO } });
    await Promise.resolve();
    expect(posted).toHaveLength(0);
    expect(world.tick).toBe(0);

    releaseLoad?.();
    await Promise.all([initializing, ticking]);
    expect(posted[0]?.type).toBe('ready');
    expect(posted[1]?.type).toBe('tickResult');
    expect(world.tick).toBe(1);
  });

  it('reports rejected loading without applying an early tick', async () => {
    const world = initGame({ size: MapSize.Medium, seed: 82 });
    vi.resetModules();
    const names = await import('../src/game/nameLoader');
    vi.spyOn(names, 'loadNames').mockRejectedValue(new Error('census unavailable'));
    names.resetNamePoolForTest();

    const posted: WorkerResponse[] = [];
    const shim: {
      onmessage: ((event: { data: WorkerRequest }) => Promise<void>) | null;
      postMessage: (message: WorkerResponse) => void;
      onerror: unknown;
      onunhandledrejection: unknown;
    } = {
      onmessage: null,
      postMessage: (message) => { posted.push(message); },
      onerror: null,
      onunhandledrejection: null,
    };
    (globalThis as { self?: unknown }).self = shim;
    const { installWorkerMessageHandlers } = await import('../src/game/simWorker/gameWorker');
    installWorkerMessageHandlers();
    if (!shim.onmessage) throw new Error('worker failed to install its message handler');

    await shim.onmessage({
      data: { type: 'init', proto: WORKER_PROTO, world, features: [], headless: true },
    });
    await shim.onmessage({ data: { type: 'tick', proto: WORKER_PROTO } });
    expect(posted).toEqual([
      expect.objectContaining({ type: 'error', source: 'general' }),
      expect.objectContaining({ type: 'error', source: 'tick' }),
    ]);
    expect(world.tick).toBe(0);
  });
});

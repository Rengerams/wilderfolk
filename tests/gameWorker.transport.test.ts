/**
 * Real worker transport contract — launches the shared worker runtime through
 * the Node worker_threads adapter. This complements GameLoop's fake-host tests
 * by proving startup, message delivery, command validation, tick delivery, and
 * world export over an actual isolated thread.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { initGame } from '../src/game/worldGen';
import { WORKER_PROTO } from '../src/game/simWorker/protocol';
import type { WorkerRequest, WorkerResponse } from '../src/game/simWorker/protocol';

const workers: Worker[] = [];

function startWorker(): Worker {
  const worker = new Worker(
    new URL('../src/game/simWorker/gameWorker.node.ts', import.meta.url),
    { execArgv: ['--import', 'tsx'] },
  );
  workers.push(worker);
  return worker;
}

function waitForMessage<T extends WorkerResponse['type']>(
  worker: Worker,
  type: T,
  timeoutMs = 15_000,
): Promise<Extract<WorkerResponse, { type: T }>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for worker ${type}`));
    }, timeoutMs);
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onMessage = (message: WorkerResponse) => {
      if (message.type !== type) return;
      cleanup();
      resolve(message as Extract<WorkerResponse, { type: T }>);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      worker.off('error', onError);
      worker.off('message', onMessage);
    };
    worker.on('error', onError);
    worker.on('message', onMessage);
  });
}

function post(worker: Worker, message: WorkerRequest): void {
  worker.postMessage(message);
}

afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.terminate()));
});

describe('shared worker transport', () => {
  it('starts, delivers a headless tick, accepts a valid command, rejects an invalid command, and exports the authoritative world', async () => {
    const worker = startWorker();
    const readyPromise = waitForMessage(worker, 'ready');

    const world = initGame();
    post(worker, {
      type: 'init',
      proto: WORKER_PROTO,
      world,
      features: [],
      headless: true,
    });

    const ready = await readyPromise;
    expect(ready.proto).toBe(WORKER_PROTO);
    expect(ready.buffers).toEqual([]);

    const tickPromise = waitForMessage(worker, 'tickResult');
    post(worker, { type: 'tick', proto: WORKER_PROTO });
    const tick = await tickPromise;
    expect(tick.proto).toBe(WORKER_PROTO);
    expect(tick.headless).toBe(true);

    const commandPromise = waitForMessage(worker, 'commandResult');
    post(worker, {
      type: 'command',
      proto: WORKER_PROTO,
      cmd: { proto: WORKER_PROTO, op: 'spawnMoonHowlerDebug' },
    });
    const command = await commandPromise;
    expect(command.ok).toBe(true);
    expect(command.delta).toBeDefined();

    const rejectedPromise = waitForMessage(worker, 'commandResult');
    post(worker, {
      type: 'command',
      proto: WORKER_PROTO,
      cmd: { proto: WORKER_PROTO, op: 'not-a-worker-command' },
    });
    const rejected = await rejectedPromise;
    expect(rejected.ok).toBe(false);
    expect(rejected.reason).toBe('Invalid worker command');

    const exportPromise = waitForMessage(worker, 'exportSaveResult');
    post(worker, { type: 'exportSave', proto: WORKER_PROTO });
    const exported = await exportPromise;
    expect(exported.world.tick).toBeGreaterThan(world.tick);
  });
});

/**
 * Worker outage contracts: a full-world upload is adopted only after the worker acknowledges it, a
 * refused upload keeps the previous replica, and the timing constants keep a hung command inside the
 * loop's stall ceiling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameWorkerHost, COMMAND_REPLY_DEADLINE_MS } from '../src/game/simWorker/GameWorkerHost';
import {
  WORKER_RECOVERY_BUDGET_MS,
  WORKER_STALL_CEILING_MS,
  WORKER_STALL_TIMEOUT_MS,
} from '../src/game/gameLoop';
import { WORKER_PROTO, type WorkerRequest } from '../src/game/simWorker/protocol';
import { initGame } from '../src/game/worldGen';
import { GAME_VERSION } from '../src/game/version';

/** Minimal `Worker` stand-in: captures requests and lets the test answer them. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: WorkerRequest[] = [];
  private listeners = new Map<string, Array<(event: { data: unknown }) => void>>();
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(): void {}

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) listener({ data });
  }
}

async function readyHost(): Promise<{ host: GameWorkerHost; worker: FakeWorker }> {
  const host = new GameWorkerHost();
  const world = initGame({ skipTerrain: true, villageName: 'Upload target' });
  const init = host.init(world);
  const worker = FakeWorker.instances[FakeWorker.instances.length - 1];
  worker.emit({ type: 'ready', proto: WORKER_PROTO, simVersion: GAME_VERSION, buffers: ['renderSoA_v1'] });
  await init;
  return { host, worker };
}

async function waitForRequest(worker: FakeWorker, type: WorkerRequest['type']): Promise<WorkerRequest> {
  let found: WorkerRequest | undefined;
  await vi.waitFor(() => {
    found = worker.posted.find((message) => message.type === type);
    expect(found).toBeDefined();
  });
  return found!;
}

describe('worker world upload', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the previous replica until the worker acknowledges the uploaded world', async () => {
    const { host, worker } = await readyHost();
    const before = host.getAuthoritativeWorld();
    const uploaded = initGame({ skipTerrain: true, villageName: 'Uploaded colony' });

    const upload = host.importSave(uploaded);
    const request = await waitForRequest(worker, 'importSave') as Extract<WorkerRequest, { type: 'importSave' }>;
    expect(host.getAuthoritativeWorld()).toBe(before);

    worker.emit({ type: 'worldUploaded', proto: WORKER_PROTO, uploadId: request.uploadId });
    await upload;
    expect(host.getAuthoritativeWorld()).toBe(uploaded);
    host.dispose();
  });

  it('restores the old world and reports the fault when the worker refuses the upload', async () => {
    const { host, worker } = await readyHost();
    const before = host.getAuthoritativeWorld();
    const uploaded = initGame({ skipTerrain: true, villageName: 'Refused colony' });
    const onFault = vi.fn();
    host.setWorkerFaultHandler(onFault);

    const upload = host.importSave(uploaded);
    await waitForRequest(worker, 'importSave');
    worker.emit({ type: 'error', proto: WORKER_PROTO, message: 'import failed', source: 'general' });

    await expect(upload).rejects.toThrow('import failed');
    expect(host.getAuthoritativeWorld()).toBe(before);
    expect(onFault).toHaveBeenCalledWith('general', 'import failed', 0);
    host.dispose();
  });

  it('restores the old world and reports the fault when the upload cannot be posted', async () => {
    const { host, worker } = await readyHost();
    const before = host.getAuthoritativeWorld();
    const uploaded = initGame({ skipTerrain: true, villageName: 'Unpostable colony' });
    const onFault = vi.fn();
    host.setWorkerFaultHandler(onFault);
    worker.postMessage = () => {
      throw new Error('clone failed');
    };

    await expect(host.importSave(uploaded)).rejects.toThrow('clone failed');
    expect(host.getAuthoritativeWorld()).toBe(before);
    expect(onFault).toHaveBeenCalledWith('general', expect.stringContaining('clone failed'));
    host.dispose();
  });
});

describe('worker handshake version gate', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses a worker built from another game version by name', async () => {
    const host = new GameWorkerHost();
    const init = host.init(initGame({ skipTerrain: true, villageName: 'Version gate' }));
    const worker = FakeWorker.instances[FakeWorker.instances.length - 1];
    worker.emit({
      type: 'ready',
      proto: WORKER_PROTO,
      simVersion: '0.0.0-older-build',
      buffers: ['renderSoA_v1'],
    });

    await expect(init).rejects.toThrow(/Worker simulation version mismatch.*0\.0\.0-older-build/);
  });
});

describe('worker timing contracts', () => {
  it('fails a hung command inside the loop stall ceiling', () => {
    expect(WORKER_STALL_TIMEOUT_MS).toBeLessThanOrEqual(WORKER_STALL_CEILING_MS);
    expect(COMMAND_REPLY_DEADLINE_MS).toBeLessThanOrEqual(WORKER_STALL_CEILING_MS);
  });

  it('bounds the whole recovery attempt so main-thread ticks take over', () => {
    // At least one worker init fits inside the budget, and the budget stays far below the old
    // three-failed-init worst case of ~74 s.
    expect(WORKER_RECOVERY_BUDGET_MS).toBeGreaterThanOrEqual(WORKER_STALL_CEILING_MS);
    expect(WORKER_RECOVERY_BUDGET_MS).toBeLessThanOrEqual(2 * WORKER_STALL_CEILING_MS);
  });
});

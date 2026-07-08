/**
 * Node.js worker_threads host for headless long-run sims (mirrors browser GameWorkerHost protocol).
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import type { WorldState } from '../src/game/gameTypes';
import type { SimulationFocus } from '../src/game/gameEngine';
import { applySimTickDelta, type SimTickDelta } from '../src/game/simBuffers/simDelta';
import { extractSimPrep } from '../src/game/simWorker/simPrep';
import type { WorkerRequest, WorkerResponse } from '../src/game/simWorker/protocol';

const workerEntry = fileURLToPath(new URL('../src/game/simWorker/gameWorker.node.ts', import.meta.url));

export type SimTickTiming = {
  /** Main-thread sync before posting tick (importSave or syncSimPrep). */
  importMs: number;
  /** Wall time waiting for worker gameTick (off-thread). */
  workerWaitMs: number;
  /** Main-thread applySimTickDelta + buffer handoff — playability budget. */
  mainSyncMs: number;
  roundTripMs: number;
};

export type NodeSimWorkerInitOptions = {
  /** Skip render SoA packing — headless balance sims. */
  headless?: boolean;
};

export class NodeSimWorkerHost {
  private worker: Worker | null = null;
  private ready = false;
  readonly headless: boolean;
  private worldRef: WorldState | null = null;
  private tickPostedAt = 0;
  lastTickTiming: SimTickTiming | null = null;
  private pendingTick: {
    resolve: (delta: SimTickDelta) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(options: NodeSimWorkerInitOptions = {}) {
    this.headless = options.headless ?? false;
  }

  async init(world: WorldState): Promise<void> {
    this.dispose();
    this.worldRef = world;
    this.worker = new Worker(workerEntry, {
      execArgv: ['--import', 'tsx'],
    });

    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 30_000);

      const onMessage = (msg: WorkerResponse) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          this.ready = true;
          this.worker?.off('message', onMessage);
          this.worker?.on('message', (m: WorkerResponse) => this.handleMessage(m));
          resolve();
          return;
        }
        if (msg.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(msg.message));
        }
      };

      this.worker!.on('message', onMessage);
      this.worker!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const init: WorkerRequest = {
      type: 'init',
      proto: 1,
      world,
      features: this.headless ? [] : ['renderSoA_v1'],
      headless: this.headless,
    };
    this.worker.postMessage(init);
    await readyPromise;
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.worldRef = null;
    this.pendingTick?.reject(new Error('Worker disposed'));
    this.pendingTick = null;
  }

  getWorld(): WorldState {
    if (!this.worldRef) throw new Error('Worker not initialized');
    return this.worldRef;
  }

  importSave(world: WorldState): void {
    this.worldRef = world;
    if (!this.worker || !this.ready) return;
    const msg: WorkerRequest = { type: 'importSave', proto: 1, world };
    this.worker.postMessage(msg);
  }

  /** Compact prep sync — omits worldMap (headless sim path). */
  syncSimPrep(world: WorldState): void {
    this.worldRef = world;
    if (!this.worker || !this.ready) return;
    const msg: WorkerRequest = { type: 'syncSimPrep', proto: 1, prep: extractSimPrep(world) };
    this.worker.postMessage(msg);
  }

  async tick(focus?: SimulationFocus): Promise<SimTickDelta> {
    if (!this.worker || !this.ready || !this.worldRef) {
      throw new Error('Worker not ready');
    }
    if (this.pendingTick) {
      throw new Error('Tick already in flight');
    }
    return new Promise((resolve, reject) => {
      this.pendingTick = { resolve, reject };
      this.tickPostedAt = performance.now();
      const msg: WorkerRequest = { type: 'tick', proto: 1, focus };
      this.worker!.postMessage(msg);
    });
  }

  private handleMessage(msg: WorkerResponse): void {
    if (msg.type === 'error') {
      this.pendingTick?.reject(new Error(msg.message));
      this.pendingTick = null;
      return;
    }

    if (msg.type !== 'tickResult' || !this.worldRef) return;

    const receivedAt = performance.now();
    const workerWaitMs = this.tickPostedAt > 0 ? receivedAt - this.tickPostedAt : 0;
    const syncStart = performance.now();
    applySimTickDelta(this.worldRef, msg.delta, { cloneMode: 'transfer' });

    if (
      !msg.headless
      && this.worker
      && msg.renderBuffer != null
      && msg.bufferIndex != null
    ) {
      const returnMsg: WorkerRequest = {
        type: 'returnBuffer',
        proto: 1,
        bufferIndex: msg.bufferIndex,
        buffer: msg.renderBuffer,
      };
      this.worker.postMessage(returnMsg, [msg.renderBuffer]);
    }
    const mainSyncMs = performance.now() - syncStart;
    const importMs = this.lastTickTiming?.importMs ?? 0;
    this.lastTickTiming = {
      importMs,
      workerWaitMs,
      mainSyncMs,
      roundTripMs: importMs + workerWaitMs + mainSyncMs,
    };

    this.pendingTick?.resolve(msg.delta);
    this.pendingTick = null;
  }
}
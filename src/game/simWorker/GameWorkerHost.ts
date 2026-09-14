import type { WorldState } from '../gameTypes';
import type { SimulationFocus } from '../simFocus';
import { createRenderSoAReader, type RenderSoAReaderV1 } from '../simBuffers/renderSoAReader';
import type { EntityRenderMeta } from '../simBuffers/entityRenderMeta';
import { applySimTickDelta, type SimTickDelta } from '../simBuffers/simDelta';
import { RENDER_BUFFER_POOL_SIZE } from '../simBuffers/renderBufferPool';
import { ScentGridReader } from '../scentGrid';
import { hydrateWorldRuntimeCaches, invalidateWorldRuntimeCaches } from '../worldRuntimeCaches';
import { snapshotSimRng } from '../simRng';
import type { WorkerCommand } from './commands';
import {
  assertWorkerFeatures,
  isWorkerProto,
  WORKER_PROTO,
  workerProtoMismatch,
  type WorkerFeature,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';

export interface WorkerTickRender {
  reader: RenderSoAReaderV1;
  metaBySlot?: EntityRenderMeta[];
  scentReader: ScentGridReader | null;
}

export type TickResultHandler = (
  world: WorldState,
  delta: SimTickDelta,
  render: WorkerTickRender | null,
  tickChanged: boolean,
) => void;

export type CommandResultHandler = (
  world: WorldState,
  delta: SimTickDelta,
  render: WorkerTickRender | null,
  ok: boolean,
  reason?: string,
) => void;

export type WorkerFaultHandler = (
  source: 'tick' | 'command' | 'export' | 'general',
  message: string,
) => void;

export type WorkerUiPatch = Pick<
  WorldState,
  | 'bigNews'
  | 'floatingTexts'
  | 'autoSave'
  | 'nextFloatingTextId'
  | 'dismissedBigNewsIds'
  | 'dismissedNotificationIds'
  | 'dismissedActiveEventIds'
  | 'activeEvent'
  | 'tutorialSeen'
>;

/** Max ticks in flight — reserve one pool slot for the display buffer held on main. */
export const MAX_PIPELINE_DEPTH = Math.max(0, RENDER_BUFFER_POOL_SIZE - 1);

export class GameWorkerHost {
  private worker: Worker | null = null;
  private ready = false;
  private ticksInFlight = 0;
  private pendingFocus: SimulationFocus | undefined;
  private onTickResult: TickResultHandler | null = null;
  private onCommandResult: CommandResultHandler | null = null;
  private onWorkerFault: WorkerFaultHandler | null = null;
  private worldRef: WorldState | null = null;
  private pendingCommand: {
    resolve: (delta: SimTickDelta) => void;
    reject: (err: Error) => void;
  } | null = null;
  private pendingExport: {
    resolve: (world: WorldState) => void;
    reject: (err: Error) => void;
  } | null = null;
  private idleWaiters: Array<() => void> = [];
  private lastPausedSent: boolean | null = null;
  private lastSpeedSent: number | null = null;
  private generation = 0;
  /** Latest render buffer kept on main for drawing — returned when superseded. */
  private heldRenderBuffer: { index: number; buffer: ArrayBuffer } | null = null;
  private commandChain: Promise<void> = Promise.resolve();

  getGeneration(): number {
    return this.generation;
  }

  async init(world: WorldState): Promise<void> {
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not available in this environment');
    }
    if (RENDER_BUFFER_POOL_SIZE < 2) {
      throw new Error(`RENDER_BUFFER_POOL_SIZE must be >= 2, got ${RENDER_BUFFER_POOL_SIZE}`);
    }
    this.dispose();
    const initGen = this.generation;
    this.worldRef = hydrateWorldRuntimeCaches(world);
    this.worker = new Worker(new URL('./gameWorker.ts', import.meta.url), { type: 'module' });
    this.ready = false;
    this.lastPausedSent = null;
    this.lastSpeedSent = null;

    const pendingBeforeReady: WorkerResponse[] = [];
    const requestedFeatures: WorkerFeature[] = ['renderSoA_v1'];
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const readyPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      timeout = globalThis.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Worker init timeout'));
        }
      }, 15000);

      const onError = (event: ErrorEvent) => {
        if (initGen !== this.generation) return;
        const location = event.filename ? ` @ ${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : '';
        const errorMessage = `${event.message || 'unknown script error'}${location}`;
        const err = new Error(`Worker error: ${errorMessage}`);

        if (!settled) {
          settled = true;
          if (timeout) globalThis.clearTimeout(timeout);
          reject(new Error(`Worker failed to start: ${errorMessage}`));
          return;
        }
        this.rejectInFlight(err, { resetAllTicks: true });
        this.onWorkerFault?.('general', err.message);
      };

      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        if (initGen !== this.generation) return;
        const msg = event.data;

        if (!this.ready) {
          if (msg.type === 'ready') {
            if (!isWorkerProto(msg.proto)) {
              if (!settled) {
                settled = true;
                if (timeout) globalThis.clearTimeout(timeout);
                reject(new Error(workerProtoMismatch(msg.proto)));
              }
              return;
            }
            try {
              assertWorkerFeatures(requestedFeatures, msg.buffers);
            } catch (err) {
              if (!settled) {
                settled = true;
                if (timeout) globalThis.clearTimeout(timeout);
                reject(err instanceof Error ? err : new Error(String(err)));
              }
              return;
            }
            if (!settled) {
              settled = true;
              if (timeout) globalThis.clearTimeout(timeout);
              this.ready = true;
              resolve();
            }
            for (const pending of pendingBeforeReady) this.handleMessage(pending);
            pendingBeforeReady.length = 0;
            return;
          }
          if (msg.type === 'error') {
            if (!settled) {
              settled = true;
              if (timeout) globalThis.clearTimeout(timeout);
              reject(new Error(msg.message));
            }
            return;
          }
          pendingBeforeReady.push(msg);
          return;
        }

        this.handleMessage(msg);
      };

      this.worker!.addEventListener('message', onMessage);
      this.worker!.addEventListener('error', onError);
    });

    try {
      invalidateWorldRuntimeCaches(this.worldRef);
      // Same reason as the full-world uploads below: the worker adopts the world's seed, so the
      // stream positions this realm has already consumed have to travel with it or the
      // authoritative realm replays them (the main thread ticks until the worker is ready).
      this.worldRef.simRng = snapshotSimRng();
      const init: WorkerRequest = {
        type: 'init',
        proto: WORKER_PROTO,
        world: this.worldRef,
        features: requestedFeatures,
      };
      this.worker.postMessage(init);
      hydrateWorldRuntimeCaches(this.worldRef);

      await readyPromise;

      if (initGen !== this.generation) {
        throw new Error('Worker disposed during init');
      }
    } catch (err) {
      this.dispose();
      throw err;
    } finally {
      if (timeout) globalThis.clearTimeout(timeout);
    }
  }

  dispose(): void {
    this.generation++;
    this.heldRenderBuffer = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.ticksInFlight = 0;
    this.pendingFocus = undefined;
    this.onTickResult = null;
    this.onCommandResult = null;
    this.onWorkerFault = null;
    this.worldRef = null;
    this.lastPausedSent = null;
    this.lastSpeedSent = null;
    this.pendingCommand?.reject(new Error('Worker disposed'));
    this.pendingCommand = null;
    this.pendingExport?.reject(new Error('Worker disposed'));
    this.pendingExport = null;
    this.commandChain = Promise.resolve();
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const wake of waiters) wake();
  }

  isReady(): boolean {
    return this.ready && this.worker != null;
  }

  getAuthoritativeWorld(): WorldState | null {
    return this.worldRef;
  }

  getTicksInFlight(): number {
    return this.ticksInFlight;
  }

  hasTickInFlight(): boolean {
    return this.ticksInFlight > 0;
  }

  canPipelineTick(): boolean {
    return this.ticksInFlight < MAX_PIPELINE_DEPTH;
  }

  hasCommandInFlight(): boolean {
    return this.pendingCommand != null;
  }

  isIdle(): boolean {
    return this.ticksInFlight === 0 && this.pendingCommand == null && this.pendingExport == null;
  }

  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private resolveIdleWaiters(): void {
    if (!this.isIdle() || this.idleWaiters.length === 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const wake of waiters) wake();
  }

  setTickResultHandler(handler: TickResultHandler | null): void {
    this.onTickResult = handler;
  }

  setCommandResultHandler(handler: CommandResultHandler | null): void {
    this.onCommandResult = handler;
  }

  setWorkerFaultHandler(handler: WorkerFaultHandler | null): void {
    this.onWorkerFault = handler;
  }

  private releaseHeldRenderBuffer(): void {
    if (!this.heldRenderBuffer) return;
    if (this.worker) {
      this.returnRenderBuffer(this.heldRenderBuffer.index, this.heldRenderBuffer.buffer);
    }
    this.heldRenderBuffer = null;
  }

  syncWorld(world: WorldState): Promise<void> {
    this.worldRef = hydrateWorldRuntimeCaches(world);
    return this.queueFullWorldUpload(this.worldRef, 'syncWorld');
  }

  importSave(world: WorldState): Promise<void> {
    this.worldRef = hydrateWorldRuntimeCaches(world);
    this.lastPausedSent = world.paused;
    this.lastSpeedSent = world.speed;
    return this.queueFullWorldUpload(this.worldRef, 'importSave');
  }

  private queueFullWorldUpload(world: WorldState, kind: 'importSave' | 'syncWorld'): Promise<void> {
    if (!this.worker || !this.ready) return Promise.resolve();
    const uploadGen = this.generation;
    const upload = this.commandChain
      .then(async () => {
        if (uploadGen !== this.generation || !this.isReady()) return;
        await this.whenIdle();
        if (uploadGen !== this.generation || !this.isReady()) return;
        this.releaseHeldRenderBuffer();
        const worker = this.worker;
        if (!worker) return;

        invalidateWorldRuntimeCaches(world);
        // Carry this realm's stream positions with the world: the worker adopts the world's seed
        // on receipt, which resets its streams to the start of each owner's sequence, so without
        // this the authoritative realm would replay randomness the sender had already consumed.
        world.simRng = snapshotSimRng();
        const msg: WorkerRequest = kind === 'importSave'
          ? { type: 'importSave', proto: WORKER_PROTO, world }
          : { type: 'syncWorld', proto: WORKER_PROTO, world };
        try {
          worker.postMessage(msg);
        } finally {
          if (this.worldRef) {
            hydrateWorldRuntimeCaches(this.worldRef);
          }
        }
      });

    this.commandChain = upload.catch((err: unknown) => {
      if (uploadGen === this.generation) {
        console.warn(`[GameWorker] ${kind} upload failed`, err);
      }
    });
    return upload;
  }

  setPaused(paused: boolean): void {
    if (!this.worker || !this.ready) return;
    if (this.lastPausedSent === paused) return;
    this.lastPausedSent = paused;
    const msg: WorkerRequest = { type: 'setPaused', proto: WORKER_PROTO, paused };
    this.worker.postMessage(msg);
  }

  setSpeed(speed: number): void {
    if (!this.worker || !this.ready) return;
    if (this.lastSpeedSent === speed) return;
    this.lastSpeedSent = speed;
    const msg: WorkerRequest = { type: 'setSpeed', proto: WORKER_PROTO, speed };
    this.worker.postMessage(msg);
  }

  patchUiState(patch: WorkerUiPatch): void {
    if (!this.worker || !this.ready) return;
    const msg: WorkerRequest = {
      type: 'patchUi',
      proto: WORKER_PROTO,
      bigNews: patch.bigNews,
      floatingTexts: patch.floatingTexts,
      autoSave: patch.autoSave,
      nextFloatingTextId: patch.nextFloatingTextId,
      dismissedBigNewsIds: patch.dismissedBigNewsIds,
      dismissedNotificationIds: patch.dismissedNotificationIds,
      dismissedActiveEventIds: patch.dismissedActiveEventIds,
      activeEvent: patch.activeEvent,
      tutorialSeen: patch.tutorialSeen,
    };
    this.worker.postMessage(msg);
  }

  sendCommand(cmd: WorkerCommand): Promise<SimTickDelta> {
    if (!this.worker || !this.ready) {
      return Promise.reject(new Error('Worker not ready'));
    }
    if (this.pendingCommand) {
      return Promise.reject(new Error('Command already in flight'));
    }
    return new Promise((resolve, reject) => {
      this.pendingCommand = { resolve, reject };
      const msg: WorkerRequest = { type: 'command', proto: WORKER_PROTO, cmd };
      try {
        this.worker!.postMessage(msg);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.pendingCommand = null;
        reject(error);
        this.resolveIdleWaiters();
        this.onWorkerFault?.('command', error.message);
      }
    });
  }

  exportSave(): Promise<WorldState> {
    if (!this.worker || !this.ready) {
      return Promise.reject(new Error('Worker not ready'));
    }
    if (this.pendingExport) {
      return Promise.reject(new Error('Export already in flight'));
    }
    return new Promise((resolve, reject) => {
      this.pendingExport = { resolve, reject };
      const msg: WorkerRequest = { type: 'exportSave', proto: WORKER_PROTO };
      try {
        this.worker!.postMessage(msg);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.pendingExport = null;
        reject(error);
        this.resolveIdleWaiters();
        this.onWorkerFault?.('export', error.message);
      }
    });
  }

  requestTick(focus?: SimulationFocus): boolean {
    if (!this.worker || !this.ready || !this.canPipelineTick()) return false;
    const msg: WorkerRequest = { type: 'tick', proto: WORKER_PROTO, focus };
    try {
      this.worker.postMessage(msg);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[GameWorker] requestTick postMessage failed', error);
      this.onWorkerFault?.('tick', error.message);
      return false;
    }
    this.ticksInFlight++;
    this.pendingFocus = focus;
    return true;
  }

  private returnRenderBuffer(bufferIndex: number, buffer: ArrayBuffer): void {
    if (!this.worker || buffer.byteLength === 0) return;
    const returnMsg: WorkerRequest = { type: 'returnBuffer', proto: WORKER_PROTO, bufferIndex, buffer };
    try {
      this.worker.postMessage(returnMsg, [buffer]);
    } catch (err) {
      console.warn('[GameWorker] Failed to return render buffer', err);
    }
  }

  private adoptRenderBuffer(bufferIndex: number, buffer: ArrayBuffer): void {
    if (this.heldRenderBuffer) {
      this.returnRenderBuffer(this.heldRenderBuffer.index, this.heldRenderBuffer.buffer);
    }
    this.heldRenderBuffer = { index: bufferIndex, buffer };
  }

  private buildRender(
    renderBuffer: ArrayBuffer,
    delta: SimTickDelta,
    scentBuffer?: ArrayBuffer,
  ): WorkerTickRender | null {
    const reader = createRenderSoAReader(renderBuffer);
    if (!reader) return null;
    const scentReader = scentBuffer ? ScentGridReader.tryCreate(scentBuffer) : null;
    return {
      reader,
      metaBySlot: delta.renderMetaBySlot,
      scentReader,
    };
  }

  private rejectInFlight(err: Error, opts?: { decrementTicks?: boolean; resetAllTicks?: boolean }): void {
    if (opts?.resetAllTicks) {
      this.ticksInFlight = 0;
    } else if (opts?.decrementTicks) {
      this.ticksInFlight = Math.max(0, this.ticksInFlight - 1);
    }
    this.pendingCommand?.reject(err);
    this.pendingCommand = null;
    this.pendingExport?.reject(err);
    this.pendingExport = null;
    this.resolveIdleWaiters();
  }

  private handleMessage(msg: WorkerResponse): void {
    if (!isWorkerProto(msg.proto)) {
      const err = new Error(workerProtoMismatch(msg.proto));
      console.error('[GameWorker]', err.message, msg.type);
      this.rejectInFlight(err, { decrementTicks: msg.type === 'tickResult' });
      return;
    }

    if (msg.type === 'error') {
      console.error('[GameWorker]', msg.message);
      if (msg.source === 'tick') {
        this.ticksInFlight = Math.max(0, this.ticksInFlight - 1);
      } else {
        this.ticksInFlight = 0;
      }
      this.pendingCommand?.reject(new Error(msg.message));
      this.pendingCommand = null;
      this.pendingExport?.reject(new Error(msg.message));
      this.pendingExport = null;
      this.resolveIdleWaiters();
      this.onWorkerFault?.(msg.source ?? 'general', msg.message);
      return;
    }

    if (msg.type === 'commandResult' && this.worldRef) {
      const delta = msg.delta as SimTickDelta;
      if (msg.ok === false) {
        applySimTickDelta(this.worldRef, delta, { cloneMode: 'transfer' });
        invalidateWorldRuntimeCaches(this.worldRef);
        hydrateWorldRuntimeCaches(this.worldRef);
        this.onCommandResult?.(this.worldRef, delta, null, false, msg.reason);
        this.pendingCommand?.reject(new Error(msg.reason ?? 'Command failed'));
        this.pendingCommand = null;
        this.resolveIdleWaiters();
        return;
      }
      applySimTickDelta(this.worldRef, delta, { cloneMode: 'transfer' });
      invalidateWorldRuntimeCaches(this.worldRef);
      hydrateWorldRuntimeCaches(this.worldRef);
      let render: WorkerTickRender | null = null;
      if (msg.renderBuffer != null && msg.bufferIndex != null) {
        this.adoptRenderBuffer(msg.bufferIndex, msg.renderBuffer);
        render = this.buildRender(msg.renderBuffer, delta, msg.scentBuffer);
      }
      this.onCommandResult?.(this.worldRef, delta, render, true, msg.reason);
      this.pendingCommand?.resolve(delta);
      this.pendingCommand = null;
      this.resolveIdleWaiters();
      return;
    }

    if (msg.type === 'exportSaveResult') {
      this.pendingExport?.resolve(msg.world);
      this.pendingExport = null;
      this.resolveIdleWaiters();
      return;
    }

    if (msg.type !== 'tickResult' || !this.worldRef) return;

    this.ticksInFlight = Math.max(0, this.ticksInFlight - 1);
    const delta = msg.delta as SimTickDelta;
    applySimTickDelta(this.worldRef, delta, { cloneMode: 'transfer' });
    invalidateWorldRuntimeCaches(this.worldRef);
    hydrateWorldRuntimeCaches(this.worldRef);

    if (msg.headless || msg.renderBuffer == null || msg.bufferIndex == null) {
      this.onTickResult?.(this.worldRef, delta, null, true);
    } else {
      this.adoptRenderBuffer(msg.bufferIndex, msg.renderBuffer);
      const render = this.buildRender(msg.renderBuffer, delta, msg.scentBuffer);
      if (!render) {
        console.error('[GameWorker] Invalid render SoA buffer');
        this.onTickResult?.(this.worldRef, delta, null, true);
      } else {
        this.onTickResult?.(this.worldRef, delta, render, true);
      }
    }

    if (this.pendingFocus !== undefined) {
      this.pendingFocus = undefined;
    }
    this.resolveIdleWaiters();
  }
}

export function isGameWorkerEnabled(): boolean {
  if (typeof Worker === 'undefined') return false;
  const v = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_USE_GAME_WORKER : undefined;
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
    return true;
  }
  return true;
}
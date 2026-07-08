import type { WorldState } from '../gameTypes';
import type { SimulationFocus } from '../gameEngine';
import { createRenderSoAReader, type RenderSoAReaderV1 } from '../simBuffers/renderSoAReader';
import type { EntityRenderMeta } from '../simBuffers/entityRenderMeta';
import { applySimTickDelta, type SimTickDelta } from '../simBuffers/simDelta';
import { RENDER_BUFFER_POOL_SIZE } from '../simBuffers/renderBufferPool';
import { ScentGridReader } from '../scentGrid';
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
  metaBySlot: EntityRenderMeta[];
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

export type WorkerUiPatch = Pick<
  WorldState,
  'bigNews' | 'floatingTexts' | 'autoSave' | 'nextFloatingTextId'
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
    this.worldRef = world;
    this.worker = new Worker(new URL('./gameWorker.ts', import.meta.url), { type: 'module' });
    this.ready = false;
    this.lastPausedSent = null;
    this.lastSpeedSent = null;

    const pendingBeforeReady: WorkerResponse[] = [];
    const requestedFeatures: WorkerFeature[] = ['renderSoA_v1'];

    const readyPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Worker init timeout'));
        }
      }, 15000);

      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        if (initGen !== this.generation) return;
        const msg = event.data;

        if (!this.ready) {
          if (msg.type === 'ready') {
            if (!isWorkerProto(msg.proto)) {
              if (!settled) {
                settled = true;
                window.clearTimeout(timeout);
                reject(new Error(workerProtoMismatch(msg.proto)));
              }
              return;
            }
            try {
              assertWorkerFeatures(requestedFeatures, msg.buffers);
            } catch (err) {
              if (!settled) {
                settled = true;
                window.clearTimeout(timeout);
                reject(err instanceof Error ? err : new Error(String(err)));
              }
              return;
            }
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
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
              window.clearTimeout(timeout);
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
    });

    const init: WorkerRequest = {
      type: 'init',
      proto: WORKER_PROTO,
      world,
      features: requestedFeatures,
    };
    this.worker.postMessage(init);
    await readyPromise;

    if (initGen !== this.generation) {
      throw new Error('Worker disposed during init');
    }
  }

  dispose(): void {
    this.generation++;
    // Drop the display buffer locally — do not post returnBuffer to a worker we terminate
    // immediately after (transfer would detach the buffer on main before the worker runs).
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

  /** Worker-mutated world shadow — main thread must re-bind after commands/ticks. */
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

  private releaseHeldRenderBuffer(): void {
    if (!this.heldRenderBuffer) return;
    if (this.worker) {
      this.returnRenderBuffer(this.heldRenderBuffer.index, this.heldRenderBuffer.buffer);
    }
    this.heldRenderBuffer = null;
  }

  /** Full world upload — legacy fallback when worker is off; otherwise queued after idle. */
  syncWorld(world: WorldState): void {
    this.worldRef = world;
    this.queueFullWorldUpload(world, 'syncWorld');
  }

  /** Load / new-game round-trip (Rule 10). */
  importSave(world: WorldState): void {
    this.worldRef = world;
    this.lastPausedSent = world.paused;
    this.lastSpeedSent = world.speed;
    this.queueFullWorldUpload(world, 'importSave');
  }

  private queueFullWorldUpload(world: WorldState, kind: 'importSave' | 'syncWorld'): void {
    if (!this.worker || !this.ready) return;
    const uploadGen = this.generation;
    this.commandChain = this.commandChain
      .then(async () => {
        if (uploadGen !== this.generation || !this.isReady()) return;
        await this.whenIdle();
        if (uploadGen !== this.generation || !this.isReady()) return;
        this.releaseHeldRenderBuffer();
        const worker = this.worker;
        if (!worker) return;
        const msg: WorkerRequest = kind === 'importSave'
          ? { type: 'importSave', proto: WORKER_PROTO, world }
          : { type: 'syncWorld', proto: WORKER_PROTO, world };
        worker.postMessage(msg);
      })
      .catch((err: unknown) => {
        if (uploadGen !== this.generation) return;
        console.warn(`[GameWorker] ${kind} upload failed`, err);
      });
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
      this.worker!.postMessage(msg);
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
      this.worker!.postMessage(msg);
    });
  }

  requestTick(focus?: SimulationFocus): boolean {
    if (!this.worker || !this.ready || !this.canPipelineTick()) return false;
    this.ticksInFlight++;
    this.pendingFocus = focus;
    const msg: WorkerRequest = { type: 'tick', proto: WORKER_PROTO, focus };
    this.worker.postMessage(msg);
    return true;
  }

  private returnRenderBuffer(bufferIndex: number, buffer: ArrayBuffer): void {
    if (!this.worker) return;
    const returnMsg: WorkerRequest = { type: 'returnBuffer', proto: WORKER_PROTO, bufferIndex, buffer };
    this.worker.postMessage(returnMsg, [buffer]);
  }

  /** Swap in a new display buffer; returns the previous one to the worker pool. */
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
      metaBySlot: delta.renderMetaBySlot ?? [],
      scentReader,
    };
  }

  private rejectInFlight(err: Error, opts?: { decrementTicks?: boolean }): void {
    if (opts?.decrementTicks) {
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
      this.ticksInFlight = Math.max(0, this.ticksInFlight - 1);
      this.pendingCommand?.reject(new Error(msg.message));
      this.pendingCommand = null;
      this.pendingExport?.reject(new Error(msg.message));
      this.pendingExport = null;
      this.resolveIdleWaiters();
      return;
    }

    if (msg.type === 'commandResult' && this.worldRef) {
      if (msg.ok === false) {
        this.onCommandResult?.(this.worldRef, msg.delta, null, false, msg.reason);
        this.pendingCommand?.reject(new Error(msg.reason ?? 'Command failed'));
        this.pendingCommand = null;
        this.resolveIdleWaiters();
        return;
      }
      applySimTickDelta(this.worldRef, msg.delta, { cloneMode: 'transfer' });
      let render: WorkerTickRender | null = null;
      if (msg.renderBuffer != null && msg.bufferIndex != null) {
        this.adoptRenderBuffer(msg.bufferIndex, msg.renderBuffer);
        render = this.buildRender(msg.renderBuffer, msg.delta, undefined);
      }
      this.onCommandResult?.(this.worldRef, msg.delta, render, true, msg.reason);
      this.pendingCommand?.resolve(msg.delta);
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
    applySimTickDelta(this.worldRef, msg.delta, { cloneMode: 'transfer' });

    if (msg.headless || msg.renderBuffer == null || msg.bufferIndex == null) {
      this.onTickResult?.(this.worldRef, msg.delta, null, true);
    } else {
      const reader = createRenderSoAReader(msg.renderBuffer);
      if (!reader) {
        console.error('[GameWorker] Invalid render SoA buffer');
        this.returnRenderBuffer(msg.bufferIndex, msg.renderBuffer);
        this.onTickResult?.(this.worldRef, msg.delta, null, true);
      } else {
        this.adoptRenderBuffer(msg.bufferIndex, msg.renderBuffer);
        const render = this.buildRender(msg.renderBuffer, msg.delta, msg.scentBuffer);
        this.onTickResult?.(this.worldRef, msg.delta, render, true);
      }
    }

    if (this.pendingFocus !== undefined) {
      this.pendingFocus = undefined;
    }
    this.resolveIdleWaiters();
  }
}

function isWorkerEnvDisabled(value: unknown): boolean {
  if (value === false || value === 0) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no';
  }
  return false;
}

export function isGameWorkerEnabled(): boolean {
  if (typeof Worker === 'undefined') return false;
  if (typeof import.meta !== 'undefined' && isWorkerEnvDisabled(import.meta.env?.VITE_USE_GAME_WORKER)) {
    return false;
  }
  return true;
}
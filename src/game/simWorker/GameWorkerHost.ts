
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

/**
 * The player-authored slice of UI state that a patch may carry.
 *
 * **Only fields the player authors belong here.** `bigNews`, `floatingTexts` and `activeEvent` were
 * removed: the *tick* authors those on the worker side, and `applyWorkerUiPatch`
 * deliberately never adopted them — so shipping them cloned the whole news list and every live floating
 * text into every patch, and `protocol.ts` advertised a transfer that did not happen. Because a patch is
 * composed from the host's snapshot it can be up to `MAX_PIPELINE_DEPTH` ticks behind, which is exactly
 * why adopting them used to rewind the worker and destroy events the player had not seen yet
 * (`BUG_REPORTS/2026-09-16-ui-patch-rewinds-worker-authored-big-news.md`).
 */
export type WorkerUiPatch = Pick<
  WorldState,
  | 'autoSave'
  | 'nextFloatingTextId'
  | 'dismissedBigNewsIds'
  | 'dismissedNotificationIds'
  | 'dismissedActiveEventIds'
  | 'tutorialSeen'
>;

/**
 * Max ticks in flight — reserve one pool slot for the display buffer held on main.
 *
 * The command render refresh takes a slot of its own as well, and it is *not* covered by this
 * subtraction: one slot is the display buffer, this many are ticks, and the command's arrives when
 * the pool is already at its limit. `canPipelineTick` therefore also refuses to start a tick while a
 * command is outstanding, which is what actually keeps the accounting closed. Reducing this to
 * `POOL - 2` would be the other way to reserve the slot, at the cost of a pipeline stage on every
 * tick rather than only around a player command.
 */
export const MAX_PIPELINE_DEPTH = Math.max(0, RENDER_BUFFER_POOL_SIZE - 1);

/** A requested export, and the timer that frees the host if its reply never arrives. */
type PendingExport = {
  resolve: (world: WorldState) => void;
  reject: (err: Error) => void;
  deadline: ReturnType<typeof setTimeout>;
};

/** How long an export may wait for its reply before the host stops counting it. */
const EXPORT_REPLY_DEADLINE_MS = 30000;

/**
 * How long a command may wait for its reply. This is the freeze guard: `canPipelineTick()` refuses
 * every tick while a command is pending, and the stall watchdog needs a tick in flight to fire — so a
 * reply that never came stopped the simulation for good with the renderer still drawing at full rate.
 */
const COMMAND_REPLY_DEADLINE_MS = 30000;

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
    deadline: ReturnType<typeof setTimeout>;
  } | null = null;
  private pendingExport: PendingExport | null = null;
  private idleWaiters: Array<() => void> = [];
  /** Woken when the worker handshake settles — see `whenReady()`. */
  private readyWaiters: Array<() => void> = [];
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
    // Refuse a re-init rather than silently orphaning the running worker. `dispose()` below tears the
    // old one down, but only for a host that reaches it — a second `init()` on a host that is mid-handshake
    // or already used would otherwise `terminate()` a worker whose ticks nobody has unsubscribed, and the
    // caller would see a resolved promise for a session that is gone. Every in-tree caller constructs a
    // fresh host per boot (`GameLoop`'s constructor and `attemptWorkerRecovery`), so this is a guard, not
    // a supported path.
    if (this.worker != null || this.ready) {
      throw new Error('GameWorkerHost.init() called on a host that is already initialized');
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
              this.resolveReadyWaiters();
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
    this.settleCommand((pending) => pending.reject(new Error('Worker disposed')));
    this.settleExport((pending) => pending.reject(new Error('Worker disposed')));
    this.commandChain = Promise.resolve();
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const wake of waiters) wake();
    // Ready waiters must not hang forever on a disposed host; they re-check `isReady()`.
    this.resolveReadyWaiters();
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

  /**
   * Whether another tick may be posted right now.
   *
   * Two conditions, and the second is not cosmetic:
   *
   * 1. **A free render-buffer slot.** `MAX_PIPELINE_DEPTH` reserves one slot for the buffer held on
   *    main for drawing; each tick in flight holds another. Exceeding the pool is not a soft failure —
   *    the worker rolls the tick back and posts a `tick`-sourced error, which the host treats as fatal
   *    and answers with `fallbackFromWorker`, so the sim worker is torn down mid-session.
   * 2. **No command in flight.** A command result carries its own render refresh, and the worker
   *    acquires a pool slot for it (`gameWorker.ts`, the `command` case). That slot is *additional* to
   *    the reserved display buffer and to every tick in flight, so with `MAX_PIPELINE_DEPTH` ticks
   *    outstanding (the pool held exactly at its limit) a command takes the pool to its size and any
   *    further tick finds nothing free — the fatal case above. Counting the command here makes the
   *    host stop posting ticks while one is outstanding, which is why the accounting closes.
   *
   * The command is never dropped for this: `GameLoop.applyCommand` queues it on its own chain and
   * posts it as soon as this returns true.
   */
  canPipelineTick(): boolean {
    return this.ticksInFlight < MAX_PIPELINE_DEPTH && this.pendingCommand == null;
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

  /**
   * Resolves once the worker handshake has completed; resolves immediately when already ready.
   * Callers that must not poll `GameLoop.workerBooting` (the import chain clears that flag itself)
   * wait here instead — polling a flag the caller owns deadlocked every in-game load
   * (`BUG_REPORTS/2026-09-16-loading-a-save-freezes-the-sim-worker.md`).
   */
  whenReady(): Promise<void> {
    if (this.isReady()) return Promise.resolve();
    return new Promise((resolve) => {
      this.readyWaiters.push(resolve);
    });
  }

  private resolveReadyWaiters(): void {
    if (this.readyWaiters.length === 0) return;
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const wake of waiters) wake();
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
    // Only remember the value as sent if the post actually left: a DataCloneError must not stop a
    // later retry.
    if (!this.postControl(msg)) this.lastPausedSent = null;
  }

  setSpeed(speed: number): void {
    if (!this.worker || !this.ready) return;
    if (this.lastSpeedSent === speed) return;
    this.lastSpeedSent = speed;
    const msg: WorkerRequest = { type: 'setSpeed', proto: WORKER_PROTO, speed };
    if (!this.postControl(msg)) this.lastSpeedSent = null;
  }

  /**
   * Post a fire-and-forget control message. `postMessage` throws synchronously (DataCloneError) for
   * a non-cloneable payload; without this the exception escaped into the caller — a React event
   * handler — instead of degrading to a worker fault.
   * Returns whether the message was posted.
   */
  private postControl(msg: WorkerRequest): boolean {
    try {
      this.worker?.postMessage(msg);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn(`[GameWorkerHost] ${msg.type} postMessage failed`, error);
      this.onWorkerFault?.('general', error.message);
      return false;
    }
  }

  patchUiState(patch: WorkerUiPatch): void {
    if (!this.worker || !this.ready) return;
    const msg: WorkerRequest = {
      type: 'patchUi',
      proto: WORKER_PROTO,
      autoSave: patch.autoSave,
      nextFloatingTextId: patch.nextFloatingTextId,
      dismissedBigNewsIds: patch.dismissedBigNewsIds,
      dismissedNotificationIds: patch.dismissedNotificationIds,
      dismissedActiveEventIds: patch.dismissedActiveEventIds,
      tutorialSeen: patch.tutorialSeen,
    };
    this.postControl(msg);
  }

  sendCommand(cmd: WorkerCommand): Promise<SimTickDelta> {
    if (!this.worker || !this.ready) {
      return Promise.reject(new Error('Worker not ready'));
    }
    if (this.pendingCommand) {
      return Promise.reject(new Error('Command already in flight'));
    }
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        // No reply: free the pipeline, or every later tick is refused and the world stops advancing
        // while the renderer keeps drawing. The fault also hands the loop back to main-thread ticks.
        deadline: setTimeout(() => {
          if (this.pendingCommand !== entry) return;
          this.settleCommand((pending) => pending.reject(new Error('Worker command timed out')));
          this.resolveIdleWaiters();
          this.onWorkerFault?.('command', 'Worker command timed out');
        }, COMMAND_REPLY_DEADLINE_MS),
      };
      this.pendingCommand = entry;
      const msg: WorkerRequest = { type: 'command', proto: WORKER_PROTO, cmd };
      try {
        this.worker!.postMessage(msg);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.settleCommand((pending) => pending.reject(error));
        this.resolveIdleWaiters();
        this.onWorkerFault?.('command', error.message);
      }
    });
  }

  /** Settles the pending command, clearing its deadline so a settled entry leaves no timer behind. */
  private settleCommand(settle: (pending: NonNullable<GameWorkerHost['pendingCommand']>) => void): void {
    const pending = this.pendingCommand;
    if (!pending) return;
    clearTimeout(pending.deadline);
    this.pendingCommand = null;
    settle(pending);
  }

  /** Settles the pending export, clearing its deadline so a settled entry leaves no timer behind. */
  private settleExport(settle: (pending: PendingExport) => void): void {
    const pending = this.pendingExport;
    if (!pending) return;
    clearTimeout(pending.deadline);
    this.pendingExport = null;
    settle(pending);
  }

  exportSave(): Promise<WorldState> {
    if (!this.worker || !this.ready) {
      return Promise.reject(new Error('Worker not ready'));
    }
    if (this.pendingExport) {
      return Promise.reject(new Error('Export already in flight'));
    }
    return new Promise((resolve, reject) => {
      const entry: PendingExport = {
        resolve,
        reject,
        // A reply that never comes must not leave the host permanently un-idle: every later save would
        // wait out its whole budget before falling back to the display world.
        deadline: setTimeout(() => {
          if (this.pendingExport !== entry) return;
          this.settleExport((pending) => pending.reject(new Error('Worker export timed out')));
          this.resolveIdleWaiters();
          this.onWorkerFault?.('export', 'Worker export timed out');
        }, EXPORT_REPLY_DEADLINE_MS),
      };
      this.pendingExport = entry;
      const msg: WorkerRequest = { type: 'exportSave', proto: WORKER_PROTO };
      try {
        this.worker!.postMessage(msg);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.settleExport((pending) => pending.reject(error));
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
    this.settleCommand((pending) => pending.reject(err));
    this.settleExport((pending) => pending.reject(err));
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
      this.settleCommand((pending) => pending.reject(new Error(msg.message)));
      this.settleExport((pending) => pending.reject(new Error(msg.message)));
      this.resolveIdleWaiters();
      this.onWorkerFault?.(msg.source ?? 'general', msg.message);
      return;
    }

    if (msg.type === 'commandResult') {
      // Bookkeeping first, and unconditionally: a result that cannot be applied must still settle its
      // promise and clear the flag. Clearing it only on the path that applies the delta left the host
      // permanently un-idle, which times out every save and reads as a stalled worker.
      const pendingCommand = this.pendingCommand;
      if (pendingCommand) clearTimeout(pendingCommand.deadline);
      this.pendingCommand = null;
      if (!this.worldRef) {
        pendingCommand?.reject(new Error('Worker command result arrived with no world attached'));
        this.resolveIdleWaiters();
        return;
      }
      const delta = msg.delta as SimTickDelta;
      if (msg.ok === false) {
        applySimTickDelta(this.worldRef, delta, { cloneMode: 'transfer' });
        invalidateWorldRuntimeCaches(this.worldRef);
        hydrateWorldRuntimeCaches(this.worldRef);
        this.onCommandResult?.(this.worldRef, delta, null, false, msg.reason);
        pendingCommand?.reject(new Error(msg.reason ?? 'Command failed'));
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
      pendingCommand?.resolve(delta);
      this.resolveIdleWaiters();
      return;
    }

    if (msg.type === 'exportSaveResult') {
      this.settleExport((pending) => pending.resolve(msg.world));
      this.resolveIdleWaiters();
      return;
    }

    if (msg.type !== 'tickResult') return;

    // The counter drops whether or not the delta can be applied. A tick result that arrived with no
    // world attached used to leave a tick in flight for good — the stall detector then fired on a
    // worker that was answering, and fell the whole game back to the main thread.
    this.ticksInFlight = Math.max(0, this.ticksInFlight - 1);
    if (!this.worldRef) {
      this.resolveIdleWaiters();
      return;
    }
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

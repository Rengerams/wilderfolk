import type { WorldState } from './gameTypes';
import { gameTick, computeSimulationFocus, type SimulationFocus } from './gameEngine';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './dayCycle';
import { EntityCatalog } from './entityCatalog';
import { renderGame, resetRendererCaches } from './rendererLoader';
import { buildRenderSnapshot, type RenderSnapshot } from './renderSnapshot';
import { patchCatalogKinematicsFromRenderSoA } from './simBuffers/applyKinematics';
import type { EntityRenderMeta } from './simBuffers/entityRenderMeta';
import type { RenderSoAReaderV1 } from './simBuffers/renderSoAReader';
import { clearAllFactionWanderStates } from './factionWander';
import { GameWorkerHost, isGameWorkerEnabled, type WorkerUiPatch } from './simWorker/GameWorkerHost';
import type { WorkerCommand } from './simWorker/commands';
import { applyWorkerCommand } from './simWorker/commands';
import { createOptimisticDisplayWorld, hydrateWorldRuntimeCaches } from './worldRuntimeCaches';
import type { ScentGridReader } from './scentGrid';
import {
  clearScreenShakeImpulse,
  createInitialView,
  resolveBuilding,
  resolveEntity,
  syncScreenShakeFromWorld,
  updateView,
  type ViewState,
} from './viewState';

/**
 * Real-time tick rate at 1×. With TICKS_PER_DAY=72, 1.5 ticks/s ≈ 48 real seconds per day.
 */
const BASE_TICKS_PER_SECOND = 1.5;

/** React UI publish throttle (ms) for periodic non-tick polls. */
const UI_UPDATE_MS = 250;
const MAX_CATCHUP_STEPS = 12;

/** Worker stall watchdog (ms). */
const WORKER_STALL_TIMEOUT_MS = 10000;
const WORKER_RECOVERY_INITIAL_DELAY_MS = 2000;
const WORKER_RECOVERY_MAX_DELAY_MS = 30000;

export type { WorkerCommand } from './simWorker/commands';

export type SessionListener = (
  world: WorldState,
  view: ViewState,
  tickChanged: boolean,
  catalog: EntityCatalog,
) => void;

export interface GameLoopDiagnostics {
  workerMode: 'worker' | 'main-thread';
  workerBooting: boolean;
  tick: number;
  inGameDay: number;
  hour: number;
  paused: boolean;
  speed: number;
  ticksInFlight: number;
  commandInFlight: boolean;
  tickLatencyMs: number;
  lastWorkerActivityMsAgo: number | null;
  lastDailyBoundaryTick: number;
}

function extractUiPatch(world: WorldState): WorkerUiPatch {
  return {
    bigNews: world.bigNews,
    floatingTexts: world.floatingTexts,
    autoSave: world.autoSave,
    nextFloatingTextId: world.nextFloatingTextId,
    dismissedBigNewsIds: world.dismissedBigNewsIds ? [...world.dismissedBigNewsIds] : undefined,
    dismissedNotificationIds: world.dismissedNotificationIds
      ? [...world.dismissedNotificationIds]
      : undefined,
    dismissedActiveEventIds: world.dismissedActiveEventIds
      ? [...world.dismissedActiveEventIds]
      : undefined,
    activeEvent: world.activeEvent,
    tutorialSeen: world.tutorialSeen ? [...world.tutorialSeen] : undefined,
  };
}

function bigNewsPatchChanged(before: WorkerUiPatch['bigNews'], after: WorkerUiPatch['bigNews']): boolean {
  if (before.length !== after.length) return true;
  for (let i = 0; i < before.length; i++) {
    if (before[i]?.id !== after[i]?.id || before[i]?.dismissed !== after[i]?.dismissed) {
      return true;
    }
  }
  return false;
}

function idsPatchChanged(before?: readonly string[], after?: readonly string[]): boolean {
  const a = before ?? [];
  const b = after ?? [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

function uiPatchChanged(before: WorkerUiPatch, after: WorkerUiPatch): boolean {
  return (
    before.autoSave !== after.autoSave ||
    before.nextFloatingTextId !== after.nextFloatingTextId ||
    bigNewsPatchChanged(before.bigNews, after.bigNews) ||
    before.floatingTexts.length !== after.floatingTexts.length ||
    before.floatingTexts[before.floatingTexts.length - 1]?.id !==
      after.floatingTexts[after.floatingTexts.length - 1]?.id ||
    idsPatchChanged(before.dismissedBigNewsIds, after.dismissedBigNewsIds) ||
    idsPatchChanged(before.dismissedNotificationIds, after.dismissedNotificationIds) ||
    idsPatchChanged(before.dismissedActiveEventIds, after.dismissedActiveEventIds) ||
    (before.activeEvent?.id ?? null) !== (after.activeEvent?.id ?? null) ||
    idsPatchChanged(before.tutorialSeen, after.tutorialSeen)
  );
}

export class GameLoop {
  private world: WorldState;
  private view: ViewState;
  private readonly catalog = new EntityCatalog();
  private lastCatalogByTypeRef: unknown = undefined;
  private rafId = 0;
  private running = false;
  private tickAccumulator = 0;
  private lastFrameTime = 0;
  private lastUiUpdate = 0;
  private lastNotifiedTick = -1;
  private listeners = new Set<SessionListener>();
  private getCanvas: () => HTMLCanvasElement | null;
  private workerHost: GameWorkerHost | null = null;
  private workerEnabled = false;
  private workerBooting = false;
  private workerTickChanged = false;
  private lastWorkerActivity = 0;
  private lastWorkerTickRequest = 0;
  private lastDailyBoundaryTick = 0;
  private workerTickLatencyMs = 0;
  private workerRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private workerRecoveryDelayMs = WORKER_RECOVERY_INITIAL_DELAY_MS;
  private workerRecoveryInFlight = false;
  private renderSoA: RenderSoAReaderV1 | null = null;
  private renderMetaBySlot: EntityRenderMeta[] | null = null;
  private scentReader: ScentGridReader | null = null;
  private sessionGen = 0;
  private notifyDepth = 0;
  private lastPausedSentToWorker: boolean | null = null;
  private commandChain: Promise<void> = Promise.resolve();
  private optimisticCommands: WorkerCommand[] = [];
  private deferredWorkerCommands: Array<{ cmd: WorkerCommand; sessionGen: number }> = [];
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private canvasCtxFor: HTMLCanvasElement | null = null;
  private layoutSize = { w: 0, h: 0 };
  private layoutCanvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private snapshotCache: RenderSnapshot | null = null;
  private snapshotKey = '';

  constructor(world: WorldState, view: ViewState, getCanvas: () => HTMLCanvasElement | null) {
    resetRendererCaches();
    this.world = world;
    this.view = view;
    this.getCanvas = getCanvas;
    this.catalog.rebuild(world.entities);
    this.lastDailyBoundaryTick = Math.floor(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
    this.lastNotifiedTick = world.tick;

    if (isGameWorkerEnabled()) {
      this.workerBooting = true;
      this.workerHost = new GameWorkerHost();
      const initGen = this.sessionGen;

      void this.workerHost
        .init(world)
        .then(async () => {
          if (initGen !== this.sessionGen || !this.workerHost) {
            this.workerBooting = false;
            this.workerEnabled = false;
            if (initGen !== this.sessionGen) {
              this.workerHost?.dispose();
              this.workerHost = null;
            }
            return;
          }

          const activeGen = await this.importLatestWorldForWorker(this.workerHost);
          if (activeGen == null) return;

          this.workerEnabled = true;
          this.lastWorkerActivity = performance.now();
          this.workerBooting = false;
          this.registerWorkerHandlers(activeGen);
          this.flushDeferredWorkerCommands();
          console.info('[GameLoop] Sim worker active — gameTick + commands run off the main thread');
        })
        .catch((err) => {
          if (initGen !== this.sessionGen) return;
          console.warn('[GameLoop] Worker init failed — falling back to main-thread ticks', err);
          this.workerHost?.dispose();
          this.workerHost = null;
          this.workerEnabled = false;
          this.workerBooting = false;
          this.renderSoA = null;
          this.renderMetaBySlot = null;
          this.scentReader = null;
          this.scheduleWorkerRecovery();
        });
    }
  }

  private async importLatestWorldForWorker(workerHost: GameWorkerHost): Promise<number | null> {
    let importedGen: number;
    do {
      if (this.workerHost !== workerHost || !workerHost.isReady()) return null;
      importedGen = this.sessionGen;
      await workerHost.importSave(this.world);
    } while (
      this.workerHost === workerHost &&
      workerHost.isReady() &&
      importedGen !== this.sessionGen
    );
    return this.workerHost === workerHost && workerHost.isReady() ? importedGen : null;
  }

  private flushDeferredWorkerCommands(): void {
    const deferred = this.deferredWorkerCommands;
    this.deferredWorkerCommands = [];
    for (let i = 0; i < deferred.length; i++) {
      const entry = deferred[i];
      if (entry.sessionGen !== this.sessionGen) continue;
      this.applyCommand(entry.cmd);
    }
  }

  private scheduleWorkerRecovery(): void {
    if (
      !this.running ||
      !isGameWorkerEnabled() ||
      this.workerRecoveryTimer ||
      this.workerRecoveryInFlight
    ) {
      return;
    }
    this.workerRecoveryTimer = setTimeout(() => {
      this.workerRecoveryTimer = null;
      this.attemptWorkerRecovery();
    }, this.workerRecoveryDelayMs);
  }

  private attemptWorkerRecovery(): void {
    if (
      !this.running ||
      !isGameWorkerEnabled() ||
      this.workerHost ||
      this.workerBooting ||
      this.workerRecoveryInFlight
    ) {
      return;
    }

    const recoveryGen = this.sessionGen;
    const recoveryHost = new GameWorkerHost();
    this.workerRecoveryInFlight = true;
    this.workerBooting = true;
    this.workerHost = recoveryHost;

    void recoveryHost
      .init(this.world)
      .then(async () => {
        if (
          recoveryGen !== this.sessionGen ||
          !this.running ||
          this.workerHost !== recoveryHost
        ) {
          recoveryHost.dispose();
          if (this.workerHost === recoveryHost) {
            this.workerHost = null;
            this.workerBooting = false;
            this.workerRecoveryInFlight = false;
          }
          return;
        }

        const activeGen = await this.importLatestWorldForWorker(recoveryHost);
        if (activeGen == null || this.workerHost !== recoveryHost) return;

        this.workerEnabled = true;
        this.workerBooting = false;
        this.workerRecoveryInFlight = false;
        this.workerRecoveryDelayMs = WORKER_RECOVERY_INITIAL_DELAY_MS;
        this.lastWorkerActivity = performance.now();
        this.lastWorkerTickRequest = 0;
        this.workerTickLatencyMs = 0;
        this.registerWorkerHandlers(activeGen);
        this.flushDeferredWorkerCommands();
        console.info('[GameLoop] Sim worker recovered automatically');
      })
      .catch((err) => {
        if (this.workerHost === recoveryHost) {
          recoveryHost.dispose();
          this.workerHost = null;
          this.workerEnabled = false;
          this.workerBooting = false;
          this.workerRecoveryInFlight = false;
          this.renderSoA = null;
          this.renderMetaBySlot = null;
          this.scentReader = null;
        }
        if (recoveryGen === this.sessionGen && this.running) {
          this.workerRecoveryDelayMs = Math.min(
            this.workerRecoveryDelayMs * 2,
            WORKER_RECOVERY_MAX_DELAY_MS,
          );
          console.warn('[GameLoop] Automatic worker recovery failed; retrying', err);
          this.scheduleWorkerRecovery();
        }
      });
  }

  private registerWorkerHandlers(initGen: number): void {
    this.workerHost!.setTickResultHandler((nextWorld, _delta, render, changed) => {
      if (initGen !== this.sessionGen) return;
      this.lastWorkerActivity = performance.now();

      if (this.lastWorkerTickRequest > 0) {
        const measured = performance.now() - this.lastWorkerTickRequest;
        this.workerTickLatencyMs = this.workerTickLatencyMs * 0.7 + measured * 0.3;
      }

      this.observeDailyBoundary(nextWorld.tick);
      if (this.optimisticCommands.length === 0) {
        this.world = nextWorld;
        this.catalog.rebuild(this.world.entities);
      }

      if (render) {
        this.renderSoA = render.reader;
        this.renderMetaBySlot = render.metaBySlot ?? null;
        this.scentReader = render.scentReader;
        patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader, render.metaBySlot);
      }

      this.view = syncScreenShakeFromWorld(this.view, this.world);
      clearScreenShakeImpulse(this.world);
      this.workerTickChanged = changed;
    });

    this.workerHost!.setWorkerFaultHandler((source, message) => {
      if (initGen !== this.sessionGen) return;
      this.fallbackFromWorker(`Worker ${source} error: ${message}`);
    });

    this.workerHost!.setCommandResultHandler((world, _delta, render, ok, reason) => {
      if (initGen !== this.sessionGen) return;
      this.lastWorkerActivity = performance.now();

      const hadOptimistic = this.optimisticCommands.length > 0;
      if (hadOptimistic) this.optimisticCommands.shift();

      this.world = world;
      if (this.optimisticCommands.length > 0) this.rebuildOptimisticDisplay();

      if (render) {
        this.renderSoA = render.reader;
        this.renderMetaBySlot = render.metaBySlot ?? null;
        this.scentReader = render.scentReader;
        patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader, render.metaBySlot);
      }

      if (hadOptimistic) {
        this.catalog.rebuild(this.world.entities);
        this.pruneStaleSelection();
        this.notify(true, false, true);
      }

      if (!ok) {
        console.warn(
          '[GameLoop] Worker command failed — reverted to authoritative state',
          reason ?? 'unknown',
        );
      }
    });
  }

  private fallbackFromWorker(reason: string): void {
    if (!this.workerEnabled && !this.workerBooting) return;
    console.warn(`[GameLoop] ${reason} — falling back to main-thread ticks`);

    // Always clear optimistic queue & sync back to authoritative state
    this.optimisticCommands = [];
    this.syncAfterWorkerMutation();
    this.catalog.rebuild(this.world.entities);
    this.pruneStaleSelection();
    this.notify(true, false, true);

    this.workerHost?.dispose();
    this.workerHost = null;
    this.workerEnabled = false;
    this.workerBooting = false;
    this.renderSoA = null;
    this.renderMetaBySlot = null;
    this.scentReader = null;
    this.scheduleWorkerRecovery();
  }

  isUsingSimWorker(): boolean {
    return this.workerEnabled && Boolean(this.workerHost?.isReady());
  }

  isSimWorkerBooting(): boolean {
    return this.workerBooting;
  }

  private observeDailyBoundary(tick: number): void {
    const boundary = Math.floor(tick / TICKS_PER_DAY) * TICKS_PER_DAY;
    if (boundary > this.lastDailyBoundaryTick) {
      this.lastDailyBoundaryTick = boundary;
    }
  }

  getDiagnostics(now = performance.now()): GameLoopDiagnostics {
    const worker = this.isUsingSimWorker();
    return {
      workerMode: worker ? 'worker' : 'main-thread',
      workerBooting: this.workerBooting,
      tick: this.world.tick,
      inGameDay: Math.floor(this.world.tick / TICKS_PER_DAY) + 1,
      hour: Math.floor((this.world.tick % TICKS_PER_DAY) / TICKS_PER_HOUR),
      paused: this.world.paused,
      speed: this.world.speed,
      ticksInFlight: worker ? this.workerHost?.getTicksInFlight?.() ?? 0 : 0,
      commandInFlight: worker ? this.workerHost?.hasCommandInFlight?.() ?? false : false,
      tickLatencyMs: this.workerTickLatencyMs,
      lastWorkerActivityMsAgo:
        worker && this.lastWorkerActivity > 0 ? Math.max(0, now - this.lastWorkerActivity) : null,
      lastDailyBoundaryTick: this.lastDailyBoundaryTick,
    };
  }

  getWorld(): WorldState {
    return this.world;
  }

  getView(): ViewState {
    return this.view;
  }

  getEntityCatalog(): EntityCatalog {
    return this.catalog;
  }

  private adoptWorldSession(world: WorldState, view: ViewState): void {
    this.sessionGen++;
    this.commandChain = Promise.resolve();
    this.optimisticCommands = [];
    this.deferredWorkerCommands = [];
    if (this.workerEnabled && this.workerHost?.isReady()) {
      this.workerBooting = true;
    }

    clearAllFactionWanderStates();
    resetRendererCaches();

    this.world = world;
    this.view = view;
    this.lastNotifiedTick = world.tick;
    this.lastDailyBoundaryTick = Math.floor(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
    this.catalog.rebuild(world.entities);
    this.renderSoA = null;
    this.renderMetaBySlot = null;
    this.scentReader = null;

    const sessionGen = this.sessionGen;
    this.queueWorkerImport(world, () => {
      if (sessionGen === this.sessionGen) this.notify(true);
    });
    this.lastPausedSentToWorker = null;
  }

  setSession(world: WorldState, view: ViewState): void {
    this.adoptWorldSession(world, view);
  }

  setWorld(world: WorldState): void {
    this.adoptWorldSession(world, createInitialView(world.width, world.height));
  }

  private queueWorkerImport(world: WorldState, afterImport?: () => void): void {
    if (!this.workerHost) {
      afterImport?.();
      return;
    }
    const sessionGen = this.sessionGen;
    this.commandChain = this.commandChain
      .then(async () => {
        while (this.workerBooting && sessionGen === this.sessionGen && this.running) {
          await new Promise<void>((resolve) => setTimeout(resolve, 16));
        }
        if (sessionGen !== this.sessionGen || !this.running || !this.workerHost?.isReady()) return;
        await this.workerHost.whenIdle();
        if (sessionGen !== this.sessionGen || !this.running || !this.workerHost?.isReady()) return;

        this.renderSoA = null;
        this.renderMetaBySlot = null;
        this.scentReader = null;
        await this.workerHost.importSave(world);

        if (sessionGen !== this.sessionGen || !this.running || !this.workerHost?.isReady()) return;
        this.workerBooting = false;
        this.flushDeferredWorkerCommands();
        afterImport?.();
      })
      .catch((err) => {
        if (sessionGen !== this.sessionGen) return;
        console.warn('[GameLoop] Worker importSave failed', err);
      });
  }

  setView(view: ViewState): void {
    this.view = view;
  }

  patchView(patch: Partial<ViewState>, silent = false): void {
    this.view = { ...this.view, ...patch };
    if (!silent) this.notify(false, false, true);
  }

  private rebuildOptimisticDisplay(): void {
    const authoritative = this.workerHost?.getAuthoritativeWorld();
    if (!authoritative) return;

    // Deep clone so optimistic command mutations never contaminate the authoritative shadow
    let display = createOptimisticDisplayWorld(authoritative);

    for (let i = 0; i < this.optimisticCommands.length; i++) {
      try {
        display = applyWorkerCommand(display, this.optimisticCommands[i]);
      } catch (err) {
        console.warn('[GameLoop] Optimistic command display failed; awaiting worker result', err);
        break;
      }
    }
    this.world = display;
  }

  applyCommand(cmd: WorkerCommand): void {
    if (this.workerBooting && this.workerHost) {
      this.deferredWorkerCommands.push({ cmd, sessionGen: this.sessionGen });
      return;
    }

    if (this.workerEnabled && this.workerHost?.isReady()) {
      this.optimisticCommands.push(cmd);
      this.rebuildOptimisticDisplay();
      this.catalog.rebuild(this.world.entities);
      this.pruneStaleSelection();
      this.notify(true, false, true);

      const cmdGen = this.sessionGen;
      this.commandChain = this.commandChain
        .then(() => {
          if (cmdGen !== this.sessionGen || !this.running || !this.workerHost?.isReady()) return;
          return this.workerHost.sendCommand(cmd).then(() => undefined);
        })
        .catch((err) => {
          if (cmdGen !== this.sessionGen || !this.running) return;
          const index = this.optimisticCommands.indexOf(cmd);
          if (index >= 0) {
            this.optimisticCommands.splice(index, 1);
            if (this.optimisticCommands.length > 0) this.rebuildOptimisticDisplay();
            else this.syncAfterWorkerMutation();
            this.catalog.rebuild(this.world.entities);
            this.pruneStaleSelection();
            this.notify(true, false, true);
          }
          console.warn('[GameLoop] Worker command failed — reverted to authoritative state', err);
        });
      return;
    }

    this.applyCommandLocal(cmd);
  }

  private syncAfterWorkerMutation(): void {
    const authoritative = this.workerHost?.getAuthoritativeWorld();
    if (authoritative) this.world = hydrateWorldRuntimeCaches(authoritative);
  }

  private applyCommandLocal(cmd: WorkerCommand): void {
    this.world = applyWorkerCommand(this.world, cmd);
    this.catalog.rebuild(this.world.entities);
    this.pruneStaleSelection();
    this.notify(true, false, true);
  }

  applyAction(mutator: (world: WorldState) => WorldState, cmd?: WorkerCommand): void {
    if (cmd) {
      this.applyCommand(cmd);
      return;
    }
    if (this.workerEnabled && this.workerHost?.isReady()) {
      console.error(
        '[GameLoop] applyAction closure rejected while worker is active — use applyCommand with a typed WorkerCommand',
      );
      return;
    }
    this.applyActionLegacy(mutator);
  }

  private applyActionLegacy(mutator: (world: WorldState) => WorldState): void {
    const next = mutator(this.world);
    if (next !== this.world) {
      this.world = next;
    }
    this.catalog.rebuild(this.world.entities);
    this.workerHost?.syncWorld(this.world).catch(() => {
      // Worker full-world sync is best-effort here; failures surface via the worker fault handler.
    });
    this.pruneStaleSelection();
    this.notify(true);
  }

  mutateWorld(mutator: (world: WorldState) => void): void {
    const prevPaused = this.world.paused;
    const prevSpeed = this.world.speed;
    const uiBefore = this.workerEnabled ? extractUiPatch(this.world) : null;
    const buildingsBefore = this.world.buildings;
    const entitiesBefore = this.world.entities;

    mutator(this.world);

    if (this.workerEnabled && this.workerHost?.isReady()) {
      if (this.world.buildings !== buildingsBefore || this.world.entities !== entitiesBefore) {
        console.warn(
          '[GameLoop] mutateWorld modified simulation entities/buildings — use applyCommand instead',
        );
        this.syncAfterWorkerMutation();
        this.catalog.rebuild(this.world.entities);
      }
      if (this.world.paused !== prevPaused) this.workerHost.setPaused(this.world.paused);
      if (this.world.speed !== prevSpeed) this.workerHost.setSpeed(this.world.speed);
      if (uiBefore && uiPatchChanged(uiBefore, extractUiPatch(this.world))) {
        this.workerHost.patchUiState(extractUiPatch(this.world));
      }
    }
    this.notify(true);
  }

  async exportAuthoritativeWorld(timeoutMs = 10_000): Promise<WorldState> {
    if (this.workerEnabled && this.workerHost?.isReady()) {
      const exportGen = this.sessionGen;
      try {
        this.syncAfterWorkerMutation();
        await Promise.race([
          this.workerHost.whenIdle(),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Worker idle wait timed out')), timeoutMs);
          }),
        ]);
        if (exportGen !== this.sessionGen) return this.world;

        const exported = await Promise.race([
          this.workerHost.exportSave(),
          new Promise<WorldState>((_, reject) => {
            setTimeout(() => reject(new Error('Worker export timed out')), timeoutMs);
          }),
        ]);
        if (exportGen !== this.sessionGen) return this.world;

        this.world = hydrateWorldRuntimeCaches(exported);
        this.catalog.rebuild(this.world.entities);
        return this.world;
      } catch (err) {
        console.warn('[GameLoop] exportSave failed — using main shadow', err);
      }
    }
    return this.world;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    if (this.running) {
      const subscribeGen = this.sessionGen;
      queueMicrotask(() => {
        if (!this.running || subscribeGen !== this.sessionGen || !this.listeners.has(listener)) {
          return;
        }
        listener(this.world, this.view, false, this.catalog);
      });
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = 0;
    this.tickAccumulator = 0;
    if (!this.workerHost && !this.workerBooting) {
      this.scheduleWorkerRecovery();
    }
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    this.sessionGen++;
    if (this.workerRecoveryTimer) {
      clearTimeout(this.workerRecoveryTimer);
      this.workerRecoveryTimer = null;
    }
    this.workerRecoveryInFlight = false;
    this.commandChain = Promise.resolve();
    this.optimisticCommands = [];
    this.deferredWorkerCommands = [];

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    this.listeners.clear();
    clearAllFactionWanderStates();
    this.workerHost?.dispose();
    this.workerHost = null;
    this.workerEnabled = false;
    this.workerBooting = false;
    this.renderSoA = null;
    this.renderMetaBySlot = null;
    this.scentReader = null;
    this.lastPausedSentToWorker = null;
    this.canvasCtx = null;
    this.canvasCtxFor = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.layoutCanvas = null;
    this.layoutSize = { w: 0, h: 0 };
    this.snapshotCache = null;
    this.snapshotKey = '';
  }

  getWorldAndView(): { world: WorldState; view: ViewState } {
    return { world: this.world, view: this.view };
  }

  private ensureCanvasSizeTracking(): void {
    const canvas = this.getCanvas();
    if (!canvas || canvas === this.layoutCanvas) return;
    this.layoutCanvas = canvas;
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.layoutSize = {
        w: Math.floor(entry.contentRect.width),
        h: Math.floor(entry.contentRect.height),
      };
    });
    this.resizeObserver.observe(canvas);
  }

  private snapshotDirtyKey(): string {
    const w = this.world;
    const v = this.view;
    const ghost = v.buildGhost;
    const strip = v.buildStripPreview;

    return [
      w.tick,
      w.paused ? 1 : 0,
      w.season,
      w.floatingTexts.length,
      w.bigNews.length,
      w.deathParticles.length,
      w.pendingRaidEvents?.length ?? 0,
      w.pendingOutgoingRaidEvents?.length ?? 0,
      w.visitorGroups.length,
      w.buildings.length,
      w.entities.length,
      v.camera.x.toFixed(1),
      v.camera.y.toFixed(1),
      v.camera.zoom.toFixed(3),
      v.screenShake.toFixed(1),
      v.selectedEntityId ?? '',
      v.selectedBuildingId ?? '',
      v.hoveredBuildingId ?? '',
      v.buildMode ?? '',
      v.buildRotation ?? 0,
      v.favoriteEntityId ?? '',
      v.highlightedCampKey ?? '',
      v.selectedCampKey ?? '',
      v.showGrid ? 1 : 0,
      v.showPaths ? 1 : 0,
      ghost ? `${ghost.x.toFixed(0)},${ghost.y.toFixed(0)},${ghost.valid ? 1 : 0}` : '',
      strip ? `${strip.segments.length}|${strip.rotation}` : '',
      this.renderSoA ? 'soa' : 'obj',
    ].join('|');
  }

  private frame = (time: number) => {
    if (!this.running) return;

    if (!this.lastFrameTime) this.lastFrameTime = time;
    const dtMs = Math.min(time - this.lastFrameTime, 100);
    this.lastFrameTime = time;

    let tickChanged = false;

    if (!this.world.paused) {
      if (this.workerHost && this.lastPausedSentToWorker !== false) {
        this.workerHost.setPaused(false);
        this.lastPausedSentToWorker = false;
      }
      this.tickAccumulator += dtMs;
      const msPerTick = 1000 / (BASE_TICKS_PER_SECOND * this.world.speed);
      let steps = 0;
      const canvas = this.getCanvas();
      const focus: SimulationFocus | undefined = canvas
        ? computeSimulationFocus(this.view.camera, canvas.offsetWidth, canvas.offsetHeight)
        : undefined;

      if (this.workerBooting) {
        // Hold accumulator until worker is authoritative
      } else if (this.workerEnabled && this.workerHost) {
        const stallMs = Math.max(WORKER_STALL_TIMEOUT_MS, this.workerTickLatencyMs * 4);
        const stalled =
          this.workerHost.hasTickInFlight() &&
          performance.now() - this.lastWorkerActivity > stallMs;

        if (stalled) {
          console.warn(
            `[GameLoop] Worker tick exceeded ${stallMs.toFixed(0)}ms (in-flight=${this.workerHost.getTicksInFlight?.() ?? 'unknown'}, observed=${this.workerTickLatencyMs.toFixed(0)}ms)`,
          );
          this.fallbackFromWorker('Worker tick stalled');
        } else {
          while (
            this.tickAccumulator >= msPerTick &&
            steps < MAX_CATCHUP_STEPS &&
            this.workerHost.canPipelineTick()
          ) {
            if (this.workerHost.requestTick(focus)) {
              this.lastWorkerTickRequest = performance.now();
              this.tickAccumulator -= msPerTick;
              steps++;
            } else {
              break;
            }
          }
          if (this.workerTickChanged) {
            tickChanged = true;
            this.workerTickChanged = false;
          }
        }
      }

      if (!this.workerEnabled && !this.workerBooting) {
        while (this.tickAccumulator >= msPerTick && steps < MAX_CATCHUP_STEPS) {
          gameTick(this.world, focus);
          this.observeDailyBoundary(this.world.tick);

          if (this.world.entityByType !== this.lastCatalogByTypeRef) {
            this.catalog.rebuild(this.world.entities);
            this.lastCatalogByTypeRef = this.world.entityByType;
          }

          this.view = syncScreenShakeFromWorld(this.view, this.world);
          clearScreenShakeImpulse(this.world);
          this.tickAccumulator -= msPerTick;
          steps++;
          tickChanged = true;
        }
        this.renderSoA = null;
        this.renderMetaBySlot = null;
      }
    } else {
      this.tickAccumulator = 0;
      if (this.workerHost && this.lastPausedSentToWorker !== true) {
        this.workerHost.setPaused(true);
        this.lastPausedSentToWorker = true;
      }
    }

    this.view = updateView(this.view, dtMs);
    this.draw();

    const now = performance.now();
    const periodicUi = now - this.lastUiUpdate >= UI_UPDATE_MS;
    if (tickChanged || periodicUi) {
      this.lastUiUpdate = now;
      this.notify(tickChanged, periodicUi);
    }

    this.rafId = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    const canvas = this.getCanvas();
    if (!canvas) return;

    this.ensureCanvasSizeTracking();
    let layoutW = this.layoutSize.w;
    let layoutH = this.layoutSize.h;

    if (layoutW <= 0 || layoutH <= 0) {
      const rect = canvas.getBoundingClientRect();
      layoutW = canvas.offsetWidth || canvas.clientWidth || rect.width;
      layoutH = canvas.offsetHeight || canvas.clientHeight || rect.height;
      this.layoutSize = { w: Math.floor(layoutW), h: Math.floor(layoutH) };
    }
    if (layoutW <= 0 || layoutH <= 0) return;

    if (this.canvasCtxFor !== canvas || !this.canvasCtx) {
      this.canvasCtx = canvas.getContext('2d');
      this.canvasCtxFor = canvas;
    }
    const ctx = this.canvasCtx;
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(layoutW * dpr);
    const targetH = Math.floor(layoutH * dpr);
    if (targetW <= 0 || targetH <= 0) return;

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const dirtyKey = this.snapshotDirtyKey();
    let snapshot = this.snapshotCache;

    if (!snapshot || dirtyKey !== this.snapshotKey) {
      snapshot = buildRenderSnapshot(this.world, this.view, {
        renderSoA: this.renderSoA,
        renderMetaBySlot: this.renderMetaBySlot ?? undefined,
        catalog: this.catalog,
        scentGrid: this.workerEnabled ? null : this.world.scentGrid,
        scentReader: this.scentReader,
      });
      this.snapshotCache = snapshot;
      this.snapshotKey = dirtyKey;
    }

    renderGame(ctx, snapshot, layoutW, layoutH);

    if (this.world.screenShakeImpulse > 0) {
      clearScreenShakeImpulse(this.world);
    }
  }

  private pruneStaleSelection(): void {
    if (
      this.view.selectedBuildingId != null &&
      !resolveBuilding(this.world, this.view.selectedBuildingId)
    ) {
      this.view = { ...this.view, selectedBuildingId: null };
    }

    const alive = (this.view.selectedEntityIds ?? []).filter(
      (id) => resolveEntity(this.world, id) != null,
    );
    const primaryAlive =
      this.view.selectedEntityId != null &&
      resolveEntity(this.world, this.view.selectedEntityId) != null;

    if (alive.length !== (this.view.selectedEntityIds?.length ?? 0) || !primaryAlive) {
      this.view = {
        ...this.view,
        selectedEntityIds: alive,
        selectedEntityId: primaryAlive
          ? this.view.selectedEntityId
          : alive[alive.length - 1] ?? null,
      };
    }
  }

  private notify(tickChanged: boolean, allowPeriodic = false, force = false): void {
    if (this.notifyDepth > 0) return;

    const tick = this.world.tick;
    if (!force && tickChanged && tick === this.lastNotifiedTick) return;

    const changed = force || tickChanged || tick !== this.lastNotifiedTick;
    if (!changed && !allowPeriodic) return;

    if (force || tickChanged || tick !== this.lastNotifiedTick) {
      this.lastNotifiedTick = tick;
    }

    this.notifyDepth++;
    try {
      for (const listener of this.listeners) {
        listener(this.world, this.view, changed, this.catalog);
      }
    } finally {
      this.notifyDepth--;
    }
  }
}
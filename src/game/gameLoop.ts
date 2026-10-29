import type { WorldState } from './gameTypes';
import {
  getPerformanceSnapshot,
  profileEnd,
  profileStart,
  setPerformanceProfilingEnabled,
  type PerformanceSnapshot,
} from './performanceProfiler';
import { gameTick, computeSimulationFocus, type SimulationFocus } from './gameEngine';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './dayCycle';
import { EntityCatalog } from './entityCatalog';
import { renderGame, resetRendererCaches } from './renderer';
import type { SpotlightPresentation } from './renderer/motionInterpolation';
import { getRenderDpr } from './canvasLayer';
import { buildRenderSnapshot, type RenderSnapshot } from './renderSnapshot';
import { patchCatalogKinematicsFromRenderSoA } from './simBuffers/applyKinematics';
import type { EntityRenderMeta } from './simBuffers/entityRenderMeta';
import type { RenderSoAReaderV1 } from './simBuffers/renderSoAReader';
import { clearAllFactionWanderStates } from './factionWander';
import { GameWorkerHost, isGameWorkerEnabled, type WorkerUiPatch } from './simWorker/GameWorkerHost';
import { applySimPrep, extractSimPrep } from './simWorker/simPrep';
import type { WorkerCommand } from './simWorker/commands';
import { applyWorkerCommand } from './simWorker/commands';
import { carryPresentationControls, createOptimisticDisplayWorld, hydrateWorldRuntimeCaches } from './worldRuntimeCaches';
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
 * Real-time tick rate at 1×: one simulation tick per real second.
 */
export const BASE_TICKS_PER_SECOND = 1;

/** React UI publish throttle (ms) for periodic non-tick polls. */
const UI_UPDATE_MS = 250;

const MAX_CATCHUP_STEPS = 12;

function catchUpBudgetFor(speed: number): number {
  const requested = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return Math.min(240, Math.max(MAX_CATCHUP_STEPS, Math.ceil(requested * 2)));
}

/** Only bounded edits may replay on the UI thread while the worker is authoritative. */
function canPreviewWorkerCommand(cmd: WorkerCommand): boolean {
  return cmd.op === 'setVenueSchedule' || (cmd.op === 'assignWorker' && cmd.humanId != null);
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

const WORKER_STALL_TIMEOUT_MS = 10000;
const WORKER_EXPORT_MARGIN_MS = 5000;
const WORKER_STALL_CEILING_MS = 15000;
const WORKER_RECOVERY_INITIAL_DELAY_MS = 2000;
const WORKER_RECOVERY_MAX_DELAY_MS = 30000;
const WORKER_RECOVERY_MAX_FAILURES = 3;

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
    autoSave: world.autoSave,
    nextFloatingTextId: world.nextFloatingTextId,
    dismissedBigNewsIds: world.dismissedBigNewsIds ? [...world.dismissedBigNewsIds] : undefined,
    dismissedNotificationIds: world.dismissedNotificationIds
      ? [...world.dismissedNotificationIds]
      : undefined,
    dismissedActiveEventIds: world.dismissedActiveEventIds
      ? [...world.dismissedActiveEventIds]
      : undefined,
    tutorialSeen: world.tutorialSeen ? [...world.tutorialSeen] : undefined,
  };
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
    idsPatchChanged(before.dismissedBigNewsIds, after.dismissedBigNewsIds) ||
    idsPatchChanged(before.dismissedNotificationIds, after.dismissedNotificationIds) ||
    idsPatchChanged(before.dismissedActiveEventIds, after.dismissedActiveEventIds) ||
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
  private tickFraction = 1;
  private lastWorkerPresentation: { tick: number; at: number } | null = null;
  private lastFrameTime = 0;
  private lastUiUpdate = 0;
  private diagTicks = 0;
  private diagSince = 0;
  private diagFrames = 0;
  private diagFrameMs = 0;
  private diagFrameMaxMs = 0;
  private diagHiddenFrames = 0;
  private lastNotifiedTick = -1;
  private listeners = new Set<SessionListener>();
  private getCanvas: () => HTMLCanvasElement | null;
  private workerHost: GameWorkerHost | null = null;
  private workerEnabled = false;
  private performanceProfilingEnabled = false;
  private lastWorkerPerformanceSnapshot: PerformanceSnapshot | null = null;
  private workerBooting = false;
  private workerTickChanged = false;
  private lastWorkerActivity = 0;
  private lastWorkerTickRequest = 0;
  private lastDailyBoundaryTick = 0;
  private workerTickLatencyMs = 0;
  private exportDegraded = false;
  private saveExportPending = false;
  private workerRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private workerRecoveryDelayMs = WORKER_RECOVERY_INITIAL_DELAY_MS;
  private workerRecoveryInFlight = false;
  private workerRecoveryFailures = 0;
  private workerRecoveryDisabled = false;
  private spotlightPresentation: SpotlightPresentation | null = null;
  private renderSoA: RenderSoAReaderV1 | null = null;
  private renderMetaBySlot: EntityRenderMeta[] | null = null;
  private scentReader: ScentGridReader | null = null;
  private sessionGen = 0;
  private notifyDepth = 0;
  private lastPausedSentToWorker: boolean | null = null;
  private commandChain: Promise<void> = Promise.resolve();
  private workerCommandEpoch = 0;
  private optimisticCommands: WorkerCommand[] = [];
  private deferredWorkerCommands: Array<{ cmd: WorkerCommand; sessionGen: number }> = [];
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private canvasCtxFor: HTMLCanvasElement | null = null;
  private layoutSize = { w: 0, h: 0 };
  private layoutCanvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private snapshotCache: RenderSnapshot | null = null;
  private snapshotKey = '';
  private fallbackTickFailureReported = false;

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
            this.scheduleWorkerRecovery();
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
          this.flushDeferredWorkerCommands();
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
      this.workerRecoveryDisabled ||
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
      this.workerRecoveryDisabled ||
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
        this.workerRecoveryFailures = 0;
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
          this.workerRecoveryFailures++;
          if (this.workerRecoveryFailures >= WORKER_RECOVERY_MAX_FAILURES) {
            this.workerRecoveryDisabled = true;
            console.error('[GameLoop] Worker recovery failed repeatedly; continuing with bounded main-thread simulation', err);
            this.flushDeferredWorkerCommands();
          } else {
            console.warn('[GameLoop] Automatic worker recovery failed; retrying', err);
            this.scheduleWorkerRecovery();
          }
        }
      });
  }

  private registerWorkerHandlers(_initGen?: number): void {
    const host = this.workerHost;
    if (!host) return;

    if (this.performanceProfilingEnabled) host.setProfilingEnabled(true);

    host.setTickResultHandler((nextWorld, _delta, render, changed) => {
      // Check of de host nog steeds de actieve host is (i.p.v. sessionGen blokkade)
      if (this.workerHost !== host) return;
      this.lastWorkerActivity = performance.now();
      if (this.lastWorkerPresentation?.tick !== nextWorld.tick) {
        this.lastWorkerPresentation = { tick: nextWorld.tick, at: this.lastWorkerActivity };
      }
      this.lastWorkerPerformanceSnapshot = host.getPerformanceSnapshot() ?? this.lastWorkerPerformanceSnapshot;

      const completedTickLatency = host.getLastCompletedTickLatencyMs();
      if (completedTickLatency != null) {
        this.workerTickLatencyMs = this.workerTickLatencyMs * 0.7 + completedTickLatency * 0.3;
      }

      this.observeDailyBoundary(nextWorld.tick);
      if (this.optimisticCommands.length === 0) {
        this.world = nextWorld;
        const rebuildStart = profileStart();
        this.catalog.rebuild(this.world.entities);
        profileEnd('main.catalogRebuild', rebuildStart);
      }

      if (render) {
        this.renderSoA = render.reader;
        this.renderMetaBySlot = render.metaBySlot ?? null;
        this.scentReader = render.scentReader;
        const kinematicsStart = profileStart();
        patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader, render.metaBySlot);
        profileEnd('main.patchRenderKinematics', kinematicsStart);
      }

      this.view = syncScreenShakeFromWorld(this.view, this.world);
      clearScreenShakeImpulse(this.world);
      this.workerTickChanged = changed;
    });

    host.setWorkerFaultHandler((source, message) => {
      if (this.workerHost !== host) return;
      this.fallbackFromWorker(`Worker ${source} error: ${message}`, source === 'command');
    });

    host.setCommandResultHandler((world, _delta, render, ok, reason) => {
      if (this.workerHost !== host) return;
      this.lastWorkerActivity = performance.now();

      const hadOptimistic = this.optimisticCommands.length > 0;
      if (hadOptimistic) this.optimisticCommands.shift();

      this.world = world;
      this.invalidateRenderSnapshot();
      if (this.optimisticCommands.length > 0) this.rebuildOptimisticDisplay();

      if (render) {
        this.renderSoA = render.reader;
        this.renderMetaBySlot = render.metaBySlot ?? null;
        this.scentReader = render.scentReader;
        const kinematicsStart = profileStart();
        patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader, render.metaBySlot);
        profileEnd('main.patchRenderKinematics', kinematicsStart);
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

  private fallbackFromWorker(reason: string, discardUnconfirmedCommand = false): void {
    if (!this.workerEnabled && !this.workerBooting) return;
    this.lastWorkerPresentation = null;
    console.warn(`[GameLoop] ${reason} — ${isGameWorkerEnabled() ? 'recovering simulation worker' : 'falling back to main-thread ticks'}`);

    const retryCommands = isGameWorkerEnabled()
      ? this.optimisticCommands.slice(discardUnconfirmedCommand ? 1 : 0) : [];
    if (discardUnconfirmedCommand && this.optimisticCommands.length > 0) {
      console.error('[GameLoop] Unconfirmed command not replayed after worker fault:', this.optimisticCommands[0].op);
    }
    this.workerCommandEpoch++;
    this.commandChain = Promise.resolve();
    this.optimisticCommands = [];
    this.deferredWorkerCommands.unshift(...retryCommands.map((cmd) => ({ cmd, sessionGen: this.sessionGen })));
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
    this.flushDeferredWorkerCommands();
  }

  async setPerformanceProfiling(enabled: boolean): Promise<void> {
    if (enabled) {
      this.performanceProfilingEnabled = true;
      this.lastWorkerPerformanceSnapshot = null;
      setPerformanceProfilingEnabled(true);
      this.workerHost?.setProfilingEnabled(true);
      return;
    }

    const host = this.workerEnabled && this.workerHost?.isReady() ? this.workerHost : null;
    if (host) {
      const finalSnapshot = await host.stopProfiling();
      if (this.workerHost !== host) throw new Error('Simulation worker changed during profiler stop');
      this.lastWorkerPerformanceSnapshot = finalSnapshot;
    }
    this.performanceProfilingEnabled = false;
    setPerformanceProfilingEnabled(false);
  }

  getPerformanceProfiling(): {
    enabled: boolean;
    main: PerformanceSnapshot;
    worker: PerformanceSnapshot | null;
  } {
    return {
      enabled: this.performanceProfilingEnabled,
      main: getPerformanceSnapshot(),
      // After Stop, preserve the final acknowledged sample instead of reading
      // newer live host snapshots (which may be replaced during worker recovery).
      worker: this.performanceProfilingEnabled
        ? (this.workerHost?.getPerformanceSnapshot() ?? this.lastWorkerPerformanceSnapshot)
        : (this.lastWorkerPerformanceSnapshot ?? this.workerHost?.getPerformanceSnapshot() ?? null),
    };
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

  lastExportWasDegraded(): boolean {
    return this.exportDegraded;
  }

  getView(): ViewState {
    return this.view;
  }

  getEntityCatalog(): EntityCatalog {
    return this.catalog;
  }

  private adoptWorldSession(world: WorldState, view: ViewState): void {
    this.spotlightPresentation = null;
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
    this.lastWorkerPresentation = null;
    this.invalidateRenderSnapshot();
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
    const host = this.workerHost;
    if (!host) {
      afterImport?.();
      return;
    }
    const sessionGen = this.sessionGen;
    this.commandChain = this.commandChain
      .then(async () => {
          await host.whenReady();
          if (sessionGen !== this.sessionGen || !this.running || this.workerHost !== host || !host.isReady()) return;
          await host.whenIdle();
          if (sessionGen !== this.sessionGen || !this.running || this.workerHost !== host || !host.isReady()) return;

          this.renderSoA = null;
          this.renderMetaBySlot = null;
          this.scentReader = null;
          await host.importSave(world);

          if (sessionGen !== this.sessionGen || this.workerHost !== host) return;
          this.workerBooting = false;
          this.flushDeferredWorkerCommands();
          afterImport?.();
      })
      .catch((err) => {
        if (sessionGen !== this.sessionGen || this.workerHost !== host) return;
        console.warn('[GameLoop] Worker importSave failed', err);
        this.fallbackFromWorker('Worker importSave failed');
      });
  }

  /** Visual-only character projection; never alters worker, entity or simulation positions. */
  setSpotlightPresentation(presentation: SpotlightPresentation | null): void {
    this.spotlightPresentation = presentation;
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

    const previews = this.optimisticCommands.filter(canPreviewWorkerCommand);
    let display = previews.length > 0 ? createOptimisticDisplayWorld(authoritative) : authoritative;
    carryPresentationControls(display, this.world);

    for (const command of previews) {
      try {
        display = applyWorkerCommand(display, command, 'owned');
      } catch (err) {
        console.warn('[GameLoop] Optimistic command display failed; awaiting worker result', err);
        break;
      }
    }
    this.world = display;
    this.invalidateRenderSnapshot();
  }

  applyCommand(cmd: WorkerCommand): void {
    if ((this.workerBooting && this.workerHost) || this.workerRecoveryTimer !== null || this.workerRecoveryInFlight) {
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
      const commandEpoch = this.workerCommandEpoch;
      this.commandChain = this.commandChain
        .then(() => {
          const host = this.workerHost;
          if (cmdGen !== this.sessionGen || commandEpoch !== this.workerCommandEpoch || !this.running || !host?.isReady()) return;
          return host.whenIdle().then(() => {
            if (cmdGen !== this.sessionGen || commandEpoch !== this.workerCommandEpoch || !this.running || this.workerHost !== host || !host.isReady()) return;
            return host.sendCommand(cmd).then(() => undefined);
          });
        })
        .catch((err) => {
          if (cmdGen !== this.sessionGen || commandEpoch !== this.workerCommandEpoch || !this.running) return;
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
    if (authoritative) {
      this.world = hydrateWorldRuntimeCaches(authoritative);
      this.invalidateRenderSnapshot();
    }
  }

  private applyCommandLocal(cmd: WorkerCommand): void {
    this.world = applyWorkerCommand(this.world, cmd);
    this.invalidateRenderSnapshot();
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
    this.invalidateRenderSnapshot();
    this.catalog.rebuild(this.world.entities);
    this.workerHost?.syncWorld(this.world).catch(() => {});
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
    this.invalidateRenderSnapshot();

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
    this.notify(true, false, true);
  }

  async exportAuthoritativeWorld(timeoutMs = this.workerExportBudgetMs()): Promise<WorldState> {
    const host = this.workerHost;
    if (!(this.workerEnabled && host?.isReady())) {
      this.exportDegraded = this.workerBooting || this.workerRecoveryInFlight
        || this.workerRecoveryTimer !== null || this.optimisticCommands.length > 0
        || this.deferredWorkerCommands.length > 0;
      return this.world;
    }

    const exportGen = this.sessionGen;
    this.saveExportPending = true;
    try {
      await Promise.race([
        this.commandChain.then(() => host.whenIdle()),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Worker idle wait timed out')), timeoutMs);
        }),
      ]);
      if (exportGen !== this.sessionGen || this.workerHost !== host || !host.isReady()) {
        this.exportDegraded = true;
        return this.world;
      }

      const exported = await Promise.race([
        host.exportSave(timeoutMs),
        new Promise<WorldState>((_, reject) => {
          setTimeout(() => reject(new Error('Worker export timed out')), timeoutMs);
        }),
      ]);
      if (exportGen !== this.sessionGen || this.workerHost !== host) {
        this.exportDegraded = true;
        return this.world;
      }

      this.exportDegraded = false;
      return hydrateWorldRuntimeCaches(exported);
    } catch (err) {
      console.warn('[GameLoop] exportSave failed — using main shadow', err);
      this.exportDegraded = true;
    } finally {
      this.saveExportPending = false;
    }
    return this.world;
  }

  private workerStallThresholdMs(): number {
    return Math.min(
      WORKER_STALL_CEILING_MS,
      Math.max(WORKER_STALL_TIMEOUT_MS, this.workerTickLatencyMs * 4),
    );
  }

  private workerExportBudgetMs(): number {
    return this.workerStallThresholdMs() + WORKER_EXPORT_MARGIN_MS;
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
    this.tickFraction = 1;
    this.lastWorkerPresentation = null;
    if (!this.workerHost && !this.workerBooting) {
      this.scheduleWorkerRecovery();
    }
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.performanceProfilingEnabled) {
      this.performanceProfilingEnabled = false;
      setPerformanceProfilingEnabled(false);
      this.workerHost?.setProfilingEnabled(false);
    }
    this.running = false;
    this.sessionGen++;
    this.lastWorkerPresentation = null;
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
      (v.selectedEntityIds ?? []).join(','),
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
      strip?.segments.length ? `${strip.segments.length}|${strip.rotation}|${strip.segments[0].x},${strip.segments[0].y}|${strip.segments[strip.segments.length - 1].x},${strip.segments[strip.segments.length - 1].y}|${strip.segments[0].valid ? 1 : 0}` : '',
      this.renderSoA ? 'soa' : 'obj',
    ].join('|');
  }

  private frame = (time: number) => {
    try {
      this.frameBody(time);
    } catch (error) {
      console.error('[GameLoop] frame failed — continuing', error);
    } finally {
      this.rafId = requestAnimationFrame(this.frame);
    }
  };

  private frameBody(time: number): void {
    if (!this.running) return;

    if (!this.lastFrameTime) this.lastFrameTime = time;
    const rawDtMs = time - this.lastFrameTime;
    const dtMs = Math.min(rawDtMs, 100);
    this.lastFrameTime = time;

    let tickChanged = false;
    let ticksThisFrame = 0;

    if (!this.world.paused) {
      if (this.workerHost && this.lastPausedSentToWorker !== false) {
        this.workerHost.setPaused(false);
        this.lastPausedSentToWorker = false;
      }
      const msPerTick = 1000 / (BASE_TICKS_PER_SECOND * this.world.speed);
      // Never replay an unbounded backlog after a slow worker tick or a stalled tab.
      // Dropping overdue simulation time keeps the interface responsive instead of
      // attempting hundreds of catch-up ticks on the main thread.
      this.tickAccumulator = Math.min(this.tickAccumulator + dtMs, msPerTick * 4);
      let steps = 0;
      const catchUpBudget = catchUpBudgetFor(this.world.speed);
      const canvas = this.getCanvas();
      const focus: SimulationFocus | undefined = canvas
        ? computeSimulationFocus(this.view.camera, canvas.offsetWidth, canvas.offsetHeight)
        : undefined;

      if (this.workerBooting) {
        // Hold accumulator until worker is authoritative
      } else if (this.workerEnabled && this.workerHost) {
        const stallMs = this.workerStallThresholdMs();
        const silenceMs =
          performance.now() - Math.max(this.lastWorkerActivity, this.lastWorkerTickRequest);
        const stalled = this.workerHost.hasTickInFlight() && silenceMs > stallMs;

        if (stalled) {
          console.warn(
            `[GameLoop] Worker silent ${silenceMs.toFixed(0)}ms with ${this.workerHost.getTicksInFlight?.() ?? 'unknown'} tick(s) in flight (threshold ${stallMs.toFixed(0)}ms, last measured tick latency ${this.workerTickLatencyMs.toFixed(0)}ms, command in flight=${this.workerHost.hasCommandInFlight?.() ? 'yes' : 'no'}, hidden=${pageHidden()})`,
          );
          this.fallbackFromWorker('Worker tick stalled');
        } else {
          while (
            this.tickAccumulator >= msPerTick &&
            steps < catchUpBudget
            && this.optimisticCommands.length === 0
            && !this.saveExportPending
            && this.workerHost.canPipelineTick()
          ) {
            if (this.workerHost.requestTick(focus)) {
              this.lastWorkerTickRequest = performance.now();
              this.tickAccumulator -= msPerTick;
              steps++;
            } else {
              break;
            }
          }
          ticksThisFrame = steps;
          if (this.workerTickChanged) {
            tickChanged = true;
            this.workerTickChanged = false;
          }
        }
      }

      if (!this.workerEnabled && !this.workerBooting && this.workerRecoveryTimer === null && !this.workerRecoveryInFlight) {
        // Worker recovery holds the simulation; unsupported runtimes retain bounded local ticks.
        while (this.tickAccumulator >= msPerTick && steps < 1) {
          const advanced = this.stepFallbackTick(focus);
          this.tickAccumulator -= msPerTick;
          if (!advanced) break;

          this.observeDailyBoundary(this.world.tick);

          if (this.world.entityByType !== this.lastCatalogByTypeRef) {
            this.catalog.rebuild(this.world.entities);
            this.lastCatalogByTypeRef = this.world.entityByType;
          }

          this.view = syncScreenShakeFromWorld(this.view, this.world);
          clearScreenShakeImpulse(this.world);
          steps++;
          tickChanged = true;
        }
        this.renderSoA = null;
        this.renderMetaBySlot = null;
        ticksThisFrame = steps;
      }
      // Worker motion follows acknowledged ticks, not unconfirmed tick requests.
      this.tickFraction = this.workerEnabled
        ? this.lastWorkerPresentation == null ? 1
          : Math.min(1, Math.max(0, (time - this.lastWorkerPresentation.at) / msPerTick))
        : Math.min(1, this.tickAccumulator / msPerTick);
    } else {
      this.tickAccumulator = 0;
      this.tickFraction = 1;
      this.lastWorkerPresentation = null;
      if (this.workerHost && this.lastPausedSentToWorker !== true) {
        this.workerHost.setPaused(true);
        this.lastPausedSentToWorker = true;
      }
    }

    this.view = updateView(this.view, dtMs);
    const drawStart = profileStart();
    this.draw();
    profileEnd('main.gameLoopDraw', drawStart);

    if (this.world.speed > 1 && !this.world.paused) {
      this.diagTicks += ticksThisFrame;
      this.diagFrames += 1;
      this.diagFrameMs += rawDtMs;
      if (rawDtMs > this.diagFrameMaxMs) this.diagFrameMaxMs = rawDtMs;
      if (pageHidden()) this.diagHiddenFrames += 1;
      const nowMs = performance.now();
      if (this.diagSince === 0) this.diagSince = nowMs;
      const elapsed = nowMs - this.diagSince;
      if (elapsed >= 3000) {
        const target = BASE_TICKS_PER_SECOND * this.world.speed;
        const achieved = this.diagTicks / (elapsed / 1000);
        const msPerTick = 1000 / target;
        const inFlight = this.workerHost?.getTicksInFlight?.() ?? 0;
        const commandInFlight = this.workerHost?.hasCommandInFlight?.() ?? false;
        const silenceMs = this.lastWorkerActivity > 0 ? nowMs - this.lastWorkerActivity : -1;
        console.log(
          `[SpeedDiag] speed=${this.world.speed}x  achieved=${achieved.toFixed(1)} ticks/s  target=${target}  ratio=${(achieved / target).toFixed(2)}  fps=${(this.diagFrames / (elapsed / 1000)).toFixed(1)}  frameMs=${(this.diagFrameMs / this.diagFrames).toFixed(1)}  frameMax=${this.diagFrameMaxMs.toFixed(0)}  msPerTick=${msPerTick.toFixed(1)}  inv=${inFlight}  cmd=${commandInFlight ? 1 : 0}  debt=${(this.tickAccumulator / msPerTick).toFixed(1)}ticks  silentMs=${silenceMs.toFixed(0)}  hidden=${this.diagHiddenFrames}/${this.diagFrames}`,
        );
        this.diagTicks = 0;
        this.diagFrames = 0;
        this.diagFrameMs = 0;
        this.diagFrameMaxMs = 0;
        this.diagHiddenFrames = 0;
        this.diagSince = nowMs;
      }
    } else if (this.diagSince !== 0) {
      this.diagTicks = 0;
      this.diagFrames = 0;
      this.diagFrameMs = 0;
      this.diagFrameMaxMs = 0;
      this.diagHiddenFrames = 0;
      this.diagSince = 0;
    }

    const now = performance.now();
    const periodicUi = now - this.lastUiUpdate >= UI_UPDATE_MS;
    if (tickChanged || periodicUi) {
      this.lastUiUpdate = now;
      const notifyStart = profileStart();
      this.notify(tickChanged, periodicUi);
      profileEnd('main.notifyListeners', notifyStart);
    }
  }

  private stepFallbackTick(focus: SimulationFocus | undefined): boolean {
    const prepBackup = extractSimPrep(this.world);
    try {
      gameTick(this.world, focus);
    } catch (err) {
      applySimPrep(this.world, prepBackup);
      if (!this.fallbackTickFailureReported) {
        this.fallbackTickFailureReported = true;
        console.warn(
          '[GameLoop] Main-thread tick failed — rolled back to the pre-tick world',
          err,
        );
      }
      return false;
    }
    this.fallbackTickFailureReported = false;
    return true;
  }

  private invalidateRenderSnapshot(): void {
    this.snapshotCache = null;
    this.snapshotKey = '';
  }

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

    const dpr = getRenderDpr();
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

    renderGame(ctx, snapshot, layoutW, layoutH, this.tickFraction, this.spotlightPresentation);

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
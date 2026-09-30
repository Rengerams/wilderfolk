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
 * Real-time tick rate at 1×: **one simulation tick per real second**, so an in-game hour is 3 real
 * seconds (`TICKS_PER_HOUR = 3`) and an in-game day is **72 real seconds**
 * (`TICKS_PER_DAY = 72 = HOURS_PER_DAY (24) × TICKS_PER_HOUR (3)`; 0.5× ≈ 144 s, 2× ≈ 36 s,
 * 10× ≈ 7.2 s, and a 360-day year ≈ 7.2 h at 1×).
 *
 * Latest owner pacing decision: keep the time *grid* at 24 h × 3 ticks = 72 ticks/day and set the
 * *pace* to 72 s/day. This supersedes the earlier "slower baseline pacing" value of 1.5 (48 s/day) —
 * which a damaged revision had silently reverted to 3 (24 s/day), the regression recorded in
 * `BUG_REPORTS/2026-09-16-baseline-pacing-reverted-to-24s-day.md`.
 *
 * Exported so the pace is pinned by `tests/gameLoop.test.ts` instead of living in
 * comments: that test also fails if the harness copies of this rate (`scripts/test.ts`,
 * `scripts/perf-all.ts`, `scripts/probe-day-budget.mts`) drift from it.
 */
export const BASE_TICKS_PER_SECOND = 1;

/** React UI publish throttle (ms) for periodic non-tick polls. */
const UI_UPDATE_MS = 250;

const MAX_CATCHUP_STEPS = 12;

/**
 * Catch-up ticks allowed **per frame** at 1× — raised by the speed multiplier.
 *
 * This is a spiral-of-death guard: a frame that arrived late runs extra ticks to catch up, that work
 * makes the frame longer, the next frame has more backlog, and without a bound the loop locks up
 * instead of degrading. The cap trades a little lost simulated time for a loop that always catches up.
 *
 * **It must scale with `speed`, and used to be a fixed 12.** The budget is per frame, so the ticks a
 * second the loop can sustain is `fps × budget`; at 60 fps a fixed 12 caps the whole simulation at
 * **720 ticks/s = 7.2×**, and at 40 fps at 4.8×. So 10× silently delivered ~7× and a frame-rate drop
 * made it worse — the owner measured 9 s and 12 s per in-game day where 10× must give **7.2 s**
 * (72 s ÷ 10). Scaling the budget by `speed` removes that ceiling for the legitimate case while
 * keeping the guard: a backgrounded tab still discards its backlog rather than trying to replay it.
 */
function catchUpBudgetFor(speed: number): number {
  const requested = Number.isFinite(speed) && speed > 0 ? speed : 1;
  // Enough for the requested rate at a conservative 30 fps, floored at the historical 12 so 1×
  // behaviour is unchanged, and bounded so a pathological speed cannot lock the loop.
  return Math.min(240, Math.max(MAX_CATCHUP_STEPS, Math.ceil(requested * 2)));
}

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

/**
 * The player-authored slice of UI state to send to the worker.
 *
 * `bigNews`, `floatingTexts` and `activeEvent` are deliberately **not** here: the tick authors them on
 * the worker side and `applyWorkerUiPatch` never adopted them, so including them cloned the news list
 * and every live floating text into every patch for nothing, and a stale patch could have rewound
 * events the player had not seen (2026-09-20 audit, P-5; `BUG_REPORTS/2026-09-16-ui-patch-rewinds-worker-authored-big-news.md`).
 */
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
  private lastFrameTime = 0;
  private lastUiUpdate = 0;
  /**
   * Speed diagnostic — ticks actually executed, sampled every few seconds.
   *
   * Added because the high speed multipliers visibly under-deliver and neither of us could settle why
   * by reasoning: at 10× a day must take **7.2 s** (72 s ÷ 10), the owner measured 9 s and 12 s, and
   * reported their frame rate "is different each time". Two candidate causes need different fixes —
   * the per-frame catch-up budget (`catchUpBudgetFor`, ceiling `fps × budget`), or the raw cost of one
   * tick (a tick must finish inside `msPerTick`, 10 ms at 10×). This counter separates them by
   * comparing achieved ticks/second against `BASE_TICKS_PER_SECOND × speed`.
   *
   * Off at 1× so normal play pays nothing.
   */
  private diagTicks = 0;
  private diagSince = 0;
  private diagFrames = 0;
  private diagFrameMs = 0;
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
            // A session swap during boot used to abandon the worker permanently: the loop ran on
            // the main thread for the rest of the session with no recovery attempt
            // (worker-boundary audit F10). Schedule the same recovery every other failure path uses.
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
          this.flushDeferredWorkerCommands();
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
      this.invalidateRenderSnapshot();
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
    this.flushDeferredWorkerCommands();
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
        try {
          // Wait for the worker handshake through the host, never by polling `workerBooting`:
          // this chain is the only code that clears that flag for a session swap, so waiting on it
          // deadlocked the loaded village forever — no import posted, no ticks on either path and
          // every player command deferred unboundedly
          // (`BUG_REPORTS/2026-09-16-loading-a-save-freezes-the-sim-worker.md`).
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
        } finally {
          // The flag always comes down for the session that raised it — including a stop mid-import,
          // where the old code left it raised forever.
          if (sessionGen === this.sessionGen && this.workerHost === host) this.workerBooting = false;
        }
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

    let display = createOptimisticDisplayWorld(authoritative);
    carryPresentationControls(display, this.world);

    for (let i = 0; i < this.optimisticCommands.length; i++) {
      try {
        display = applyWorkerCommand(display, this.optimisticCommands[i]);
      } catch (err) {
        console.warn('[GameLoop] Optimistic command display failed; awaiting worker result', err);
        break;
      }
    }
    this.world = display;
    this.invalidateRenderSnapshot();
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
    // Forced: `notify` dedupes on the tick, and a player-authored mutation (pause above all) does
    // not advance it — so the unforced call was swallowed while paused and the header kept reading
    // "Pause simulation" with no ⏸ banner, because nothing asked React to repaint (P6 browser pass
    // finding, 2026-09-20). Elsewhere this shape is already the norm for out-of-tick state changes.
    this.notify(true, false, true);
  }

  /**
   * Read the **authoritative** world out of the worker, for a save to persist.
   *
   * This is a read, not a switch of authority. It deliberately does **not** assign the result to
   * `this.world`: `workerHost.exportSave()` resolves to a fresh clone of the worker's world, and
   * adopting that clone as the display world split the two apart for the rest of the session —
   * `GameWorkerHost.getAuthoritativeWorld()` keeps returning its own long-lived `worldRef`, so every
   * later tick result replaced the display from `worldRef` again regardless. In the window between,
   * the clone carried the worker's `paused` / `speed` / dismissed-id sets while `applySimTickDelta`
   * never writes those fields, and `mutateWorld` forwards a control to the worker only when it
   * changes — so a player-authored control made just before a save could be reverted on screen and
   * could not be re-sent (2026-09-21 audit, D-2; `tests/gameLoop.test.ts`).
   *
   * The returned world is hydrated so the caller can read it (and hand it to the save writer)
   * without hitting missing runtime caches. `this.world` keeps whatever the display left it as.
   */
  async exportAuthoritativeWorld(timeoutMs = 10_000): Promise<WorldState> {
    if (this.workerEnabled && this.workerHost?.isReady()) {
      const exportGen = this.sessionGen;
      try {
        // Deliberately **no** `syncAfterWorkerMutation()` here. It adopts the host's authoritative
        // world into the display, which is right for the command-failure paths that call it — they
        // have just been told the display is wrong — and wrong for a read: it advances the display to
        // the authority (dropping any optimistic command the player is still waiting to see) as a side
        // effect of pressing Save. The export needs no such nudge, because `whenIdle()` below already
        // waits for every tick and command to settle, and the worker packs the clone from its own
        // world regardless of what main thinks.
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

        return hydrateWorldRuntimeCaches(exported);
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

    // Listeners are deliberately NOT cleared: `stop()` stops the frame loop, and a later
    // `start()` on the same instance must still have the UI subscribed — clearing them made a
    // stopped-then-started loop silently frozen (worker-boundary audit F8.1). The set belongs to
    // the instance, so dropping the loop drops the listeners with it.
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
      strip ? `${strip.segments.length}|${strip.rotation}` : '',
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
    const dtMs = Math.min(time - this.lastFrameTime, 100);
    this.lastFrameTime = time;

    let tickChanged = false;
    /** Ticks the simulation actually ran this frame — the only quantity that measures sim rate. */
    let ticksThisFrame = 0;

    if (!this.world.paused) {
      if (this.workerHost && this.lastPausedSentToWorker !== false) {
        this.workerHost.setPaused(false);
        this.lastPausedSentToWorker = false;
      }
      this.tickAccumulator += dtMs;
      const msPerTick = 1000 / (BASE_TICKS_PER_SECOND * this.world.speed);
      let steps = 0;
      // The per-frame catch-up budget, scaled by speed (see `catchUpBudgetFor`).
      const catchUpBudget = catchUpBudgetFor(this.world.speed);
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
            steps < catchUpBudget
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

      if (!this.workerEnabled && !this.workerBooting) {
        while (this.tickAccumulator >= msPerTick && steps < catchUpBudget) {
          const advanced = this.stepFallbackTick(focus);
          // Consume the attempted step either way. A tick that threw left the world at its
          // pre-tick state, so keeping its time would only re-attempt the same slice — and the
          // remaining catch-up budget with it — on the very next frame.
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
    } else {
      this.tickAccumulator = 0;
      if (this.workerHost && this.lastPausedSentToWorker !== true) {
        this.workerHost.setPaused(true);
        this.lastPausedSentToWorker = true;
      }
    }

    this.view = updateView(this.view, dtMs);
    this.draw();

    // Speed diagnostic — see `diagTicks`. Reports achieved vs target ticks/second and frame cost, so
    // "10x is not 10x" can be attributed to the catch-up budget or to tick cost instead of guessed at.
    if (this.world.speed > 1 && !this.world.paused) {
          this.diagTicks += ticksThisFrame;
      this.diagFrames += 1;
      this.diagFrameMs += dtMs;
      const nowMs = performance.now();
      if (this.diagSince === 0) this.diagSince = nowMs;
      const elapsed = nowMs - this.diagSince;
      if (elapsed >= 3000) {
        const target = BASE_TICKS_PER_SECOND * this.world.speed;
        const achieved = this.diagTicks / (elapsed / 1000);
        console.log(
          `[SpeedDiag] speed=${this.world.speed}x  achieved=${achieved.toFixed(0)} ticks/s  target=${target}  ratio=${(achieved / target).toFixed(2)}  fps=${(this.diagFrames / (elapsed / 1000)).toFixed(0)}  frameMs=${(this.diagFrameMs / this.diagFrames).toFixed(1)}  msPerTick=${(1000 / target).toFixed(1)}`,
        );
        this.diagTicks = 0;
        this.diagFrames = 0;
        this.diagFrameMs = 0;
        this.diagSince = nowMs;
      }
    } else if (this.diagSince !== 0) {
      this.diagTicks = 0;
      this.diagFrames = 0;
      this.diagFrameMs = 0;
      this.diagSince = 0;
    }

    const now = performance.now();
    const periodicUi = now - this.lastUiUpdate >= UI_UPDATE_MS;
    if (tickChanged || periodicUi) {
      this.lastUiUpdate = now;
      this.notify(tickChanged, periodicUi);
    }
  }

  /**
   * Run one main-thread tick under the worker's rollback contract.
   *
   * The worker snapshots the mutable sim slices before its tick and puts them back when `gameTick`
   * throws (`gameWorker.ts:307`, `:346-349`). The fallback had no such guard, and a throw is not
   * harmless there: `gameTick` advances `state.tick` and runs all four layers *before* its own
   * invariant check, so each failed frame left one more partially-applied tick in the world — and,
   * because the throw escaped `frameBody`, it also skipped that frame's draw and UI notify, once per
   * frame, forever (P-3). The snapshot/restore pair is the same one that path uses, so both sides
   * now fail identically.
   *
   * Returns `true` when the tick was applied, `false` when it was rolled back.
   */
  private stepFallbackTick(focus: SimulationFocus | undefined): boolean {
    const prepBackup = extractSimPrep(this.world);
    try {
      gameTick(this.world, focus);
    } catch (err) {
      applySimPrep(this.world, prepBackup);
      // Reported once per failing run, not once per frame: the frame-level handler used to log
      // every one of these, which is 60 identical stack traces a second.
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

  /**
   * Drop the cached render snapshot after a non-tick world change.
   *
   * `snapshotDirtyKey()` tracks `w.tick` and `w.buildings.length` for buildings, while the snapshot
   * holds `world.buildings` **by reference** (`renderSnapshot.ts:117`). A repair, upgrade or recipe
   * command changes neither, so while paused the cached snapshot kept pointing at the pre-command
   * array and the damage bar did not move until something unrelated changed the key (P-4).
   * Invalidating on every out-of-tick world change is the honest statement — "the world object
   * changed, rebuild" — and costs nothing per frame, unlike folding a revision counter into the key.
   */
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

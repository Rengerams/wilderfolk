import type { WorldState } from './gameTypes';
import { gameTick, computeSimulationFocus, type SimulationFocus } from './gameEngine';
import { EntityCatalog } from './entityCatalog';
import { renderGame, resetRendererCaches } from './rendererLoader';
import { buildRenderSnapshot } from './renderSnapshot';
import { patchCatalogKinematicsFromRenderSoA } from './simBuffers/applyKinematics';
import type { EntityRenderMeta } from './simBuffers/entityRenderMeta';
import type { RenderSoAReaderV1 } from './simBuffers/renderSoAReader';

import { clearAllFactionWanderStates } from './factionWander';
import { GameWorkerHost, isGameWorkerEnabled, type WorkerUiPatch } from './simWorker/GameWorkerHost';
import type { WorkerCommand } from './simWorker/commands';
import { applyWorkerCommand } from './simWorker/commands';
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
 * (Previously 3 ticks/s ≈ 24s/day — players found the baseline too rushed; the
 * 72-tick day structure is unchanged, this only paces real time. 0.5× ≈ 96s, 2× ≈ 24s.)
 */
const BASE_TICKS_PER_SECOND = 1.5;
/**
 * React UI publish throttle (ms). Sim ticks notify listeners immediately;
 * this only paces periodic non-tick polls. 250ms keeps App re-render load low
 * (clicks/commands are never delayed by this).
 */
const UI_UPDATE_MS = 250;
const MAX_CATCHUP_STEPS = 12;
/**
 * Worker stall watchdog (ms). If a tick was requested from the worker but no
 * tickResult arrives within this window, the worker is assumed dead: dispose it
 * and fall back to main-thread gameTick so the sim never freezes silently.
 */
const WORKER_STALL_TIMEOUT_MS = 2000;

export type { WorkerCommand } from './simWorker/commands';

export type SessionListener = (
  world: WorldState,
  view: ViewState,
  tickChanged: boolean,
  catalog: EntityCatalog,
) => void;

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
    if (before[i]?.id !== after[i]?.id) return true;
    if (before[i]?.dismissed !== after[i]?.dismissed) return true;
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
    before.autoSave !== after.autoSave
    || before.nextFloatingTextId !== after.nextFloatingTextId
    || bigNewsPatchChanged(before.bigNews, after.bigNews)
    || before.floatingTexts.length !== after.floatingTexts.length
    || before.floatingTexts[before.floatingTexts.length - 1]?.id !== after.floatingTexts[after.floatingTexts.length - 1]?.id
    || idsPatchChanged(before.dismissedBigNewsIds, after.dismissedBigNewsIds)
    || idsPatchChanged(before.dismissedNotificationIds, after.dismissedNotificationIds)
    || idsPatchChanged(before.dismissedActiveEventIds, after.dismissedActiveEventIds)
    || (before.activeEvent?.id ?? null) !== (after.activeEvent?.id ?? null)
    || idsPatchChanged(before.tutorialSeen, after.tutorialSeen)
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
  /** True while worker is initializing — blocks main-thread ticks to avoid split-brain. */
  private workerBooting = false;
  private workerTickChanged = false;
  /** Last time the worker delivered a tick/command result — watchdog input. */
  private lastWorkerActivity = 0;
  private renderSoA: RenderSoAReaderV1 | null = null;
  private renderMetaBySlot: EntityRenderMeta[] | null = null;
  private scentReader: ScentGridReader | null = null;
  private sessionGen = 0;
  private notifyDepth = 0;
  private lastPausedSentToWorker: boolean | null = null;
  /** Serializes worker commands — GameWorkerHost rejects overlapping sendCommand. */
  private commandChain: Promise<void> = Promise.resolve();
  /** Cached 2d context — getContext every frame is not free. */
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private canvasCtxFor: HTMLCanvasElement | null = null;
  /** Cached canvas CSS size — avoids getBoundingClientRect layout reads per frame. */
  private layoutSize = { w: 0, h: 0 };
  private layoutCanvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** Cached render snapshot — rebuilt only when sim/view inputs change. */
  private snapshotCache: import('./renderSnapshot').RenderSnapshot | null = null;
  private snapshotKey = '';

  constructor(world: WorldState, view: ViewState, getCanvas: () => HTMLCanvasElement | null) {
    resetRendererCaches();
    this.world = world;
    this.view = view;
    this.getCanvas = getCanvas;
    this.catalog.rebuild(world.entities);
    this.lastNotifiedTick = world.tick;

    if (isGameWorkerEnabled()) {
      this.workerBooting = true;
      this.workerHost = new GameWorkerHost();
      const initGen = this.sessionGen;
      void this.workerHost.init(world).then(() => {
        // Only sessionGen / dispose mark a stale boot — do NOT require `running`.
        // Init is async; if we gated on start(), a fast worker ready before start()
        // permanently disabled the worker and left gameTick on the main thread.
        if (initGen !== this.sessionGen || !this.workerHost) {
          this.workerBooting = false;
          this.workerEnabled = false;
          if (initGen !== this.sessionGen) {
            this.workerHost?.dispose();
            this.workerHost = null;
          }
          return;
        }
        // init() already posted the world; re-sync so any pre-ready mutations are authoritative.
        this.workerHost.importSave(this.world);
        this.workerEnabled = true;
        this.workerBooting = false;
        this.workerHost.setTickResultHandler((nextWorld, _delta, render, changed) => {
          if (initGen !== this.sessionGen) return;
          this.lastWorkerActivity = performance.now();
          this.world = nextWorld;
          this.catalog.rebuild(this.world.entities);
          if (render) {
            this.renderSoA = render.reader;
            this.renderMetaBySlot = render.metaBySlot;
            this.scentReader = render.scentReader;
            patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader, render.metaBySlot);
          }
          this.view = syncScreenShakeFromWorld(this.view, this.world);
          clearScreenShakeImpulse(this.world);
          this.workerTickChanged = changed;
        });
        this.workerHost.setCommandResultHandler((world, _delta, render) => {
          if (initGen !== this.sessionGen) return;
          this.lastWorkerActivity = performance.now();
          this.world = world;
          if (render) {
            this.renderSoA = render.reader;
            this.renderMetaBySlot = render.metaBySlot;
            this.scentReader = render.scentReader;
            patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader, render.metaBySlot);
          }
        });
        console.info('[GameLoop] Sim worker active — gameTick + commands run off the main thread');
      }).catch((err) => {
        if (initGen !== this.sessionGen) return;
        console.warn('[GameLoop] Worker init failed — falling back to main-thread ticks', err);
        this.workerHost?.dispose();
        this.workerHost = null;
        this.workerEnabled = false;
        this.workerBooting = false;
        this.renderSoA = null;
        this.renderMetaBySlot = null;
        this.scentReader = null;
      });
    }
  }

  /**
   * True when sim ticks/commands are authoritative on the Web Worker (heavy work off main).
   * Default-on since v0.6 — opt out via `VITE_USE_GAME_WORKER=0` (slow 10x ticks stop freezing the UI).
   */
  isUsingSimWorker(): boolean {
    return this.workerEnabled && !!this.workerHost?.isReady();
  }

  /** True while the worker is starting (main-thread ticks held to avoid split-brain). */
  isSimWorkerBooting(): boolean {
    return this.workerBooting;
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

  /**
   * Shared session swap: bump gen, clear caches, rebuild catalog, import to worker.
   * Used by setSession / setWorld so load and world-only replace stay in lockstep.
   */
  private adoptWorldSession(world: WorldState, view: ViewState): void {
    this.sessionGen++;
    clearAllFactionWanderStates();
    resetRendererCaches();
    this.world = world;
    this.view = view;
    this.lastNotifiedTick = world.tick;
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

  /** Replace simulation + view state (new game, load, reset). */
  setSession(world: WorldState, view: ViewState): void {
    this.adoptWorldSession(world, view);
  }

  setWorld(world: WorldState): void {
    this.adoptWorldSession(world, createInitialView(world.width, world.height));
  }

  /** Wait for worker boot/idle before importSave so load/new-game cannot drop the upload. */
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
        // importSave may return the held render buffer to the worker — drop local readers first.
        this.renderSoA = null;
        this.renderMetaBySlot = null;
        this.scentReader = null;
        this.workerHost.importSave(world);
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

  /** @param silent Skip React notification (use for per-frame hover/ghost/camera drag). */
  patchView(patch: Partial<ViewState>, silent = false): void {
    this.view = { ...this.view, ...patch };
    if (!silent) this.notify(false, false, true);
  }

  /** Worker-authoritative player command (no full WorldState clone). */
  applyCommand(cmd: WorkerCommand): void {
    if (this.workerEnabled && this.workerHost?.isReady()) {
      const cmdGen = this.sessionGen;
      this.commandChain = this.commandChain
        .then(() => {
          if (cmdGen !== this.sessionGen || !this.running || !this.workerHost?.isReady()) return;
          return this.workerHost.whenIdle();
        })
        .then(() => {
          if (cmdGen !== this.sessionGen || !this.running || !this.workerHost?.isReady()) return;
          return this.workerHost.sendCommand(cmd);
        })
        .then((delta) => {
          if (!delta || cmdGen !== this.sessionGen || !this.running) return;
          this.syncAfterWorkerMutation();
          this.catalog.rebuild(this.world.entities);
          this.pruneStaleSelection();
          this.notify(true, false, true);
        })
        .catch((err) => {
          if (cmdGen !== this.sessionGen || !this.running) return;
          console.warn('[GameLoop] Worker command failed — applying on main thread', err);
          this.applyCommandLocal(cmd);
        });
      return;
    }
    this.applyCommandLocal(cmd);
  }

  /** Re-bind main shadow to worker worldRef after command/tick delta application. */
  private syncAfterWorkerMutation(): void {
    const authoritative = this.workerHost?.getAuthoritativeWorld();
    if (authoritative) this.world = authoritative;
  }

  private applyCommandLocal(cmd: WorkerCommand): void {
    this.world = applyWorkerCommand(this.world, cmd);
    this.catalog.rebuild(this.world.entities);
    this.pruneStaleSelection();
    this.notify(true, false, true);
  }

  /**
   * Legacy closure mutator — prefer `applyCommand`. Rejected when the sim worker is active
   * unless a typed `WorkerCommand` was provided.
   */
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
    this.workerHost?.syncWorld(this.world);
    this.pruneStaleSelection();
    this.notify(true);
  }

  /**
   * Mutate UI/sim control fields (pause, speed, bigNews, floatingTexts, autoSave).
   * Does not apply simulation commands — use `applyCommand` for entities/buildings.
   * Syncs pause/speed/UI patches to worker when enabled.
   */
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

  /** Export worker-authoritative world for save (Rule 10). */
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
        this.world = exported;
        this.catalog.rebuild(exported.entities);
        return exported;
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
        if (!this.running || subscribeGen !== this.sessionGen || !this.listeners.has(listener)) return;
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
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    this.sessionGen++;
    this.commandChain = Promise.resolve();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
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

  /** Keep the canvas CSS size cached — rebinds the observer when the canvas changes. */
  private ensureCanvasSizeTracking(): void {
    const canvas = this.getCanvas();
    if (!canvas || canvas === this.layoutCanvas) return;
    this.layoutCanvas = canvas;
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.layoutSize = { w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) };
    });
    this.resizeObserver.observe(canvas);
  }

  /** Cheap fingerprint of everything renderGame reads — skip snapshot rebuild when unchanged. */
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
        // Hold accumulator until worker is authoritative — prevents init race.
      } else if (this.workerEnabled && this.workerHost) {
        // Watchdog: a requested tick that never answers = dead/stuck worker.
        // Dispose it and fall back to the main-thread sim so the game keeps
        // running instead of freezing silently (citizens stop moving, no errors).
        const stalled = this.workerHost.hasTickInFlight()
          && performance.now() - this.lastWorkerActivity > WORKER_STALL_TIMEOUT_MS;
        if (stalled) {
          console.warn('[GameLoop] Worker tick stalled — falling back to main-thread ticks');
          this.workerHost.dispose();
          this.workerHost = null;
          this.workerEnabled = false;
          this.workerBooting = false;
          this.renderSoA = null;
          this.renderMetaBySlot = null;
          this.scentReader = null;
        } else {
          while (
            this.tickAccumulator >= msPerTick
            && steps < MAX_CATCHUP_STEPS
            && this.workerHost.canPipelineTick()
          ) {
            if (this.workerHost.requestTick(focus)) {
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
          // P1 (BUG-2): gameTick keeps identity-stable entity buckets on
          // no-change ticks — rebuild the catalog only when that identity
          // actually changed (birth/death/type-change), not every tick.
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
      // First frame(s) before ResizeObserver fires — measure once and cache.
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
      // Resize resets context state
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }

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
    if (this.view.selectedBuildingId != null && !resolveBuilding(this.world, this.view.selectedBuildingId)) {
      this.view = { ...this.view, selectedBuildingId: null };
    }
    const alive = (this.view.selectedEntityIds ?? [])
      .filter((id) => resolveEntity(this.world, id) != null);
    const primaryAlive = this.view.selectedEntityId != null
      && resolveEntity(this.world, this.view.selectedEntityId) != null;
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
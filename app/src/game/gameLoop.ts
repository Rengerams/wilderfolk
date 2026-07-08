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

/** 2 ticks/s at 1× — one game-day (24 ticks) ≈ 12 real seconds. */
const BASE_TICKS_PER_SECOND = 2;
const UI_UPDATE_MS = 100;
const MAX_CATCHUP_STEPS = 12;

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
  };
}

function uiPatchChanged(before: WorkerUiPatch, after: WorkerUiPatch): boolean {
  return (
    before.autoSave !== after.autoSave
    || before.nextFloatingTextId !== after.nextFloatingTextId
    || before.bigNews.length !== after.bigNews.length
    || before.floatingTexts.length !== after.floatingTexts.length
    || before.bigNews[before.bigNews.length - 1]?.id !== after.bigNews[after.bigNews.length - 1]?.id
    || before.floatingTexts[before.floatingTexts.length - 1]?.id !== after.floatingTexts[after.floatingTexts.length - 1]?.id
  );
}

export class GameLoop {
  private world: WorldState;
  private view: ViewState;
  private readonly catalog = new EntityCatalog();
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
  private renderSoA: RenderSoAReaderV1 | null = null;
  private renderMetaBySlot: EntityRenderMeta[] | null = null;
  private scentReader: ScentGridReader | null = null;
  private sessionGen = 0;
  private notifyDepth = 0;
  private lastPausedSentToWorker: boolean | null = null;
  /** Serializes worker commands — GameWorkerHost rejects overlapping sendCommand. */
  private commandChain: Promise<void> = Promise.resolve();

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
        if (initGen !== this.sessionGen || !this.running || !this.workerHost) return;
        this.workerHost.importSave(this.world);
        this.workerEnabled = true;
        this.workerBooting = false;
        this.workerHost.setTickResultHandler((nextWorld, _delta, render, changed) => {
          if (initGen !== this.sessionGen || !this.running) return;
          this.world = nextWorld;
          this.catalog.rebuild(this.world.entities);
          if (render) {
            this.renderSoA = render.reader;
            this.renderMetaBySlot = render.metaBySlot;
            this.scentReader = render.scentReader;
            patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader);
          }
          this.view = syncScreenShakeFromWorld(this.view, this.world);
          this.workerTickChanged = changed;
        });
        this.workerHost.setCommandResultHandler((world, _delta, render) => {
          if (initGen !== this.sessionGen || !this.running) return;
          this.world = world;
          if (render) {
            this.renderSoA = render.reader;
            this.renderMetaBySlot = render.metaBySlot;
            this.scentReader = render.scentReader;
            patchCatalogKinematicsFromRenderSoA(this.catalog, render.reader);
          }
        });
      }).catch((err) => {
        if (initGen !== this.sessionGen || !this.running) return;
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

  getWorld(): WorldState {
    return this.world;
  }

  getView(): ViewState {
    return this.view;
  }

  getEntityCatalog(): EntityCatalog {
    return this.catalog;
  }

  /** Replace simulation + view state (new game, load, reset). */
  setSession(world: WorldState, view: ViewState): void {
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
    this.queueWorkerImport(world);
    this.lastPausedSentToWorker = null;
    this.notify(true);
  }

  setWorld(world: WorldState): void {
    this.sessionGen++;
    clearAllFactionWanderStates();
    resetRendererCaches();
    this.world = world;
    this.view = createInitialView(world.width, world.height);
    this.lastNotifiedTick = world.tick;
    this.catalog.rebuild(world.entities);
    this.renderSoA = null;
    this.renderMetaBySlot = null;
    this.scentReader = null;
    this.queueWorkerImport(world);
    this.lastPausedSentToWorker = null;
    this.notify(true);
  }

  /** Wait for worker boot/idle before importSave so load/new-game cannot drop the upload. */
  private queueWorkerImport(world: WorldState): void {
    if (!this.workerHost) return;
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
  }

  getWorldAndView(): { world: WorldState; view: ViewState } {
    return { world: this.world, view: this.view };
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
      } else if (!this.workerHost) {
        while (this.tickAccumulator >= msPerTick && steps < MAX_CATCHUP_STEPS) {
          gameTick(this.world, focus);
          this.catalog.rebuild(this.world.entities);
          this.view = syncScreenShakeFromWorld(this.view, this.world);
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
    const rect = canvas.getBoundingClientRect();
    const layoutW = canvas.offsetWidth || canvas.clientWidth || rect.width;
    const layoutH = canvas.offsetHeight || canvas.clientHeight || rect.height;
    if (layoutW <= 0 || layoutH <= 0) return;

    const ctx = canvas.getContext('2d');
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

    const snapshot = buildRenderSnapshot(this.world, this.view, {
      renderSoA: this.renderSoA,
      renderMetaBySlot: this.renderMetaBySlot ?? undefined,
      catalog: this.catalog,
      scentGrid: this.workerEnabled ? null : this.world.scentGrid,
      scentReader: this.scentReader,
    });
    renderGame(ctx, snapshot, layoutW, layoutH);
    if (this.world.screenShakeImpulse > 0) {
      clearScreenShakeImpulse(this.world);
    }
  }

  private pruneStaleSelection(): void {
    if (this.view.selectedBuildingId != null && !resolveBuilding(this.world, this.view.selectedBuildingId)) {
      this.view = { ...this.view, selectedBuildingId: null };
    }
    if (this.view.selectedEntityId != null && !resolveEntity(this.world, this.view.selectedEntityId)) {
      this.view = { ...this.view, selectedEntityId: null };
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
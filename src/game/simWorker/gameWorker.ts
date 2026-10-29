/// <reference lib="webworker" />
import { canonicalDialogueBank, installDialogueBankPayload } from '../dialogueTrees';
import { gameTick } from '../gameTick';
import { GAME_VERSION } from '../version';
import {
  hydrateWorldRuntimeCaches,
  invalidateWorldRuntimeCaches,
} from '../worldRuntimeCaches';
import { adoptSimSeedFromWorld, restoreSimRng, stampWorldSimRng } from '../simRng';
import { areNamesLoaded, loadNames } from '../nameLoader';
import { repairJuvenileAssignmentsOnLoad } from '../dayCycle';

installDialogueBankPayload(canonicalDialogueBank);

/* Core runtime types */
import type { Entity, WorldState } from '../gameTypes';

/* Rendering & simulation helpers */
import { packRenderSoA } from '../simBuffers/packRenderSoA';
import { RenderBufferPool } from '../simBuffers/renderBufferPool';
import { extractSimTickDelta } from '../simBuffers/simDelta';
import { getPerformanceSnapshot, maybeWorkerPerformanceSnapshot, profileEnd, profileStart, setPerformanceProfilingEnabled, type PerformanceSnapshot } from '../performanceProfiler';
import { getPathfinderReport, resetPathfinderSession, setPathfindingMetricsEnabled } from '../pathfindingMetrics';
import { ensureScentGrid, USE_SCENT_GRID } from '../scentGrid';

/* Worker-side command logic */
import {
  applyWorkerCommand,
  isWorkerCommand,
  safeExtractCommandDelta,
} from './commands';

/* Simulation preparation helpers */
import { applySimPrep, extractSimPrep } from './simPrep';
import { applyWorkerUiPatch } from './uiPatch';

/* Protocol contract */
import {
  isWorkerProto,
  WORKER_PROTO,
  workerProtoMismatch,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';

/* -------------------------------------------------------------------------- */
/*  Worker state                                                              */
/* -------------------------------------------------------------------------- */
let world: WorldState | null = null;
let bufferPool: RenderBufferPool | null = null;
let headlessMode = false;
let lastFocus: import('../simFocus').SimulationFocus | undefined;

/** Buildings snapshot for diff-mode deltas (only changed buildings are shipped). */
let prevBuildingsSnapshot: Map<number, string> | null = null;
let prevHistoriesSnapshot: Map<string, string | undefined> | null = null;

/** Profiler snapshots carry the A* shape behind the pathfinding stages; no A* ran here otherwise. */
function withPathfinderReport(snapshot: PerformanceSnapshot | undefined): PerformanceSnapshot | undefined {
  if (snapshot) snapshot.pathfinder = getPathfinderReport();
  return snapshot;
}

/* -------------------------------------------------------------------------- */
/*  Utility – error reporting                                                */
/* -------------------------------------------------------------------------- */
function postError(
  message: string,
  source: 'tick' | 'command' | 'export' | 'general' = 'general',
): void {
  const response: WorkerResponse = { type: 'error', proto: WORKER_PROTO, message, source };
  self.postMessage(response);
}

/** Settled once per worker realm — see `ensureNamePoolSettled`. */
let namePoolSettled: Promise<void> | null = null;
let namePoolGateResolved = false;

export function ensureNamePoolSettled(): Promise<void> {
  // Share the in-flight load with all incoming messages. A completed gate may
  // be stale after a test realm resets the name pool; only then reload.
  if (!namePoolSettled || (namePoolGateResolved && !areNamesLoaded())) {
    namePoolGateResolved = false;
    namePoolSettled = loadNames().then(() => {
      namePoolGateResolved = true;
    });
  }
  return namePoolSettled;
}

/* -------------------------------------------------------------------------- */
/*  Buffer lifecycle helpers                                                */
/* -------------------------------------------------------------------------- */
function releaseAcquiredBuffer(acquired: { index: number; buffer: ArrayBuffer }): void {
  bufferPool?.release(acquired.index, acquired.buffer);
}

/* -------------------------------------------------------------------------- */
/*  Pack & dispatch tick result                                             */
/* -------------------------------------------------------------------------- */
function packAndPostTickResult(
  aliveNow: Entity[],
  acquired: { index: number; buffer: ArrayBuffer },
): void {
  if (!world) {
    releaseAcquiredBuffer(acquired);
    return;
  }
  try {
    const packStart = profileStart();
    const pack = packRenderSoA(world, acquired.buffer, undefined, lastFocus);
    profileEnd('worker.packRenderSoA', packStart);
    const deltaStart = profileStart();
    const nextBuildings = new Map<number, string>();
    const nextHistories = new Map<string, string | undefined>();
    const delta = extractSimTickDelta(world, aliveNow, {
      renderPacked: pack.packedEntities,
      focus: lastFocus,
      cloneMode: 'transfer',
      prevBuildings: prevBuildingsSnapshot,
      nextBuildings,
      prevHistories: prevHistoriesSnapshot,
      nextHistories,
    });
    profileEnd('worker.extractDelta', deltaStart);
    world.screenShakeImpulse = 0; // one-shot impulse – clear each tick

    const transferables: ArrayBuffer[] = [pack.buffer];
    let scentBuffer: ArrayBuffer | undefined;
    if (USE_SCENT_GRID && world.scentGrid) {
      const grid = ensureScentGrid(world);
      scentBuffer = grid.packSidecar(world.tick);
      transferables.push(scentBuffer);
    }

    const response: WorkerResponse = {
      type: 'tickResult',
      proto: WORKER_PROTO,
      performanceSnapshot: withPathfinderReport(maybeWorkerPerformanceSnapshot()),
      renderBuffer: pack.buffer,
      bufferIndex: acquired.index,
      schemaVersion: pack.schemaVersion,
      delta,
      scentBuffer,
    };
    self.postMessage(response, transferables);
    prevBuildingsSnapshot = nextBuildings;
    prevHistoriesSnapshot = nextHistories;
  } catch (err) {
    releaseAcquiredBuffer(acquired);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Session reset                                                             */
/* -------------------------------------------------------------------------- */
function resetWorkerSession(nextWorld: WorldState): void {
  // World uploads can bypass saveLoad's migration (worker init/sync/import).
  // Repair legacy child work state at every full-world boundary as well.
  repairJuvenileAssignmentsOnLoad(nextWorld);
  hydrateWorldRuntimeCaches(nextWorld);
  adoptSimSeedFromWorld(nextWorld);
  restoreSimRng(nextWorld.simRng);
  world = nextWorld;
  lastFocus = undefined;
  prevBuildingsSnapshot = null;
  prevHistoriesSnapshot = null;
}

/* -------------------------------------------------------------------------- */
/*  Worker message handlers                                                  */
/* -------------------------------------------------------------------------- */
export function installWorkerMessageHandlers(): void {
self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  postError(`Unhandled rejection: ${(event.reason as Error)?.message ?? String(event.reason)}`, 'general');
};

self.onerror = (event: unknown) => {
  const e = event as ErrorEvent;
  postError(
    `Worker error: ${e.message ?? String(event)} at ${e.filename ?? 'unknown'}:${e.lineno ?? 0}:${e.colno ?? 0}`,
    'general',
  );
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!isWorkerProto(msg.proto)) {
    postError(workerProtoMismatch((msg as { proto?: unknown }).proto));
    return;
  }

  void (async () => {
    try {
      await ensureNamePoolSettled();
    } catch (err) {
      postError(`Name pool load failed: ${err instanceof Error ? err.message : String(err)}`, 'general');
    }
  })();

  try {
    switch (msg.type) {
      case 'init': {
        headlessMode = msg.headless ?? false;
        resetWorkerSession(msg.world);
        bufferPool = headlessMode ? null : new RenderBufferPool();

        const ready: WorkerResponse = {
          type: 'ready',
          proto: WORKER_PROTO,
          simVersion: GAME_VERSION,
          buffers: headlessMode
            ? []
            : USE_SCENT_GRID
              ? ['renderSoA_v1', 'scentSidecar_v1']
              : ['renderSoA_v1'],
        };
        self.postMessage(ready);
        break;
      }

      case 'importSave':
      case 'syncWorld': {
        resetWorkerSession(msg.world);
        self.postMessage({ type: 'worldUploaded', proto: WORKER_PROTO, uploadId: msg.uploadId } satisfies WorkerResponse);
        break;
      }

      case 'exportSave': {
        if (!world) {
          postError('Worker not initialized', 'export');
          break;
        }

        // Only copy the shell: postMessage synchronously snapshots nested data.
        // Never strip caches or stamp RNG on the live simulation world: a save
        // (including a failed serialization) must not change its runtime state.
        const exportWorld = { ...world };
        invalidateWorldRuntimeCaches(exportWorld);
        stampWorldSimRng(exportWorld);
        const response: WorkerResponse = {
          type: 'exportSaveResult',
          proto: WORKER_PROTO,
          world: exportWorld,
        };
        self.postMessage(response);
        break;
      }

      case 'command': {
        if (!world) {
          postError('Worker not initialized', 'command');
          break;
        }
        if (!isWorkerCommand(msg.cmd)) {
          const response: WorkerResponse = {
            type: 'commandResult',
            proto: WORKER_PROTO,
            ok: false,
            delta: safeExtractCommandDelta(world),
            reason: 'Invalid worker command',
          };
          self.postMessage(response);
          break;
        }

        const prepBackup = extractSimPrep(world);
        let delta;
        try {
          world = applyWorkerCommand(world, msg.cmd, 'owned');
          prevBuildingsSnapshot = null;
          prevHistoriesSnapshot = null;
          delta = safeExtractCommandDelta(world);
        } catch (err) {
          applySimPrep(world, prepBackup);
          const response: WorkerResponse = {
            type: 'commandResult',
            proto: WORKER_PROTO,
            ok: false,
            delta: safeExtractCommandDelta(world),
            reason: err instanceof Error ? err.message : String(err),
          };
          self.postMessage(response);
          break;
        }

        let renderBuffer: ArrayBuffer | undefined;
        let bufferIndex: number | undefined;
        let schemaVersion: number | undefined;
        let scentBuffer: ArrayBuffer | undefined;
        const transferables: ArrayBuffer[] = [];

        if (bufferPool) {
          const acquired = bufferPool.acquire();
          if (acquired) {
            try {
              const pack = packRenderSoA(world, acquired.buffer);
              renderBuffer = pack.buffer;
              bufferIndex = acquired.index;
              schemaVersion = pack.schemaVersion;
              transferables.push(renderBuffer);

              if (USE_SCENT_GRID && world.scentGrid) {
                const grid = ensureScentGrid(world);
                scentBuffer = grid.packSidecar(world.tick);
                transferables.push(scentBuffer);
              }
            } catch (packErr) {
              releaseAcquiredBuffer(acquired);
              console.warn('[WorkerCommand] Render pack failed after command', packErr);
            }
          }
        }

        const response: WorkerResponse = {
          type: 'commandResult',
          proto: WORKER_PROTO,
          ok: true,
          delta,
          renderBuffer,
          bufferIndex,
          schemaVersion,
          scentBuffer,
        };
        self.postMessage(response, transferables);
        break;
      }

      case 'returnBuffer': {
        if (!bufferPool || !msg.buffer || msg.buffer.byteLength === 0) break;
        bufferPool.release(msg.bufferIndex, msg.buffer);
        break;
      }

      case 'setPaused': {
        if (!world) break;
        world.paused = msg.paused;
        break;
      }

      case 'setSpeed': {
        if (!world) break;
        world.speed = msg.speed;
        break;
      }

      case 'setProfiling': {
        setPerformanceProfilingEnabled(msg.enabled);
        setPathfindingMetricsEnabled(msg.enabled);
        if (msg.enabled) resetPathfinderSession();
        if (!msg.enabled && msg.requestId !== undefined) {
          const response: WorkerResponse = {
            type: 'profilingStopped',
            proto: WORKER_PROTO,
            requestId: msg.requestId,
            snapshot: { ...getPerformanceSnapshot(), pathfinder: getPathfinderReport() },
          };
          self.postMessage(response);
        }
        break;
      }

      case 'patchUi': {
        if (!world) break;
        applyWorkerUiPatch(world, msg);
        break;
      }

      case 'tick': {
        if (!world) {
          postError('Worker not initialized', 'tick');
          break;
        }
        const prepBackup = extractSimPrep(world);
        try {
          gameTick(world, msg.focus);
          lastFocus = msg.focus;
          const aliveNow = world.entities.filter((e) => e.alive);

          if (headlessMode) {
            const delta = extractSimTickDelta(world, aliveNow, {
              focus: lastFocus,
              headless: true,
              cloneMode: 'transfer',
            });
            world.screenShakeImpulse = 0;
            const response: WorkerResponse = {
              type: 'tickResult',
              proto: WORKER_PROTO,
              delta,
              performanceSnapshot: withPathfinderReport(maybeWorkerPerformanceSnapshot()),
              headless: true,
            };
            self.postMessage(response);
            break;
          }

          if (!bufferPool) {
            applySimPrep(world, prepBackup);
            postError('Render buffer pool not initialized', 'tick');
            break;
          }
          const acquired = bufferPool.acquire();
          if (!acquired) {
            applySimPrep(world, prepBackup);
            postError(
              'Render buffer pool exhausted — return buffers before pipelining more ticks',
              'tick',
            );
            break;
          }

          packAndPostTickResult(aliveNow, acquired);
        } catch (err) {
            applySimPrep(world, prepBackup);
            postError(err instanceof Error ? err.message : String(err), 'tick');
        }
        break;
      }

      default:
        postError(`Unknown worker request: ${(msg as { type?: string }).type ?? '?'}`);
    }
  } catch (err) {
    const source = msg.type === 'tick'
      ? 'tick'
      : msg.type === 'exportSave'
        ? 'export'
        : msg.type === 'command'
          ? 'command'
          : 'general';
    postError(err instanceof Error ? err.message : String(err), source);
  }
};
}

// Production worker bootstrap. Tests may reattach the cached module to a new
// isolated self shim without importing a second runtime realm.
installWorkerMessageHandlers();

/// <reference lib="webworker" />
import { canonicalDialogueBank, installDialogueBankPayload } from '../dialogueTrees';
import { gameTick } from '../gameTick';
import { GAME_VERSION } from '../version';
import {
  hydrateWorldRuntimeCaches,
  invalidateWorldRuntimeCaches,
} from '../worldRuntimeCaches';
import { adoptSimSeedFromWorld, restoreSimRng, stampWorldSimRng } from '../simRng';
import { snapshotHistoryRevisions, type HistoryRevisions } from '../historyRevisions';
import { areNamesLoaded, loadNames } from '../nameLoader';
import { repairJuvenileAssignmentsOnLoad } from '../dayCycle';

installDialogueBankPayload(canonicalDialogueBank);

/* Core runtime types */
import type { Entity, WorldState } from '../gameTypes';

/* Rendering & simulation helpers */
import { packRenderSoA } from '../simBuffers/packRenderSoA';
import { RenderBufferPool, type AcquiredRenderBuffer } from '../simBuffers/renderBufferPool';
import { extractSimTickDelta, splitStaticProps, stripUnchangedProfile, stripUnchangedRelationships, type SimTickDelta } from '../simBuffers/simDelta';
import { PROFILE_REVISION, RELATIONSHIP_REVISION, revisionOf } from '../entityRevision';
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
  assertWorkerFeatures,
  isWorkerProto,
  WORKER_PROTO,
  workerProtoMismatch,
  type WorkerFeature,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';

/* -------------------------------------------------------------------------- */
/*  Worker state                                                              */
/* -------------------------------------------------------------------------- */
let world: WorldState | null = null;
let bufferPool: RenderBufferPool | null = null;
/** Highest host command id applied in this worker session; a fault reports it so replays skip it. */
let lastAppliedCommandId = 0;
let headlessMode = false;
let lastFocus: import('../simFocus').SimulationFocus | undefined;
/** Relationship revisions the display world already received; reset with the session. */
let relationshipRevisionsSent = new Map<number, number>();
/** Static decor the display already holds; only roster changes ship after the first delta. */
let staticPropsSent = new Set<number>();
/** Profile-field revisions the display already holds; refreshed on change or every few minutes. */
let profileFieldsSent = new Map<number, { revision: number; tick: number }>();

/** Buildings snapshot for diff-mode deltas (only changed buildings are shipped). */
let prevBuildingsSnapshot: Map<number, string> | null = null;
/** Geometry signature of the last acknowledged building delta; drives host cache retention. */
let prevBuildingGeometry: Map<number, string> | null = null;
/** History revisions at the last acknowledged tick; unchanged families are not re-shipped. */
let prevHistoryRevisions: HistoryRevisions | null = null;
let previousEventHeadId: WorldState['eventLog'][number]['id'] | undefined;

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
  const response: WorkerResponse = {
    type: 'error',
    proto: WORKER_PROTO,
    message,
    source,
    lastAppliedCommandId,
  };
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
function releaseAcquiredBuffer(acquired: AcquiredRenderBuffer): void {
  bufferPool?.release(acquired.index, acquired.lease, acquired.buffer);
}

/* -------------------------------------------------------------------------- */
/*  Pack & dispatch tick result                                             */
/* -------------------------------------------------------------------------- */
function packAndPostTickResult(
  aliveNow: Entity[],
  acquired: AcquiredRenderBuffer,
): void {
  if (!world) {
    releaseAcquiredBuffer(acquired);
    return;
  }
  try {
    const packStart = profileStart();
    const pack = packRenderSoA(world, acquired.buffer, undefined, lastFocus, aliveNow);
    profileEnd('worker.packRenderSoA', packStart);
    const deltaStart = profileStart();
    const nextBuildings = new Map<number, string>();
    const nextBuildingGeometry = new Map<number, string>();
    const delta = extractSimTickDelta(world, aliveNow, {
      cloneMode: 'transfer',
      prevBuildings: prevBuildingsSnapshot,
      nextBuildings,
      prevBuildingGeometry,
      nextBuildingGeometry,
      prevHistoryRevisions,
      previousEventHeadId,
    });
    attachStaticProps(delta);
    attachRelationshipRevisions(delta);
    attachProfileFields(delta);
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
      bufferLease: acquired.lease,
      schemaVersion: pack.schemaVersion,
      delta,
      scentBuffer,
      lastAppliedCommandId,
    };
    self.postMessage(response, transferables);
    prevBuildingsSnapshot = nextBuildings;
    prevBuildingGeometry = nextBuildingGeometry;
    prevHistoryRevisions = snapshotHistoryRevisions(world);
    previousEventHeadId = world.eventLog[0]?.id;
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
  lastAppliedCommandId = 0;
  lastFocus = undefined;
  prevBuildingsSnapshot = null;
  prevBuildingGeometry = null;
  prevHistoryRevisions = null;
  previousEventHeadId = undefined;
  relationshipRevisionsSent = new Map();
  staticPropsSent = new Set();
  profileFieldsSent = new Map();
}

/** Split trees/grass out of the per-tick roster; the replica keeps the props it already has. */
function attachStaticProps(delta: SimTickDelta): void {
  splitStaticProps(delta, staticPropsSent);
}

/** Attach profile revisions: skill/trait/career maps cross the port only when they change. */
function attachProfileFields(delta: SimTickDelta): void {
  if (!world) return;
  const revisions = new Map<number, number>();
  for (const entity of world.entities) revisions.set(entity.id, revisionOf(entity, PROFILE_REVISION));
  stripUnchangedProfile(delta, revisions, profileFieldsSent, world.tick);
}

/** Attach the relationship revisions the display already has, so only changed records ship. */function attachRelationshipRevisions(delta: SimTickDelta): void {
  if (!world) return;
  const revisions = new Map<number, number>();
  for (const entity of world.entities) revisions.set(entity.id, revisionOf(entity, RELATIONSHIP_REVISION));
  stripUnchangedRelationships(delta, revisions, relationshipRevisionsSent);
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

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!isWorkerProto(msg.proto)) {
    postError(workerProtoMismatch((msg as { proto?: unknown }).proto));
    return;
  }

  try {
    await ensureNamePoolSettled();
    switch (msg.type) {
      case 'init': {
        headlessMode = msg.headless ?? false;
        const offered: WorkerFeature[] = headlessMode
          ? []
          : USE_SCENT_GRID
            ? ['renderSoA_v1', 'scentSidecar_v1']
            : ['renderSoA_v1'];
        try {
          assertWorkerFeatures(msg.features ?? [], offered);
        } catch (err) {
          postError(err instanceof Error ? err.message : String(err));
          break;
        }
        resetWorkerSession(msg.world);
        bufferPool = headlessMode ? null : new RenderBufferPool();

        const ready: WorkerResponse = {
          type: 'ready',
          proto: WORKER_PROTO,
          simVersion: GAME_VERSION,
          buffers: offered,
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

        // Only copy the shell: never strip caches or stamp RNG on the live simulation world, so a
        // save — including a failed serialization — cannot change runtime state.
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
          const delta = safeExtractCommandDelta(world);
          attachStaticProps(delta);
          attachRelationshipRevisions(delta);
          attachProfileFields(delta);
          const response: WorkerResponse = {
            type: 'commandResult',
            proto: WORKER_PROTO,
            ok: false,
            delta,
            reason: 'Invalid worker command',
          };
          self.postMessage(response);
          break;
        }

        const prepBackup = extractSimPrep(world);
        let delta;
        try {
          world = applyWorkerCommand(world, msg.cmd, 'owned');
          if (typeof msg.commandId === 'number') lastAppliedCommandId = msg.commandId;
          prevBuildingsSnapshot = null;
          prevBuildingGeometry = null;
          prevHistoryRevisions = null;
          previousEventHeadId = undefined;
          delta = safeExtractCommandDelta(world);
          attachStaticProps(delta);
          attachRelationshipRevisions(delta);
          attachProfileFields(delta);
        } catch (err) {
          applySimPrep(world, prepBackup);
          const failedDelta = safeExtractCommandDelta(world);
          attachStaticProps(failedDelta);
          attachRelationshipRevisions(failedDelta);
          attachProfileFields(failedDelta);
          const response: WorkerResponse = {
            type: 'commandResult',
            proto: WORKER_PROTO,
            ok: false,
            delta: failedDelta,
            reason: err instanceof Error ? err.message : String(err),
          };
          self.postMessage(response);
          break;
        }

        let renderBuffer: ArrayBuffer | undefined;
        let bufferIndex: number | undefined;
        let bufferLease: number | undefined;
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
              bufferLease = acquired.lease;
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
          commandId: msg.commandId,
          renderBuffer,
          bufferIndex,
          bufferLease,
          schemaVersion,
          scentBuffer,
        };
        self.postMessage(response, transferables);
        break;
      }

      case 'returnBuffer': {
        if (!bufferPool) break;
        bufferPool.release(msg.bufferIndex, msg.bufferLease, msg.buffer);
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
              cloneMode: 'transfer',
            });
            attachStaticProps(delta);
            attachRelationshipRevisions(delta);
            attachProfileFields(delta);
            world.screenShakeImpulse = 0;
            const response: WorkerResponse = {
              type: 'tickResult',
              proto: WORKER_PROTO,
              delta,
              performanceSnapshot: withPathfinderReport(maybeWorkerPerformanceSnapshot()),
              headless: true,
              lastAppliedCommandId,
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

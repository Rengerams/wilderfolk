/// <reference lib="webworker" />
import { canonicalDialogueBank, installDialogueBankPayload } from '../dialogueTrees';
import { gameTick } from '../gameTick';
import { GAME_VERSION } from '../version';
import {
  captureSimulationState,
  hydrateWorldRuntimeCaches,
  invalidateWorldRuntimeCaches,
  restoreSimulationState,
} from '../worldRuntimeCaches';
import { adoptSimSeedFromWorld, restoreSimRng } from '../simRng';
import { loadNames } from '../nameLoader';

installDialogueBankPayload(canonicalDialogueBank);

/* Core runtime types */
import type { Building, Entity, WorldState } from '../gameTypes';

/* Rendering & simulation helpers */
import { packRenderSoA } from '../simBuffers/packRenderSoA';
import { RenderBufferPool } from '../simBuffers/renderBufferPool';
import { extractSimTickDelta } from '../simBuffers/simDelta';
import { ensureScentGrid, USE_SCENT_GRID } from '../scentGrid';

/* Worker-side command logic */
import {
  applyWorkerCommand,
  extractCommandDelta,
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
let prevBuildingsSnapshot: Map<number, Building> | null = null;

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
    const pack = packRenderSoA(world, acquired.buffer, undefined, lastFocus);
    const delta = extractSimTickDelta(world, aliveNow, {
      renderPacked: pack.packedEntities,
      focus: lastFocus,
      cloneMode: 'transfer',
      prevBuildings: prevBuildingsSnapshot,
    });
    prevBuildingsSnapshot = new Map((world.buildings ?? []).map((b) => [b.id, structuredClone(b)]));
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
      renderBuffer: pack.buffer,
      bufferIndex: acquired.index,
      schemaVersion: pack.schemaVersion,
      delta,
      scentBuffer,
    };
    self.postMessage(response, transferables);
  } catch (err) {
    releaseAcquiredBuffer(acquired);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Session reset                                                             */
/* -------------------------------------------------------------------------- */
function resetWorkerSession(nextWorld: WorldState): void {
  hydrateWorldRuntimeCaches(nextWorld);
  adoptSimSeedFromWorld(nextWorld);
  restoreSimRng(nextWorld.simRng);
  world = nextWorld;
  lastFocus = undefined;
  prevBuildingsSnapshot = null;
}

/* -------------------------------------------------------------------------- */
/*  Worker message handlers                                                  */
/* -------------------------------------------------------------------------- */
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

  try {
    switch (msg.type) {
      case 'init': {
        headlessMode = msg.headless ?? false;
        resetWorkerSession(msg.world);
        bufferPool = headlessMode ? null : new RenderBufferPool();

        loadNames().catch((err) => {
          console.warn('[Worker] Census names background load failed:', err);
        });

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
        break;
      }

      case 'exportSave': {
        if (!world) {
          postError('Worker not initialized', 'export');
          break;
        }
        // The clone is a save payload, so it crosses with the runtime caches dropped — the same set
        // `saveLoad.stripRuntimeWorldFields` removes on the way to disk, `scentGrid` included: the
        // odour trail is transient and `loadGameFromParsed` recreates it.
        // The *live* worker world is a different matter. `scentGrid` is simulation state (the
        // accumulated predator odour grazers sample to flee), so invalidating it here zeroed the
        // trail on every manual save and every ~30 s auto-save (worker-boundary audit F-2). Capture
        // it across the rebuild — the clone is taken in between, without it.
        const liveSimulationState = captureSimulationState(world);
        invalidateWorldRuntimeCaches(world);
        const clonedWorld = structuredClone(world);
        hydrateWorldRuntimeCaches(world);
        restoreSimulationState(world, liveSimulationState);

        const response: WorkerResponse = {
          type: 'exportSaveResult',
          proto: WORKER_PROTO,
          world: clonedWorld,
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
            delta: extractCommandDelta(world),
            reason: 'Invalid worker command',
          };
          self.postMessage(response);
          break;
        }

        const prepBackup = extractSimPrep(world);
        let delta;
        try {
          world = applyWorkerCommand(world, msg.cmd);
          delta = extractCommandDelta(world);
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

      case 'patchUi': {
        if (!world) break;
        // Only the player-authored fields are adopted; `bigNews`, `floatingTexts`, `activeEvent` and
        // `nextFloatingTextId` belong to the tick on this side (worker-boundary audit F2).
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

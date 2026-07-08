/// <reference lib="webworker" />
import { gameTick } from '../gameEngine';
import type { Entity, WorldState } from '../gameTypes';
import { packRenderSoA } from '../simBuffers/packRenderSoA';
import { RenderBufferPool } from '../simBuffers/renderBufferPool';
import { extractSimTickDelta } from '../simBuffers/simDelta';
import { USE_SCENT_GRID } from '../scentGrid';
import {
  applyWorkerCommand,
  aliveIdSet,
  extractCommandDelta,
  isWorkerCommand,
  safeExtractCommandDelta,
} from './commands';
import { syncEventLogIdFromState } from '../eventLog';
import { applySimPrep, extractSimPrep } from './simPrep';
import { isWorkerProto, WORKER_PROTO, workerProtoMismatch, type WorkerRequest, type WorkerResponse } from './protocol';

let world: WorldState | null = null;
let bufferPool: RenderBufferPool | null = null;
let headlessMode = false;
let lastFocus: import('../gameEngine').SimulationFocus | undefined;

function postError(
  message: string,
  source: 'tick' | 'command' | 'export' | 'general' = 'general',
): void {
  const response: WorkerResponse = { type: 'error', proto: WORKER_PROTO, message, source };
  self.postMessage(response);
}

function releaseAcquiredBuffer(acquired: { index: number; buffer: ArrayBuffer }): void {
  bufferPool?.release(acquired.index, acquired.buffer);
}

function packAndPostTickResult(
  before: Set<number>,
  aliveNow: Entity[],
  acquired: { index: number; buffer: ArrayBuffer },
): void {
  if (!world) {
    releaseAcquiredBuffer(acquired);
    return;
  }
  try {
    const pack = packRenderSoA(world, acquired.buffer, undefined, lastFocus);
    const delta = extractSimTickDelta(world, before, aliveNow, {
      renderPacked: pack.packedEntities,
      focus: lastFocus,
      cloneMode: 'transfer',
    });

    const transferables: ArrayBuffer[] = [pack.buffer];
    let scentBuffer: ArrayBuffer | undefined;
    if (USE_SCENT_GRID && world.scentGrid) {
      scentBuffer = world.scentGrid.packSidecar(world.tick);
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

function resetWorkerSession(nextWorld: WorldState): void {
  world = nextWorld;
  lastFocus = undefined;
}

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
        const ready: WorkerResponse = {
          type: 'ready',
          proto: WORKER_PROTO,
          simVersion: '0.5.0',
          buffers: headlessMode ? [] : USE_SCENT_GRID ? ['renderSoA_v1', 'scentSidecar_v1'] : ['renderSoA_v1'],
        };
        self.postMessage(ready);
        break;
      }
      case 'syncSimPrep': {
        if (!world) {
          postError('Worker not initialized');
          break;
        }
        applySimPrep(world, msg.prep);
        syncEventLogIdFromState(world);
        break;
      }
      case 'importSave':
      case 'syncWorld': {
        resetWorkerSession(msg.world);
        break;
      }
      case 'exportSave': {
        if (!world) {
          postError('Worker not initialized');
          break;
        }
        const response: WorkerResponse = {
          type: 'exportSaveResult',
          proto: WORKER_PROTO,
          world: structuredClone(world) as WorldState,
        };
        self.postMessage(response);
        break;
      }
      case 'command': {
        if (!world) {
          postError('Worker not initialized');
          break;
        }
        const before = aliveIdSet(world);
        if (!isWorkerCommand(msg.cmd)) {
          const response: WorkerResponse = {
            type: 'commandResult',
            proto: WORKER_PROTO,
            ok: false,
            delta: extractCommandDelta(world, before),
            reason: 'Invalid worker command',
          };
          self.postMessage(response);
          break;
        }
        const prepBackup = extractSimPrep(world);
        let delta;
        try {
          world = applyWorkerCommand(world, msg.cmd);
          delta = extractCommandDelta(world, before);
        } catch (err) {
          applySimPrep(world, prepBackup);
          const response: WorkerResponse = {
            type: 'commandResult',
            proto: WORKER_PROTO,
            ok: false,
            delta: safeExtractCommandDelta(world, before),
            reason: err instanceof Error ? err.message : String(err),
          };
          self.postMessage(response);
          break;
        }

        let renderBuffer: ArrayBuffer | undefined;
        let bufferIndex: number | undefined;
        let schemaVersion: number | undefined;
        if (bufferPool) {
          const acquired = bufferPool.acquire();
          if (acquired) {
            try {
              const pack = packRenderSoA(world, acquired.buffer);
              renderBuffer = pack.buffer;
              bufferIndex = acquired.index;
              schemaVersion = pack.schemaVersion;
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
        };
        const transferables = renderBuffer ? [renderBuffer] : [];
        self.postMessage(response, transferables);
        break;
      }
      case 'returnBuffer': {
        if (!bufferPool) break;
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
        world.bigNews = msg.bigNews;
        world.floatingTexts = msg.floatingTexts;
        world.autoSave = msg.autoSave;
        world.nextFloatingTextId = msg.nextFloatingTextId;
        break;
      }
      case 'tick': {
        if (!world) {
          postError('Worker not initialized', 'tick');
          break;
        }
        const prepBackup = extractSimPrep(world);
        const before = aliveIdSet(world);
        try {
          gameTick(world, msg.focus);
          lastFocus = msg.focus;
          const aliveNow = world.entities.filter((e) => e.alive);

          if (headlessMode) {
            const delta = extractSimTickDelta(world, before, aliveNow, {
              focus: lastFocus,
              headless: true,
              cloneMode: 'transfer',
            });
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
            postError('Render buffer pool exhausted — return buffers before pipelining more ticks', 'tick');
            break;
          }
          packAndPostTickResult(before, aliveNow, acquired);
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
        : 'general';
    postError(err instanceof Error ? err.message : String(err), source);
  }
};
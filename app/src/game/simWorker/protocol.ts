import type { WorldState } from '../gameTypes';
import type { SimulationFocus } from '../gameEngine';
import type { SimTickDelta } from '../simBuffers/simDelta';
import type { WorkerCommand } from './commands';
import type { SimPrepPayload } from './simPrep';

export type { SimPrepPayload };

export const WORKER_PROTO = 1;

export function isWorkerProto(proto: unknown): proto is typeof WORKER_PROTO {
  return proto === WORKER_PROTO;
}

export function workerProtoMismatch(got: unknown): string {
  return `Worker protocol mismatch: expected ${WORKER_PROTO}, got ${String(got)}`;
}

/** Ensure the worker `ready` handshake advertises every feature the host requested. */
export function assertWorkerFeatures(
  requested: readonly WorkerFeature[],
  offered: readonly WorkerFeature[],
): void {
  for (const feature of requested) {
    if (!offered.includes(feature)) {
      throw new Error(`Worker missing feature: ${feature}`);
    }
  }
}

export type WorkerFeature = 'renderSoA_v1' | 'scentSidecar_v1';

export type WorkerRequest =
  | { type: 'init'; proto: typeof WORKER_PROTO; world: WorldState; features: WorkerFeature[]; headless?: boolean }
  | { type: 'importSave'; proto: typeof WORKER_PROTO; world: WorldState }
  | { type: 'syncWorld'; proto: typeof WORKER_PROTO; world: WorldState }
  | { type: 'syncSimPrep'; proto: typeof WORKER_PROTO; prep: SimPrepPayload }
  | { type: 'tick'; proto: typeof WORKER_PROTO; focus?: SimulationFocus }
  | { type: 'command'; proto: typeof WORKER_PROTO; cmd: WorkerCommand }
  | { type: 'exportSave'; proto: typeof WORKER_PROTO }
  | { type: 'setPaused'; proto: typeof WORKER_PROTO; paused: boolean }
  | { type: 'setSpeed'; proto: typeof WORKER_PROTO; speed: number }
  | {
      type: 'patchUi';
      proto: typeof WORKER_PROTO;
      bigNews: WorldState['bigNews'];
      floatingTexts: WorldState['floatingTexts'];
      autoSave: boolean;
      nextFloatingTextId: number;
    }
  | { type: 'returnBuffer'; proto: typeof WORKER_PROTO; bufferIndex: number; buffer: ArrayBuffer };

export type WorkerResponse =
  | {
      type: 'ready';
      proto: typeof WORKER_PROTO;
      simVersion: string;
      buffers: WorkerFeature[];
    }
  | {
      type: 'tickResult';
      proto: typeof WORKER_PROTO;
      delta: SimTickDelta;
      /** Headless sim — no render SoA transfer. */
      headless?: boolean;
      renderBuffer?: ArrayBuffer;
      bufferIndex?: number;
      schemaVersion?: number;
      /** Transferable wolf-scent influence map for debug overlay (optional). */
      scentBuffer?: ArrayBuffer;
    }
  | {
      type: 'commandResult';
      proto: typeof WORKER_PROTO;
      ok: boolean;
      delta: SimTickDelta;
      reason?: string;
      renderBuffer?: ArrayBuffer;
      bufferIndex?: number;
      schemaVersion?: number;
    }
  | {
      type: 'exportSaveResult';
      proto: typeof WORKER_PROTO;
      world: WorldState;
    }
  | {
      type: 'error';
      proto: typeof WORKER_PROTO;
      message: string;
      /** Which request failed — host uses this to adjust in-flight counters. */
      source?: 'tick' | 'command' | 'export' | 'general';
    };
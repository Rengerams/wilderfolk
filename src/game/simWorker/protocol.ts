import type { WorldState } from '../gameTypes';

/* Protocol version used to gate the worker <-> host handshake. */
export const WORKER_PROTO = 1;

/**
 * Checks that the supplied `proto` matches the expected worker protocol version.
 * Returns `true` when the version matches, `false` otherwise.
 */
export function isWorkerProto(proto: unknown): proto is typeof WORKER_PROTO {
  return proto === WORKER_PROTO;
}

/**
 * Builds a clear mismatch error for the worker protocol handshake.
 */
export function workerProtoMismatch(got: unknown): string {
  return `Worker protocol mismatch: expected ${WORKER_PROTO}, got ${String(got)}`;
}

/** Viewport region receiving full simulation this tick – extracted here so the contract stays pure. */
export interface SimulationFocus {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Opaque worker command envelope – concrete shape lives in `commands.ts`. */
export type WorkerCommandEnvelope = {
  proto: 1;
  op: string;
  [key: string]: unknown;
};

/** Opaque simulation‑prep – concrete shape lives in `simPrep.ts`. */
export type SimPrepPayload = unknown;

/** Opaque tick‑delta – concrete shape lives in `simBuffers/simDelta.ts`. */
export type SimTickDeltaPayload = unknown;

/**
 * Verifies that every feature the host asked for is advertised by the worker.
 * Throws if a requested feature is missing.
 */
export function assertWorkerFeatures(
  requested: readonly WorkerFeature[],
  offered: readonly WorkerFeature[] | undefined,
): void {
  for (const feature of requested) {
    if (!offered || !offered.includes(feature)) {
      throw new Error(`Worker missing feature: ${feature}`);
    }
  }
}

/** Feature flags the worker can expose. */
export type WorkerFeature = 'renderSoA_v1' | 'scentSidecar_v1';

/* -------------------------------------------------------------------------- */
/*  Host → Worker requests                                                    */
/* -------------------------------------------------------------------------- */
export type WorkerRequest =
  | {
      type: 'init';
      proto: typeof WORKER_PROTO;
      world: WorldState;
      features: WorkerFeature[];
      headless?: boolean;
    }
  | { type: 'importSave'; proto: typeof WORKER_PROTO; world: WorldState }
  | { type: 'syncWorld'; proto: typeof WORKER_PROTO; world: WorldState }
  | { type: 'tick'; proto: typeof WORKER_PROTO; focus?: SimulationFocus }
  | { type: 'command'; proto: typeof WORKER_PROTO; cmd: WorkerCommandEnvelope }
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
      dismissedBigNewsIds?: string[];
      dismissedNotificationIds?: string[];
      dismissedActiveEventIds?: string[];
      activeEvent: WorldState['activeEvent'];
      tutorialSeen?: string[];
    }
  | {
      type: 'returnBuffer';
      proto: typeof WORKER_PROTO;
      bufferIndex: number;
      buffer: ArrayBuffer;
    };

/* -------------------------------------------------------------------------- */
/*  Worker → Host responses                                                    */
/* -------------------------------------------------------------------------- */
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
      delta: SimTickDeltaPayload;
      /** Headless simulation – no SoA render transfer. */
      headless?: boolean;
      renderBuffer?: ArrayBuffer;
      bufferIndex?: number;
      schemaVersion?: number;
      /** Transferable wolf‑scent influence map for debug overlay (optional). */
      scentBuffer?: ArrayBuffer;
    }
  | {
      type: 'commandResult';
      proto: typeof WORKER_PROTO;
      ok: boolean;
      delta: SimTickDeltaPayload;
      reason?: string;
      renderBuffer?: ArrayBuffer;
      bufferIndex?: number;
      schemaVersion?: number;
      scentBuffer?: ArrayBuffer;
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
      /** Which request failed – used by the host to adjust in‑flight counters. */
      source?: 'tick' | 'command' | 'export' | 'general';
    };
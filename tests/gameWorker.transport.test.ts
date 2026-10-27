/**
 * The worker handshake guards themselves — not restatements of them.
 *
 * The previous version of this file asserted on its own local literals (and compared two
 * compile-time constants TS proves cannot be equal), so no production function was ever called and
 * nothing here could fail. `src/game/simWorker/protocol.ts` does have real behaviour to test: the
 * three exported guards plus the two message shapes the host and worker exchange.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize } from '../src/game/gameTypes';
import {
  WORKER_PROTO,
  assertWorkerFeatures,
  isWorkerProto,
  workerProtoMismatch,
  type WorkerFeature,
  type WorkerRequest,
  type WorkerResponse,
} from '../src/game/simWorker/protocol';

const REQUESTED_FEATURES: WorkerFeature[] = ['renderSoA_v1'];

describe('gameWorker transport protocol', () => {
  it('accepts only the current protocol version', () => {
    expect(isWorkerProto(WORKER_PROTO)).toBe(true);
    expect(isWorkerProto(WORKER_PROTO + 1)).toBe(false);
    expect(isWorkerProto(9999)).toBe(false);
    expect(isWorkerProto(undefined)).toBe(false);
    // A worker that stringifies the version must not pass the handshake.
    expect(isWorkerProto(String(WORKER_PROTO))).toBe(false);
  });

  it('names both sides of the mismatch in the handshake error', () => {
    const message = workerProtoMismatch(9999);
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain(String(WORKER_PROTO));
    expect(message).toContain('9999');
  });

  it('requires every requested feature to be advertised by the worker', () => {
    // A superset is fine: the host asks for what it needs, not for an exact set.
    expect(() =>
      assertWorkerFeatures(REQUESTED_FEATURES, ['renderSoA_v1', 'scentSidecar_v1']),
    ).not.toThrow();
    expect(() => assertWorkerFeatures([], undefined)).not.toThrow();

    expect(() => assertWorkerFeatures(['scentSidecar_v1'], REQUESTED_FEATURES)).toThrow(
      'Worker missing feature: scentSidecar_v1',
    );
    // The pre-handshake case: nothing advertised yet, so no request can be satisfied.
    expect(() => assertWorkerFeatures(REQUESTED_FEATURES, undefined)).toThrow(
      'Worker missing feature: renderSoA_v1',
    );
  });

  it('builds a valid init request and a valid ready response', () => {
    const world = initGame({ size: MapSize.Medium, seed: 7 });
    const initRequest = {
      type: 'init',
      proto: WORKER_PROTO,
      world,
      features: REQUESTED_FEATURES,
      headless: true,
    } satisfies WorkerRequest;

    expect(initRequest.type).toBe('init');
    expect(isWorkerProto(initRequest.proto)).toBe(true);
    // The handshake actually closes: the host's request is satisfiable by that worker's offer.
    expect(() => assertWorkerFeatures(initRequest.features, ['renderSoA_v1'])).not.toThrow();

    const readyResponse = {
      type: 'ready',
      proto: WORKER_PROTO,
      simVersion: 'test',
      buffers: ['renderSoA_v1'],
    } satisfies WorkerResponse;

    expect(readyResponse.type).toBe('ready');
    expect(isWorkerProto(readyResponse.proto)).toBe(true);
    expect(() => assertWorkerFeatures(initRequest.features, readyResponse.buffers)).not.toThrow();
  });
});

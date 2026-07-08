import { describe, expect, it, vi } from 'vitest';
import {
  assertWorkerFeatures,
  isWorkerProto,
  WORKER_PROTO,
  workerProtoMismatch,
} from '@/game/simWorker/protocol';
import { isGameWorkerEnabled } from '@/game/simWorker/GameWorkerHost';

describe('worker protocol', () => {
  it('accepts the negotiated proto version', () => {
    expect(isWorkerProto(WORKER_PROTO)).toBe(true);
    expect(isWorkerProto(2)).toBe(false);
    expect(isWorkerProto(undefined)).toBe(false);
  });

  it('formats protocol mismatch errors consistently', () => {
    expect(workerProtoMismatch(2)).toBe('Worker protocol mismatch: expected 1, got 2');
    expect(workerProtoMismatch(undefined)).toBe('Worker protocol mismatch: expected 1, got undefined');
  });

  it('requires requested worker features in the ready handshake', () => {
    expect(() => assertWorkerFeatures(['renderSoA_v1'], ['renderSoA_v1'])).not.toThrow();
    expect(() => assertWorkerFeatures(['renderSoA_v1'], [])).toThrow(/renderSoA_v1/);
    expect(() => assertWorkerFeatures(
      ['renderSoA_v1', 'scentSidecar_v1'],
      ['renderSoA_v1'],
    )).toThrow(/scentSidecar_v1/);
  });

  it('treats common falsey env values as worker disabled', () => {
    vi.stubEnv('VITE_USE_GAME_WORKER', 'false');
    expect(isGameWorkerEnabled()).toBe(false);
    vi.stubEnv('VITE_USE_GAME_WORKER', '0');
    expect(isGameWorkerEnabled()).toBe(false);
    vi.stubEnv('VITE_USE_GAME_WORKER', '1');
    expect(isGameWorkerEnabled()).toBe(typeof Worker !== 'undefined');
  });
});
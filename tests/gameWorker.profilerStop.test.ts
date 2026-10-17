import { afterEach, describe, expect, it } from 'vitest';
import {
  getPerformanceSnapshot,
  profileEnd,
  profileSimulationTick,
  profileStart,
  setPerformanceProfilingEnabled,
} from '../src/game/performanceProfiler';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';

type SelfShim = {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  onerror: unknown;
  onunhandledrejection: unknown;
  postMessage: (message: WorkerResponse) => void;
};

afterEach(() => {
  setPerformanceProfilingEnabled(false);
  delete (globalThis as { self?: unknown }).self;
});

describe('worker profiling stop handshake', () => {
  it('returns the unpublished tail without waiting for the three-second tick throttle', async () => {
    const posted: WorkerResponse[] = [];
    const shim: SelfShim = {
      onmessage: null,
      onerror: null,
      onunhandledrejection: null,
      postMessage: (message) => { posted.push(message); },
    };
    (globalThis as { self?: unknown }).self = shim;
    await import('../src/game/simWorker/gameWorker');
    if (!shim.onmessage) throw new Error('Simulation worker did not attach its message handler');

    shim.onmessage({ data: { type: 'setProfiling', proto: WORKER_PROTO, enabled: true } });
    profileSimulationTick(4320, 1800, 'rain');
    const start = profileStart();
    profileEnd('daily.criticalSpike', start);
    expect(getPerformanceSnapshot().sections).toHaveLength(1);

    shim.onmessage({ data: { type: 'setProfiling', proto: WORKER_PROTO, enabled: false, requestId: 17 } });
    const final = posted.find((message) => message.type === 'profilingStopped');
    expect(final).toBeDefined();
    if (!final || final.type !== 'profilingStopped') throw new Error('No final worker snapshot');
    expect(final.requestId).toBe(17);
    expect(final.snapshot.enabled).toBe(false);
    expect(final.snapshot.ticks).toBe(1);
    expect(final.snapshot.lastTick).toBe(4320);
    expect(final.snapshot.sections.find((section) => section.name === 'daily.criticalSpike')?.calls).toBe(1);

    profileSimulationTick(4321, 1800, 'rain');
    expect(getPerformanceSnapshot().ticks).toBe(1);
  });
});

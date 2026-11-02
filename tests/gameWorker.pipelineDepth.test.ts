import { describe, expect, it } from 'vitest';
import {
  allowedTickPipelineDepth,
  GameWorkerHost,
  MAX_PIPELINE_DEPTH,
} from '../src/game/simWorker/GameWorkerHost';
import { RENDER_BUFFER_POOL_SIZE } from '../src/game/simBuffers/renderBufferPool';

describe('worker pipeline reserves and ordering barriers', () => {
  it('caps concurrency to leave one display and one command buffer slot', () => {
    expect(RENDER_BUFFER_POOL_SIZE).toBe(5);
    expect(MAX_PIPELINE_DEPTH).toBe(4);
    expect(allowedTickPipelineDepth(0)).toBe(1);
    expect(allowedTickPipelineDepth(1)).toBe(1);
    expect(allowedTickPipelineDepth(2)).toBe(2);
    expect(allowedTickPipelineDepth(3)).toBe(3);
    expect(allowedTickPipelineDepth(4)).toBe(3);
    expect(allowedTickPipelineDepth(100)).toBe(3);
    expect(allowedTickPipelineDepth(NaN)).toBe(1);
  });

  it('stops posting at the configured depth and on command, export or upload barriers', () => {
    const host = new GameWorkerHost();
    const internals = host as unknown as {
      ticksInFlight: number;
      pendingCommand: unknown;
      pendingExport: unknown;
      uploadBarrier: boolean;
    };
    expect(host.canPipelineTick()).toBe(true);
    internals.ticksInFlight = 1;
    expect(host.canPipelineTick()).toBe(true);
    internals.ticksInFlight = 2;
    expect(host.canPipelineTick()).toBe(false);
    internals.ticksInFlight = 0;
    internals.pendingCommand = {};
    expect(host.canPipelineTick()).toBe(false);
    internals.pendingCommand = null;
    internals.pendingExport = {};
    expect(host.canPipelineTick()).toBe(false);
    internals.pendingExport = null;
    internals.uploadBarrier = true;
    expect(host.canPipelineTick()).toBe(false);
  });
});

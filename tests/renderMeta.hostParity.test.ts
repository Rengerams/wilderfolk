/**
 * The render sidecar is derived, not shipped.
 *
 * `renderMetaBySlot` used to travel with every render tick and duplicated fields that
 * `aliveEntities` already carries (name, job, needs, skills, relationship ids, …). The render buffer
 * names every packed entity, so the host rebuilds the per-slot metadata from the applied world. This
 * pins that reconstruction against the worker's old per-slot packing so the move cannot drift: same
 * slots, same values, including a thinned overflow buffer where slot order is priority-selected.
 */
import { describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { hydrateWorldRuntimeCaches } from '../src/game/worldRuntimeCaches';
import { applySimTickDelta, type SimTickDelta } from '../src/game/simBuffers/simDelta';
import {
  packEntityRenderMeta,
  packRenderMetaForSlots,
} from '../src/game/simBuffers/entityRenderMeta';
import { packRenderSoA } from '../src/game/simBuffers/packRenderSoA';
import { createRenderSoAReader } from '../src/game/simBuffers/renderSoAReader';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';

describe('render metadata is rebuilt on the host from the packed buffer', () => {
  it('matches the worker selection field for field', () => {
    const world = initGame({ size: MapSize.Medium, seed: 515 });
    hydrateWorldRuntimeCaches(world);
    const pack = packRenderSoA(world);
    const reader = createRenderSoAReader(pack.buffer);
    if (!reader) throw new Error('the packed buffer is not a valid render SoA');

    const hostMeta = packRenderMetaForSlots(reader, (id) => world.entityById?.get(id));

    expect(hostMeta).toEqual(pack.packedEntities.map(packEntityRenderMeta));
    expect(hostMeta).toHaveLength(reader.aliveCount);
  });

  it('covers every slot of a priority-thinned overflow buffer', () => {
    const world = initGame({ size: MapSize.Medium, seed: 516 });
    hydrateWorldRuntimeCaches(world);
    const alive = world.entities.filter((entity) => entity.alive);
    const maxSlots = Math.max(1, Math.min(64, alive.length - 1));
    const pack = packRenderSoA(world, undefined, maxSlots);
    const reader = createRenderSoAReader(pack.buffer);
    if (!reader) throw new Error('the packed buffer is not a valid render SoA');

    const hostMeta = packRenderMetaForSlots(reader, (id) => world.entityById?.get(id));

    expect(hostMeta).toHaveLength(reader.aliveCount);
    expect(hostMeta.map((meta) => meta.id)).toEqual(pack.packedEntities.map((entity) => entity.id));
    expect(hostMeta.every((meta) => meta.id !== undefined)).toBe(true);
  });

  it('the render-enabled worker delta carries no per-slot metadata', async () => {
    const world = initGame({ size: MapSize.Medium, seed: 517 });
    const posted: WorkerResponse[] = [];
    const shim = {
      onmessage: null as ((event: { data: WorkerRequest }) => void | Promise<void>) | null,
      onerror: null,
      onunhandledrejection: null,
      postMessage: (message: unknown) => { posted.push(message as WorkerResponse); },
    };
    (globalThis as { self?: unknown }).self = shim;
    vi.resetModules();
    try {
      // Settle the census before importing so the message gate resolves immediately.
      const names = await import('../src/game/nameLoader');
      await names.loadNames().catch(() => {});
      const { installWorkerMessageHandlers } = await import('../src/game/simWorker/gameWorker');
      installWorkerMessageHandlers();
      if (!shim.onmessage) throw new Error('gameWorker did not register an onmessage handler');

      await shim.onmessage({ data: { type: 'init', proto: WORKER_PROTO, world, features: [] } });
      await shim.onmessage({ data: { type: 'tick', proto: WORKER_PROTO } });

      const result = posted.find(
        (message): message is Extract<WorkerResponse, { type: 'tickResult' }> =>
          message.type === 'tickResult',
      );
      if (!result) throw new Error('the render-enabled worker posted no tick result');
      expect((result.delta as { renderMetaBySlot?: unknown }).renderMetaBySlot).toBeUndefined();
      expect(result.renderBuffer).toBeDefined();

      const display = structuredClone(world);
      applySimTickDelta(display, structuredClone(result.delta) as SimTickDelta, { cloneMode: 'transfer' });
      hydrateWorldRuntimeCaches(display);
      const reader = createRenderSoAReader(result.renderBuffer!);
      if (!reader) throw new Error('the render reply is not a valid render SoA');
      const hostMeta = packRenderMetaForSlots(reader, (id) => display.entityById?.get(id));
      expect(hostMeta.map((meta) => meta.id)).toEqual(
        Array.from({ length: reader.aliveCount }, (_, slot) => reader.id(slot)),
      );
    } finally {
      delete (globalThis as { self?: unknown }).self;
    }
  });
});

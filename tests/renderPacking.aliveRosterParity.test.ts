import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { packRenderSoA } from '../src/game/simBuffers/packRenderSoA';
import { extractSimTickDelta, SIM_DELTA_PROTO } from '../src/game/simBuffers/simDelta';

describe('render roster and tick delta parity', () => {
  it('writes identical bytes when the authoritative alive roster is reused', () => {
    const world = initGame({ size: MapSize.Medium, seed: 91 });
    const alive = world.entities.filter((entity) => entity.alive);
    const original = packRenderSoA(world, undefined, 4);
    const reused = packRenderSoA(world, undefined, 4, undefined, alive);
    expect(reused.aliveCount).toBe(original.aliveCount);
    expect(reused.packedEntities.map((entity) => entity.id))
      .toEqual(original.packedEntities.map((entity) => entity.id));
    expect(new Uint8Array(reused.buffer)).toEqual(new Uint8Array(original.buffer));
  });

  it('preserves overflow priority and packed hunting slots with a reused lookup map', () => {
    const world = initGame({ size: MapSize.Medium, seed: 92 });
    const alive = world.entities.filter((entity) => entity.alive);
    expect(alive.length).toBeGreaterThan(2);
    const first = packRenderSoA(world, undefined, 2);
    const second = packRenderSoA(world, undefined, 2, undefined, alive);
    expect(first.overflow).toBe(true);
    expect(second.overflow).toBe(true);
    expect(second.packedEntities.map((entity) => entity.id))
      .toEqual(first.packedEntities.map((entity) => entity.id));
    expect(new Uint8Array(second.buffer)).toEqual(new Uint8Array(first.buffer));
  });

  it('sends the authoritative alive snapshot but not a duplicate catalogue', () => {
    const world = initGame({ size: MapSize.Medium, seed: 93 });
    const alive = world.entities.filter((entity) => entity.alive);
    const delta = extractSimTickDelta(world, alive, { cloneMode: 'transfer' });
    expect(delta.proto).toBe(SIM_DELTA_PROTO);
    expect(delta.aliveEntities).toBe(alive);
    expect('catalogEntities' in delta).toBe(false);
  });
});

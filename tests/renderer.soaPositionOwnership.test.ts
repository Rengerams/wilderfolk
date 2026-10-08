/**
 * Two writers of entity position, and a render bucket cache keyed on the tick alone.
 *
 * The render SoA is a *snapshot of a past tick*; the live world is advanced by the tick delta. Both
 * were writing the same `Entity` objects, and the render-SoA bucket cache answered a same-tick
 * refresh with the previous buffer. Each case below is stated as the invariant it violates.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, type Entity, type WorldState } from '../src/game/gameTypes';
import { EntityCatalog } from '../src/game/entityCatalog';
import { patchCatalogKinematicsFromRenderSoA } from '../src/game/simBuffers/applyKinematics';
import { packRenderSoA } from '../src/game/simBuffers/packRenderSoA';
import { createRenderSoAReader } from '../src/game/simBuffers/renderSoAReader';
import {
  invalidateRenderSoABucketsCache,
  updateRenderSoABuckets,
} from '../src/game/simBuffers/renderSoAEntities';

function mover(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.Human,
    x,
    y,
    vx: 1,
    vy: 0,
    spriteAngle: 0,
    animFrame: 0,
    size: 1,
    flash: 0,
    alive: true,
  } as unknown as Entity;
}

function worldOf(entities: Entity[], tick: number): WorldState {
  return { entities, tick, width: 2048, height: 2048, buildings: [] } as unknown as WorldState;
}

function readerFor(entities: Entity[], tick: number) {
  const reader = createRenderSoAReader(packRenderSoA(worldOf(entities, tick)).buffer);
  if (!reader) throw new Error('the fixture buffer did not validate as a render SoA');
  return reader;
}

describe('a render-SoA snapshot never writes the live world', () => {
  it('leaves the display world position alone when a command refresh arrives a tick behind', () => {
    // The display world has been advanced by the tick delta to x=110.
    const live = mover(7, 110, 400);
    const world = worldOf([live], 42);
    const catalog = new EntityCatalog();
    catalog.rebuild(world.entities);

    // The render buffer carried by a command result still holds the previous tick's position.
    const staleReader = readerFor([mover(7, 100, 400)], 41);

    patchCatalogKinematicsFromRenderSoA(catalog, staleReader, undefined);

    // The catalog holds the world's own objects, so this write landed on the live mover.
    expect(catalog.getAny(7)).toBe(live);
    expect(live.x).toBe(110);
  });
});

describe('the render bucket cache is keyed on the buffer, not only the tick', () => {
  it('re-buckets when the same tick arrives with a fresh buffer', () => {
    invalidateRenderSoABucketsCache();

    const before = readerFor([mover(1, 10, 10), mover(2, 20, 20)], 42);
    const first = updateRenderSoABuckets(before, undefined, 42);
    expect(first.shimById.get(1)?.x).toBe(10);

    // A command result replaces the buffer without advancing the tick.
    const after = readerFor([mover(1, 11, 10), mover(2, 21, 20)], 42);
    const second = updateRenderSoABuckets(after, undefined, 42);

    expect(second.shimById.get(1)?.x).toBe(11);
  });
});

import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize, type Entity } from '../src/game/gameTypes';
import { applySimTickDelta, extractSimTickDelta, SIM_DELTA_PROTO } from '../src/game/simBuffers/simDelta';

function initialWorld() {
  return initGame({ size: MapSize.Medium, seed: 20261102 });
}

describe('authoritative incremental entity transport', () => {
  it('keeps unchanged entities and applies nested and position mutations exactly', () => {
    const world = initialWorld();
    const target = structuredClone(world);
    const previous = new Map<number, Entity>();
    const initial = extractSimTickDelta(world, undefined, {
      headless: true, cloneMode: 'transfer', nextEntities: previous,
    });
    expect(initial.entityChanges).toBeUndefined();
    applySimTickDelta(target, structuredClone(initial));

    const live = world.entities.filter((e) => e.alive);
    expect(live.length).toBeGreaterThan(6);
    live[0].x += 7;
    live[1].energy -= 3;
    const next = new Map<number, Entity>();
    const tickDelta = extractSimTickDelta(world, live, {
      headless: true, cloneMode: 'transfer', prevEntities: previous, nextEntities: next,
    });
    expect(tickDelta.proto).toBe(SIM_DELTA_PROTO);
    expect(tickDelta.entityChanges).toBeDefined();
    expect(tickDelta.aliveEntities).toEqual([]);
    expect(tickDelta.entityChanges?.changed.map((e) => e.id)).toEqual([live[0].id, live[1].id]);
    expect(tickDelta.entityChanges?.order).toBeUndefined();
    applySimTickDelta(target, structuredClone(tickDelta));
    expect(target.entities).toEqual(live);
  });

  it('preserves authoritative order through death, replacement and reordering', () => {
    const world = initialWorld();
    const target = structuredClone(world);
    const previous = new Map<number, Entity>();
    applySimTickDelta(target, structuredClone(extractSimTickDelta(world, undefined, {
      headless: true, nextEntities: previous,
    })));

    const alive = world.entities.filter((e) => e.alive);
    const replaced = { ...alive[2], id: world.nextEntityId++ };
    world.entities = [alive[1], ...alive.slice(3), replaced];
    const next = new Map<number, Entity>();
    const delta = extractSimTickDelta(world, undefined, {
      headless: true, prevEntities: previous, nextEntities: next,
    });
    expect(delta.entityChanges?.order).toEqual(world.entities.map((e) => e.id));
    expect(delta.entityChanges?.removedIds).toContain(alive[0].id);
    expect(delta.entityChanges?.removedIds).toContain(alive[2].id);
    applySimTickDelta(target, structuredClone(delta));
    expect(target.entities.map((e) => e.id)).toEqual(world.entities.map((e) => e.id));
    expect(target.entities).toEqual(world.entities);
  });

  it('falls back to a complete authoritative snapshot when most entities change', () => {
    const world = initialWorld();
    const previous = new Map<number, Entity>();
    extractSimTickDelta(world, undefined, { headless: true, nextEntities: previous });
    for (const entity of world.entities) if (entity.alive) entity.x += 1;
    const next = new Map<number, Entity>();
    const delta = extractSimTickDelta(world, undefined, {
      headless: true, prevEntities: previous, nextEntities: next,
    });
    expect(delta.entityChanges).toBeUndefined();
    expect(delta.aliveEntities).toEqual(world.entities.filter((e) => e.alive));
  });
});

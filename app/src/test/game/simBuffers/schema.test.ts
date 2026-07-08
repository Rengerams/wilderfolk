import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { freshState } from '@/test/fixtures/gameFixtures';
import { EntityCatalog } from '@/game/entityCatalog';
import { patchCatalogKinematicsFromRenderSoA } from '@/game/simBuffers/applyKinematics';
import { packRenderSoA, validateRenderBufferHeader } from '@/game/simBuffers/packRenderSoA';
import { createRenderSoAReader } from '@/game/simBuffers/renderSoAReader';
import { RENDER_FLAG_JUVENILE, RENDER_SOA_VERSION } from '@/game/simBuffers/schema';
import { applySimTickDelta, simTickDeltaFromWorld } from '@/game/simBuffers/simDelta';

describe('render SoA schema', () => {
  it('packs and reads entity kinematics with versioned header', () => {
    const state = freshState();
    const deer = createEntity(EntityType.Deer, 120, 80, 50, 200);
    deer.vx = 1.5;
    deer.spriteAngle = 0.7;
    deer.huntTargetId = undefined;
    state.entities.push(deer);

    const pack = packRenderSoA(state);
    expect(validateRenderBufferHeader(pack.buffer)).toBe(true);

    const reader = createRenderSoAReader(pack.buffer);
    expect(reader).not.toBeNull();
    expect(reader!.schemaVersion).toBe(RENDER_SOA_VERSION);
    expect(reader!.aliveCount).toBeGreaterThan(0);

    let deerSlot = -1;
    for (let slot = 0; slot < reader!.aliveCount; slot++) {
      if (reader!.id(slot) === deer.id) deerSlot = slot;
    }
    expect(deerSlot).toBeGreaterThanOrEqual(0);
    expect(reader!.x(deerSlot)).toBeCloseTo(120);
    expect(reader!.y(deerSlot)).toBeCloseTo(80);
    expect(reader!.vx(deerSlot)).toBeCloseTo(1.5);
    expect(reader!.spriteAngle(deerSlot)).toBeCloseTo(0.7);
  });

  it('maps hunt targets to slots for hunt lines', () => {
    const state = freshState();
    const rabbit = createEntity(EntityType.Rabbit, 10, 10, 1, 200);
    const wolf = createEntity(EntityType.Wolf, 20, 10, 2, 200);
    wolf.huntTargetId = rabbit.id;
    state.entities.push(rabbit, wolf);

    const reader = createRenderSoAReader(packRenderSoA(state).buffer)!;
    let wolfSlot = -1;
    reader.forEachSlot((slot) => {
      if (reader.id(slot) === wolf.id) wolfSlot = slot;
    });
    expect(wolfSlot).toBeGreaterThanOrEqual(0);
    expect(reader.huntTargetId(wolfSlot)).toBe(rabbit.id);
  });

  it('patches catalog kinematics from render SoA (Phase C)', () => {
    const state = freshState();
    const human = createEntity(EntityType.Human, 0, 0, 5, 250);
    human.isJuvenile = true;
    state.entities.push(human);

    const catalog = new EntityCatalog();
    catalog.rebuild(state.entities);
    const reader = createRenderSoAReader(packRenderSoA(state).buffer)!;
    const tracked = catalog.get(5)!;
    tracked.x = 999;
    tracked.y = 888;
    patchCatalogKinematicsFromRenderSoA(catalog, reader);
    expect(tracked.x).toBe(0);
    expect(tracked.y).toBe(0);
  });

  it('extracts and applies tick delta without full world clone', () => {
    const state = freshState();
    state.resources.food = 42;
    state.tick = 99;

    const delta = simTickDeltaFromWorld(state);
    const shadow = freshState();
    applySimTickDelta(shadow, delta);

    expect(shadow.tick).toBe(99);
    expect(shadow.resources.food).toBe(42);
  });

  it('rejects buffers with invalid magic or undersized layout', () => {
    const bad = new ArrayBuffer(256);
    expect(validateRenderBufferHeader(bad)).toBe(false);
    const pack = packRenderSoA(freshState());
    expect(validateRenderBufferHeader(pack.buffer)).toBe(true);
  });

  it('stores juvenile flag in bitfield', () => {
    const state = freshState();
    const child = createEntity(EntityType.Human, 5, 5, 9, 250);
    child.isJuvenile = true;
    state.entities.push(child);

    const reader = createRenderSoAReader(packRenderSoA(state).buffer)!;
    let childSlot = -1;
    reader.forEachSlot((slot) => {
      if (reader.id(slot) === child.id) childSlot = slot;
    });
    expect(childSlot).toBeGreaterThanOrEqual(0);
    expect(reader.flags(childSlot) & RENDER_FLAG_JUVENILE).not.toBe(0);
  });
});
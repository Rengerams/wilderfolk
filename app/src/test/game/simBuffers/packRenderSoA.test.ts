import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import type { Entity } from '@/game/gameTypes';
import { freshState } from '@/test/fixtures/gameFixtures';
import { createRenderSoAReader } from '@/game/simBuffers/renderSoAReader';
import { packRenderSoA, selectRenderEntities } from '@/game/simBuffers/packRenderSoA';
import { RENDER_MAX_SLOTS } from '@/game/simBuffers/schema';
import { isPlayerHuman } from '@/game/groupEvents';
import { createSimFocus } from '@/game/gameEngine';

function bruteForceSelect(alive: Entity[], maxSlots: number, focus?: ReturnType<typeof createSimFocus>) {
  const scored = alive.map((entity, index) => ({
    entity,
    index,
    score: (() => {
      let score = 0;
      if (entity.type === EntityType.Human && isPlayerHuman(entity)) score += 10_000;
      else if (entity.type === EntityType.Werewolf) score += 8_000;
      else if (entity.faction === 'rival' || entity.faction === 'visitor') score += 7_000;
      else if (entity.type === EntityType.Wolf || entity.type === EntityType.Fox) score += 5_000;
      else if (entity.type === EntityType.Deer || entity.type === EntityType.Rabbit) score += 3_000;
      else if (entity.type === EntityType.Tree) score += 500;
      else if (entity.type === EntityType.Grass) score += 100;
      if (focus) {
        const inFocus = entity.x >= focus.minX && entity.x <= focus.maxX
          && entity.y >= focus.minY && entity.y <= focus.maxY;
        if (inFocus) score += 2_000;
      }
      return score;
    })(),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, maxSlots).map((row) => row.entity.id);
}

describe('packRenderSoA overflow', () => {
  it('selectRenderEntities keeps all entities when under cap', () => {
    const state = freshState();
    const alive = state.entities.filter((e) => e.alive);
    const result = selectRenderEntities(alive, RENDER_MAX_SLOTS);
    expect(result.overflow).toBe(false);
    expect(result.packed.length).toBe(alive.length);
  });

  it('prioritizes player humans when over slot cap', () => {
    const state = freshState();
    const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
    expect(humans.length).toBeGreaterThan(0);

    const filler = Array.from({ length: RENDER_MAX_SLOTS + 50 }, (_, i) => ({
      ...state.entities[0],
      id: 10_000 + i,
      type: EntityType.Grass,
      alive: true,
    }));
    const alive = [...humans, ...filler];
    const { packed, overflow, totalAlive } = selectRenderEntities(alive, RENDER_MAX_SLOTS);
    expect(overflow).toBe(true);
    expect(totalAlive).toBe(alive.length);
    expect(packed.length).toBe(RENDER_MAX_SLOTS);
    for (const human of humans) {
      expect(packed.some((e) => e.id === human.id)).toBe(true);
    }
  });

  it('matches full-sort priority ordering on overflow', () => {
    const state = freshState();
    const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
    const focus = createSimFocus(state);
    const filler = Array.from({ length: RENDER_MAX_SLOTS + 200 }, (_, i) => ({
      ...state.entities[0],
      id: 30_000 + i,
      type: i % 3 === 0 ? EntityType.Deer : EntityType.Grass,
      x: (i * 17) % state.width,
      y: (i * 23) % state.height,
      alive: true,
    }));
    const alive = [...humans, ...filler];
    const expected = bruteForceSelect(alive, RENDER_MAX_SLOTS, focus);
    const actual = selectRenderEntities(alive, RENDER_MAX_SLOTS, focus).packed.map((e) => e.id);
    expect(actual).toEqual(expected);
  });

  it('packRenderSoA sets overflow flag in buffer header', () => {
    const state = freshState();
    const filler = Array.from({ length: RENDER_MAX_SLOTS + 10 }, (_, i) => ({
      ...state.entities[0],
      id: 20_000 + i,
      type: EntityType.Grass,
      alive: true,
    }));
    state.entities = [...state.entities, ...filler];

    const pack = packRenderSoA(state, undefined, RENDER_MAX_SLOTS);
    expect(pack.overflow).toBe(true);
    expect(pack.totalAlive).toBeGreaterThan(RENDER_MAX_SLOTS);

    const reader = createRenderSoAReader(pack.buffer);
    expect(reader).not.toBeNull();
    expect(reader!.hasOverflow()).toBe(true);
    expect(reader!.totalAliveCount()).toBe(pack.totalAlive);
    expect(reader!.aliveCount).toBe(RENDER_MAX_SLOTS);
  });
});
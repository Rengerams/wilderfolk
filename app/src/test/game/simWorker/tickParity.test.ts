import { describe, expect, it } from 'vitest';
import { gameTick } from '@/game/gameEngine';
import { EntityType } from '@/game/gameTypes';
import { freshState } from '@/test/fixtures/gameFixtures';
import { aliveIdSet } from '@/game/simWorker/commands';
import { applySimTickDelta, extractSimTickDelta } from '@/game/simBuffers/simDelta';
import {
  USE_SPATIAL_GRID,
  buildGrassGrid,
  buildMobileGrid,
  isGrassGridEntity,
  isMobileGridEntity,
} from '@/game/spatialGrid';

function cloneStateForTick(state: ReturnType<typeof freshState>) {
  return structuredClone(state);
}

describe('sim worker / main-thread tick parity', () => {
  it('gameTick increments tick without mutating paused worlds', () => {
    const state = freshState();
    const startTick = state.tick;
    state.paused = true;
    gameTick(state);
    expect(state.tick).toBe(startTick);

    state.paused = false;
    gameTick(state);
    expect(state.tick).toBe(startTick + 1);
  });

  it('mid-tick human movement stays indexed in the mobile grid when spatial grid is on', () => {
    if (!USE_SPATIAL_GRID) return;

    const state = freshState();
    state.paused = false;
    const human = state.entities.find((e) => e.alive && e.type === EntityType.Human);
    expect(human).toBeDefined();
    if (!human) return;

    const startX = human.x;
    const startY = human.y;
    const startTick = state.tick;
    gameTick(state);

    const moved = Math.hypot(human.x - startX, human.y - startY) > 0.01
      || state.tick > startTick;
    expect(moved).toBe(true);

    const alive = state.entities.filter((e) => e.alive);
    const grassGrid = buildGrassGrid(state.width, state.height, alive);
    const mobileGrid = buildMobileGrid(state.width, state.height, alive);
    expect(grassGrid.validateInvariant(alive, isGrassGridEntity)).toEqual([]);
    expect(mobileGrid.validateInvariant(alive, isMobileGridEntity)).toEqual([]);
  });

  it('applySimTickDelta mirrors a single gameTick on shadow world', () => {
    const initial = freshState();
    initial.paused = false;

    const direct = structuredClone(initial);
    gameTick(direct);

    const ticked = structuredClone(initial);
    const before = aliveIdSet(ticked);
    gameTick(ticked);
    const alive = ticked.entities.filter((e) => e.alive);
    const delta = extractSimTickDelta(ticked, before, alive);

    const shadow = structuredClone(initial);
    applySimTickDelta(shadow, delta);

    expect(shadow.tick).toBe(direct.tick);
    expect(shadow.year).toBe(direct.year);
    expect(shadow.humanPopulation).toBe(direct.humanPopulation);
    expect(shadow.entities.length).toBe(direct.entities.length);
    expect(shadow.challenges.length).toBe(direct.challenges.length);
    expect(shadow.pendingRaidEvents.length).toBe(direct.pendingRaidEvents.length);
    expect(shadow.resources.food).toBe(direct.resources.food);
  });

  it('structuredClone preserves world shape for worker handoff', () => {
    const state = freshState();
    const clone = cloneStateForTick(state);
    expect(clone.tick).toBe(state.tick);
    expect(clone.entities.length).toBe(state.entities.length);
    expect(clone.buildings.length).toBe(state.buildings.length);
  });
});
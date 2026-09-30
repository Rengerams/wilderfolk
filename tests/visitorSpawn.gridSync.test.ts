/**
 * Visitor and rival humans spawned in the daily layer must go through `pushNewEntity`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnVisitorGroup } from '../src/game/groupEvents';
import { EntitySpatialGrid } from '../src/game/spatialGrid';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

const WIDTH = 1200;
const HEIGHT = 900;

afterEach(() => {
  resetSimRng();
});

describe('visitor spawn and the spatial grid', () => {
  it('indexes visitor members on mobileGrid in the same tick', () => {
    setSimSeed(7);
    const allAlive: Entity[] = [];
    const mobileGrid = new EntitySpatialGrid(WIDTH, HEIGHT, 128);
    const ctx = {
      width: WIDTH,
      height: HEIGHT,
      newEntities: [] as Entity[],
      entityById: new Map(),
      mobileGrid,
    } as unknown as TickContext;
    const state = {
      tick: 72,
      villageName: 'Camp',
      visitorGroups: [],
      rivalSettlements: [],
      nextEntityId: 100,
      width: WIDTH,
      height: HEIGHT,
      buildings: [],
      entities: allAlive,
      eventLog: [],
      notifications: [],
      bigNews: [],
      floatingTexts: [],
      nextFloatingTextId: 1,
    } as unknown as WorldState;

    spawnVisitorGroup(state, allAlive, [], 'traders', ctx);

    expect(ctx.newEntities.length).toBeGreaterThan(0);
    for (const visitor of ctx.newEntities) {
      const found: number[] = [];
      mobileGrid.forEachInRadius(visitor.x, visitor.y, 48, (entity) => found.push(entity.id));
      expect(found).toContain(visitor.id);
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildingType } from '@/game/gameTypes';
import { freshState, makeAdultSettler } from '@/test/fixtures/gameFixtures';
import {
  asLoopInternals,
  flushPromises,
  waitForWorkerLoop,
} from '@/test/helpers/gameLoopTestUtils';

/** Default `npm test` excludes this file — needs `globalThis.Worker` (`npm run test:browser-worker`). */
describe.skipIf(typeof Worker === 'undefined')('GameLoop worker commands', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applyCommand syncs main shadow to worker worldRef after mutation', async () => {
    vi.stubEnv('VITE_USE_GAME_WORKER', '1');
    const { GameLoop } = await import('@/game/gameLoop');

    const state = freshState();
    const settler = makeAdultSettler(1);
    state.entities = [settler];
    state.buildings.push({
      id: 2,
      type: BuildingType.Farm,
      x: 400,
      y: 200,
      width: 80,
      height: 60,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: undefined,
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    const loop = new GameLoop(
      state,
      (await import('@/game/viewState')).createInitialView(state.width, state.height),
      () => null,
    );
    await waitForWorkerLoop(loop);

    const tickBefore = loop.getWorld().tick;
    loop.applyCommand({ proto: 1, op: 'assignWorker', buildingId: 2, humanId: 1 });
    await flushPromises();
    await flushPromises();

    const world = loop.getWorld();
    expect(world.tick).toBe(tickBefore);
    expect(world.entities.find((e) => e.id === 1)?.homeBuildingId).toBe(2);
    expect(world.buildings.find((b) => b.id === 2)?.occupants).toContain(1);
  });

  it('serializes back-to-back applyCommand calls without rejecting the second', async () => {
    vi.stubEnv('VITE_USE_GAME_WORKER', '1');
    const { GameLoop } = await import('@/game/gameLoop');

    const state = freshState();
    const a = makeAdultSettler(1);
    const b = makeAdultSettler(2);
    state.entities = [a, b];
    const farm = {
      id: 10,
      type: BuildingType.Farm,
      x: 400,
      y: 200,
      width: 80,
      height: 60,
      completed: true,
      constructionProgress: 100,
      occupants: [] as number[],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: undefined,
      buildAnimTimer: 0,
      spriteScale: 1,
    };
    const lumber = { ...farm, id: 11, type: BuildingType.LumberMill, x: 500 };
    state.buildings.push(farm, lumber);

    const loop = new GameLoop(
      state,
      (await import('@/game/viewState')).createInitialView(state.width, state.height),
      () => null,
    );
    await waitForWorkerLoop(loop);

    loop.applyCommand({ proto: 1, op: 'assignWorker', buildingId: 10, humanId: 1 });
    loop.applyCommand({ proto: 1, op: 'assignWorker', buildingId: 11, humanId: 2 });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const world = loop.getWorld();
    expect(world.entities.find((e) => e.id === 1)?.homeBuildingId).toBe(10);
    expect(world.entities.find((e) => e.id === 2)?.homeBuildingId).toBe(11);

    loop.stop();
    expect(asLoopInternals(loop).workerEnabled).toBe(false);
  });
});
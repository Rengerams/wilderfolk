import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingType } from '@/game/gameTypes';
import { freshState, makeAdultSettler } from '@/test/fixtures/gameFixtures';
import { flushPromises } from '@/test/helpers/gameLoopTestUtils';

describe('GameLoop (main thread)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_GAME_WORKER', '0');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('notifies listeners when applyCommand mutates world without advancing tick', async () => {
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

    const loop = new GameLoop(state, (await import('@/game/viewState')).createInitialView(state.width, state.height), () => null);
    const tickAtStart = loop.getWorld().tick;

    let commandNotified = false;
    loop.subscribe(() => {
      commandNotified = true;
    });
    commandNotified = false;

    loop.applyCommand({ proto: 1, op: 'assignWorker', buildingId: 2, humanId: 1 });
    await flushPromises();

    expect(loop.getWorld().tick).toBe(tickAtStart);
    expect(loop.getWorld().entities.find((e) => e.id === 1)?.homeBuildingId).toBe(2);
    expect(commandNotified).toBe(true);
  });

  it('rebuilds catalog after assignWorker so UI sees updated homeBuildingId', async () => {
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

    const loop = new GameLoop(state, (await import('@/game/viewState')).createInitialView(state.width, state.height), () => null);
    loop.applyCommand({ proto: 1, op: 'assignWorker', buildingId: 2, humanId: 1 });
    await flushPromises();

    const catalog = loop.getEntityCatalog();
    const entry = catalog.get(1);
    expect(entry?.homeBuildingId).toBe(2);
  });

  it('does not deliver subscribe microtask after stop()', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(0), 0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    const { GameLoop } = await import('@/game/gameLoop');
    const state = freshState();
    const loop = new GameLoop(state, (await import('@/game/viewState')).createInitialView(state.width, state.height), () => null);
    loop.start();

    let notified = false;
    loop.subscribe(() => {
      notified = true;
    });
    loop.stop();
    await flushPromises();

    expect(notified).toBe(false);
  });
});
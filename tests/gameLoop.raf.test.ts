import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/game/gameLoop';
import { initGame } from '../src/game/gameEngine';
import { createInitialView } from '../src/game/viewState';
import { MapSize } from '../src/game/gameTypes';

describe('GameLoop frame chain', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('schedules no frame after stop and exactly one chain after a restart', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id);
    });

    const world = initGame({ villageName: 'Frame chain', size: MapSize.Medium, seed: 12 });
    const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);

    loop.start();
    expect(frames.size).toBe(1);
    const [scheduledId, callback] = [...frames.entries()][0]!;
    frames.delete(scheduledId);

    loop.stop();
    callback(16);
    expect(frames.size).toBe(0);

    loop.start();
    expect(frames.size).toBe(1);
    loop.stop();
  });
});

/**
 * The main-thread fallback must drain the same bounded catch-up budget the worker path uses, so a
 * backlog due when the worker is unavailable is not pinned to one tick per frame.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialView } from '../src/game/viewState';
import { GameLoop } from '../src/game/gameLoop';
import { initGame } from '../src/game/gameEngine';

describe('main-thread fallback catch-up', () => {
  it('runs the due bounded backlog in one frame on the real tick', () => {
    const world = initGame({ skipTerrain: true, villageName: 'Catch-up', size: 'medium', seed: 20_261_112 });
    world.speed = 1;
    world.paused = false;
    const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);
    const internals = loop as unknown as {
      running: boolean;
      workerEnabled: boolean;
      workerBooting: boolean;
      workerImportInFlight: boolean;
      lastFrameTime: number;
      tickAccumulator: number;
      frameBody: (time: number) => void;
    };
    internals.running = true;
    internals.workerEnabled = false;
    internals.workerBooting = false;
    internals.workerImportInFlight = false;
    internals.lastFrameTime = 1_000;
    // Four ticks are already due when the fallback takes over (the worker path caps the debt at 4).
    internals.tickAccumulator = 4_000;
    const startTick = world.tick;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    try {
      internals.frameBody(1_100);
      expect(world.tick, 'the fallback drains the bounded backlog instead of one tick').toBe(startTick + 4);
      expect(internals.tickAccumulator).toBe(0);
    } finally {
      loop.stop();
      vi.unstubAllGlobals();
    }
  });
});

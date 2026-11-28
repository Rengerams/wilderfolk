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

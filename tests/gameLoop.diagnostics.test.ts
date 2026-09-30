import { afterEach, describe, expect, it } from 'vitest';
import { GameLoop } from '../src/game/gameLoop';
import { initGame } from '../src/game/gameEngine';
import { createInitialView } from '../src/game/viewState';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { MapSize } from '../src/game/gameTypes';

const loops: GameLoop[] = [];

afterEach(() => {
  for (const loop of loops.splice(0)) loop.stop();
});

describe('GameLoop diagnostics', () => {
  it('reports the main-thread authority and current world clock without mutating state', () => {
    const world = initGame({ villageName: 'Diagnostics', size: MapSize.Medium, seed: 42 });
    const beforeTick = world.tick;
    const beforePaused = world.paused;
    const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);
    loops.push(loop);

    const diagnostics = loop.getDiagnostics(10_000);

    expect(diagnostics.workerMode).toBe('main-thread');
    expect(diagnostics.workerBooting).toBe(false);
    expect(diagnostics.tick).toBe(beforeTick);
    expect(diagnostics.inGameDay).toBe(Math.floor(beforeTick / TICKS_PER_DAY) + 1);
    expect(diagnostics.hour).toBe(Math.floor((beforeTick % TICKS_PER_DAY) / TICKS_PER_HOUR));
    expect(diagnostics.paused).toBe(beforePaused);
    expect(diagnostics.speed).toBe(world.speed);
    expect(diagnostics.ticksInFlight).toBe(0);
    expect(diagnostics.commandInFlight).toBe(false);
    expect(diagnostics.tickLatencyMs).toBe(0);
    expect(diagnostics.lastWorkerActivityMsAgo).toBeNull();
    expect(world.tick).toBe(beforeTick);
    expect(world.paused).toBe(beforePaused);
  });

  it('reflects pause and speed changes while remaining read-only', () => {
    const world = initGame({ villageName: 'Diagnostics', size: MapSize.Medium, seed: 7 });
    const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);
    loops.push(loop);

    world.paused = true;
    world.speed = 2;
    const diagnostics = loop.getDiagnostics();

    expect(diagnostics.paused).toBe(true);
    expect(diagnostics.speed).toBe(2);
    expect(diagnostics.workerMode).toBe('main-thread');
    expect(diagnostics.tick).toBe(world.tick);
  });
});

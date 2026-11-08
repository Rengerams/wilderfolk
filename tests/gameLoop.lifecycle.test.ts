import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/game/gameLoop';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';

afterEach(() => vi.unstubAllGlobals());

function runningLoop() {
  const world = initGame({ skipTerrain: true, villageName: 'Frame lifecycle' });
  return new GameLoop(world, createInitialView(world.width, world.height), () => null);
}

describe('CB-01: stop/start animation-frame ownership', () => {
  it('stop cancels the active callback and a stale callback cannot resurrect an old chain', () => {
    const frames: Array<(time: number) => void> = [];
    const request = vi.fn((callback: (time: number) => void) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const loop = runningLoop();
    loop.start();
    expect(request).toHaveBeenCalledTimes(1);
    loop.stop();
    expect(cancel).toHaveBeenCalledWith(1);

    frames[0](100);
    expect(request).toHaveBeenCalledTimes(1);
    loop.start();
    expect(request).toHaveBeenCalledTimes(2);

    // A cancelled callback which arrives after a later start still owns the old generation.
    frames[0](150);
    expect(request).toHaveBeenCalledTimes(2);

    frames[1](200);
    expect(request).toHaveBeenCalledTimes(3);
    loop.stop();
    frames[2](250);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('a stop called during frameBody prevents the finally block from scheduling another frame', () => {
    const frames: Array<(time: number) => void> = [];
    const request = vi.fn((callback: (time: number) => void) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const loop = runningLoop();
    const frameBody = vi.spyOn(loop as unknown as { frameBody: (time: number) => void }, 'frameBody')
      .mockImplementation(() => loop.stop());

    loop.start();
    frames[0](100);
    expect(frameBody).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(request).toHaveBeenCalledTimes(1);
    frameBody.mockRestore();
  });
});

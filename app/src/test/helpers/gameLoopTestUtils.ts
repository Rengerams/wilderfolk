import { GameLoop } from '@/game/gameLoop';
import { createInitialView } from '@/game/viewState';
import type { WorldState } from '@/game/gameTypes';

type GameLoopInternals = {
  workerEnabled: boolean;
  workerBooting: boolean;
};

export function asLoopInternals(loop: GameLoop): GameLoopInternals {
  return loop as unknown as GameLoopInternals;
}

export function createTestGameLoop(state: WorldState): GameLoop {
  const view = createInitialView(state.width, state.height);
  return new GameLoop(state, view, () => null);
}

/** Poll until worker init completes or times out (browser Worker required). */
export async function waitForWorkerLoop(loop: GameLoop, timeoutMs = 20_000): Promise<void> {
  const internal = asLoopInternals(loop);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!internal.workerBooting && internal.workerEnabled) return;
    if (!internal.workerBooting && !internal.workerEnabled) {
      throw new Error('GameLoop worker init failed or is disabled');
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('GameLoop worker init timed out');
}

export function flushPromises(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
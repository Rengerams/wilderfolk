import { describe, expect, it } from 'vitest';
import { GameWorkerHost } from '@/game/simWorker/GameWorkerHost';
import { freshState } from '@/test/fixtures/gameFixtures';

/** Default `npm test` excludes this file — needs `globalThis.Worker` (`npm run test:browser-worker`). */
describe.skipIf(typeof Worker === 'undefined')('GameWorkerHost', () => {
  it('initializes and runs a tick on the worker thread', async () => {
    const state = freshState();
    state.paused = false;
    const host = new GameWorkerHost();

    const tickDone = new Promise<boolean>((resolve) => {
      host.setTickResultHandler((_world, _delta, _render, changed) => {
        resolve(changed);
      });
    });

    await host.init(state);
    expect(host.isReady()).toBe(true);

    host.requestTick();
    const changed = await tickDone;
    expect(changed).toBe(true);

    host.dispose();
  }, 20000);
});
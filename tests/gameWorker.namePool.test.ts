/**
 * The simulation worker must name settlers from the **same pool** the host does.
 *
 * `nameLoader` installs a ~60-name embedded pool synchronously at module import and swaps in the full
 * census when its async load lands; `pickFrom` indexes whichever pool is installed *at that instant*.
 * The worker used to start that load without awaiting it, so a name drawn before the swap mapped the
 * same seeded draw to a different element — one seed, two worlds, and the name is saved state
 * (`saveSchema.ts`, `entities`). `App.tsx` already awaits the load before `initGame`; the worker did
 * not, which made the divergence depend on chunk timing.
 *
 * Two notes on how this is proven, because the obvious version of this test passes either way:
 *
 * 1. V8 caches dynamically imported modules for the process, so `vi.resetModules()` gives the "second
 *    realm" the *same* `nameLoader` instance — a realm that is supposed to be fresh already reads the
 *    census. `resetNamePoolForTest()` exists for exactly that (see its doc comment).
 * 2. The draw has to happen while the load is in flight, which is the only window the contract is
 *    about, so the case reaches the worker's gate and reads the pool **without awaiting** it — the
 *    embedded state a real worker is in at boot.
 *
 * The worker module registers itself on `self` at import, so the tiny `self` shim the other worker
 * cases use is installed before it is imported.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  areNamesLoaded,
  ensureNamesLoaded,
  getRandomSurname,
  getNamePoolInfo,
  loadNames,
  resetNamePoolForTest,
} from '../src/game/nameLoader';
import { resetSimRng } from '../src/game/simRng';

/** The embedded list's length, from `nameLoader`'s own fallback constant. */
const EMBEDDED_LAST_COUNT = 60;

/** The `self` the worker module registers its handlers on when it is imported. */
function installWorkerSelf(): void {
  (globalThis as { self?: unknown }).self = {
    onmessage: null,
    onerror: null,
    onunhandledrejection: null,
    postMessage: () => {},
  };
}

afterEach(() => {
  resetSimRng();
  resetNamePoolForTest();
  vi.unstubAllGlobals();
  delete (globalThis as { self?: unknown }).self;
});

describe('the worker draws names from a settled pool', () => {
  it('is in the embedded-pool state at import, so the draw below is the one that used to diverge', () => {
    resetNamePoolForTest();
    ensureNamesLoaded();

    // If this ever stops being true the case below stops testing the race and starts testing nothing.
    expect(areNamesLoaded(), 'the seam must stand the module at its import-time state').toBe(false);
  });

  it('settles the pool at its message gate, before the first draw the burst can reach', async () => {
    installWorkerSelf();
    const { ensureNamePoolSettled } = await import('../src/game/simWorker/gameWorker');
    resetNamePoolForTest();

    // The gate is called on every message (the worker's `self.onmessage`) and hands back the concrete
    // promise the handler awaits. Reading it without awaiting reproduces the pre-fix window exactly:
    // a message is being handled and the load has not landed.
    const settling = ensureNamePoolSettled();
    expect(settling, 'the gate must hand back a promise the handler can await').toBeInstanceOf(Promise);
    expect(areNamesLoaded(), 'the load cannot have landed synchronously').toBe(false);

    await settling;

    // Once the gate resolves, every later draw — the only ones a burst of pipelined ticks can reach —
    // indexes the same census pool the host indexes.
    expect(areNamesLoaded(), 'the gate must settle the pool before returning').toBe(true);
    const surname = getRandomSurname();
    expect(typeof surname).toBe('string');
    expect(surname.length).toBeGreaterThan(0);
  });

  it('settles once, so a second caller waits instead of restarting the load', async () => {
    installWorkerSelf();
    const { ensureNamePoolSettled } = await import('../src/game/simWorker/gameWorker');
    resetNamePoolForTest();

    const first = ensureNamePoolSettled();
    const second = ensureNamePoolSettled();
    expect(first, 'the gate must reuse the in-flight load rather than start a second').toBe(second);
  });

  it('cannot be mistaken for the embedded pool: the two pools have different sizes', async () => {
    // The differential that gives the case above its meaning. If the census ever shrank to the
    // embedded list, "the pool is settled" would stop being observable through a draw.
    resetNamePoolForTest();
    ensureNamesLoaded();
    expect(getNamePoolInfo().full).toBe(false);
    await loadNames();
    const full = getNamePoolInfo();
    expect(full.full).toBe(true);
    expect(full.last).toBeGreaterThan(EMBEDDED_LAST_COUNT);
  });
});


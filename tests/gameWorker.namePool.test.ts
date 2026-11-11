/**
 * The simulation worker must name settlers from the same pool the host does: the
 * message gate settles `nameLoader` before any draw.
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

    // The gate runs on every message and returns the load promise the handler awaits;
    // without awaiting, the draw happens before the load lands.
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


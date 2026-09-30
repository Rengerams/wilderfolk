import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { persistGame } from '../src/hooks/useGamePersistence';
import { createInitialView } from '../src/game/viewState';

const { saveGameMock } = vi.hoisted(() => ({
  saveGameMock: vi.fn(),
}));

vi.mock('../src/game/gameEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/gameEngine')>();
  return {
    ...actual,
    saveGame: saveGameMock,
  };
});

describe('persistGame', () => {
  beforeEach(() => {
    saveGameMock.mockReset();
  });

  it('saves the worker-authoritative world and preserves the manual-save feedback', async () => {
    const displayWorld = initGame({ villageName: 'Display copy' });
    const authoritativeWorld = initGame({ villageName: 'Authoritative world' });
    const view = createInitialView(authoritativeWorld.width, authoritativeWorld.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    saveGameMock.mockReturnValue({ success: true });
    const loop = {
      exportAuthoritativeWorld: async () => authoritativeWorld,
      getView: () => view,
      getWorld: () => authoritativeWorld,
      mutateWorld: (mutator: (world: WorldState) => void) => mutator(authoritativeWorld),
    };

    const saved = await persistGame(
      {
        getLoop: () => loop,
        getWorld: () => displayWorld,
        getView: () => view,
      },
      { markGameSaved, showToast },
      { chronicle: false, feedback: true },
    );

    expect(saved).toBe(true);
    expect(saveGameMock).toHaveBeenCalledWith(authoritativeWorld, view);
    expect(markGameSaved).toHaveBeenCalledOnce();
    expect(authoritativeWorld.floatingTexts).toContainEqual(expect.objectContaining({ text: 'Game Saved! 💾' }));
    expect(displayWorld.floatingTexts).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith({ message: 'Game saved successfully', type: 'success' });
  });

  it('does not save or report success when neither the loop nor display state supplies a view', async () => {
    const world = initGame();
    const showToast = vi.fn();
    const markGameSaved = vi.fn();

    const saved = await persistGame(
      {
        getLoop: () => null,
        getWorld: () => world,
        getView: () => null,
      },
      { markGameSaved, showToast },
    );

    expect(saved).toBe(false);
    expect(saveGameMock).not.toHaveBeenCalled();
    expect(markGameSaved).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('keeps autosave-style persistence silent while still saving the authoritative snapshot', async () => {
    const authoritativeWorld = initGame({ villageName: 'Silent autosave' });
    const view = createInitialView(authoritativeWorld.width, authoritativeWorld.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    saveGameMock.mockReturnValue({ success: true });
    const loop = {
      exportAuthoritativeWorld: async () => authoritativeWorld,
      getView: () => view,
      getWorld: () => authoritativeWorld,
      mutateWorld: (mutator: (world: WorldState) => void) => mutator(authoritativeWorld),
    };

    const saved = await persistGame(
      {
        getLoop: () => loop,
        getWorld: () => initGame({ villageName: 'Stale display copy' }),
        getView: () => view,
      },
      { markGameSaved, showToast },
      { chronicle: false, feedback: false },
    );

    expect(saved).toBe(true);
    expect(saveGameMock).toHaveBeenCalledWith(authoritativeWorld, view);
    expect(markGameSaved).toHaveBeenCalledOnce();
    expect(authoritativeWorld.floatingTexts).toHaveLength(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('reports the existing error and leaves saved state unchanged when persistence fails', async () => {
    const world = initGame();
    const view = createInitialView(world.width, world.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    saveGameMock.mockReturnValue({ success: false, error: 'Storage full' });

    const saved = await persistGame(
      {
        getLoop: () => null,
        getWorld: () => world,
        getView: () => view,
      },
      { markGameSaved, showToast },
    );

    expect(saved).toBe(false);
    expect(markGameSaved).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({ message: 'Storage full', type: 'error' });
  });

  /**
   * D-7 of the 2026-09-21 audit. The worker allows one export in flight; a second save used to reach
   * it, be rejected, and fall back to the **display shadow** — writing a world up to
   * `MAX_PIPELINE_DEPTH` ticks behind while reporting success. The second save now joins the first.
   */
  it('coalesces a second save onto the one already in flight', async () => {
    const world = initGame({ villageName: 'Coalesced' });
    const view = createInitialView(world.width, world.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    saveGameMock.mockReturnValue({ success: true });

    // Hold the export open so the overlap is real rather than a race the test hopes to win.
    let releaseExport = (): void => {};
    const exportGate = new Promise<void>((resolve) => {
      releaseExport = resolve;
    });
    const exportAuthoritativeWorld = vi.fn(async () => {
      await exportGate;
      return world;
    });
    const loop = {
      exportAuthoritativeWorld,
      getView: () => view,
      getWorld: () => world,
      mutateWorld: (mutator: (w: WorldState) => void) => mutator(world),
    };

    const accessors = {
      getLoop: () => loop,
      getWorld: () => world,
      getView: () => view,
    };

    const first = persistGame(accessors, { markGameSaved, showToast });
    // Started while the first is still exporting: the autosave + Ctrl+S shape.
    const second = persistGame(accessors, { markGameSaved, showToast });

    releaseExport();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    // One export, one write: the second caller waited for the first instead of asking again.
    expect(exportAuthoritativeWorld).toHaveBeenCalledOnce();
    expect(saveGameMock).toHaveBeenCalledOnce();
  });

  it('allows a later save after the in-flight one settles', async () => {
    const world = initGame({ villageName: 'Sequential' });
    const view = createInitialView(world.width, world.height);
    saveGameMock.mockReturnValue({ success: true });
    const loop = {
      exportAuthoritativeWorld: vi.fn(async () => world),
      getView: () => view,
      getWorld: () => world,
      mutateWorld: (mutator: (w: WorldState) => void) => mutator(world),
    };
    const accessors = {
      getLoop: () => loop,
      getWorld: () => world,
      getView: () => view,
    };

    await persistGame(accessors, { markGameSaved: vi.fn(), showToast: vi.fn() });
    await persistGame(accessors, { markGameSaved: vi.fn(), showToast: vi.fn() });

    // The guard is cleared in a `finally`, so a second save later in the session is not blocked.
    expect(loop.exportAuthoritativeWorld).toHaveBeenCalledTimes(2);
  });

  it('allows a retry after a failed save', async () => {
    const world = initGame({ villageName: 'Retry' });
    const view = createInitialView(world.width, world.height);
    saveGameMock.mockReturnValueOnce({ success: false, error: 'Storage full' });
    saveGameMock.mockReturnValueOnce({ success: true });
    const loop = {
      exportAuthoritativeWorld: vi.fn(async () => world),
      getView: () => view,
      getWorld: () => world,
      mutateWorld: (mutator: (w: WorldState) => void) => mutator(world),
    };
    const accessors = {
      getLoop: () => loop,
      getWorld: () => world,
      getView: () => view,
    };

    const failed = await persistGame(accessors, { markGameSaved: vi.fn(), showToast: vi.fn() });
    const retried = await persistGame(accessors, { markGameSaved: vi.fn(), showToast: vi.fn() });

    expect(failed).toBe(false);
    expect(retried).toBe(true);
  });
});

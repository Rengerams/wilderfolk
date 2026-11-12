import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { persistGame, saveImportSizeRefusal, MAX_SAVE_IMPORT_BYTES } from '../src/hooks/useGamePersistence';
import { createInitialView } from '../src/game/viewState';

const { saveGameMock, saveGameToSlotMock } = vi.hoisted(() => ({
  saveGameMock: vi.fn(),
  saveGameToSlotMock: vi.fn(),
}));

vi.mock('../src/game/gameEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/gameEngine')>();
  return {
    ...actual,
    saveGame: saveGameMock,
    saveGameToSlot: saveGameToSlotMock,
  };
});

describe('persistGame', () => {
  beforeEach(() => {
    saveGameMock.mockReset();
    saveGameToSlotMock.mockReset();
  });

  it('saves the worker-authoritative world and preserves the manual-save feedback', async () => {
    const displayWorld = initGame({ skipTerrain: true, villageName: 'Display copy' });
    const authoritativeWorld = initGame({ skipTerrain: true, villageName: 'Authoritative world' });
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

  it('refuses a degraded worker export instead of overwriting upgraded buildings', async () => {
    const staleWorld = initGame({ skipTerrain: true, villageName: 'Stale copy' });
    const view = createInitialView(staleWorld.width, staleWorld.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    const loop = {
      exportAuthoritativeWorld: async () => staleWorld,
      lastExportWasDegraded: () => true,
      getView: () => view,
      getWorld: () => staleWorld,
      mutateWorld: (mutator: (world: WorldState) => void) => mutator(staleWorld),
    };
    expect(await persistGame(
      { getLoop: () => loop, getWorld: () => staleWorld, getView: () => view },
      { markGameSaved, showToast },
      { feedback: true },
    )).toBe(false);
    expect(saveGameMock).not.toHaveBeenCalled();
    expect(saveGameToSlotMock).not.toHaveBeenCalled();
    expect(markGameSaved).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('does not save or report success when neither the loop nor display state supplies a view', async () => {
    const world = initGame({ skipTerrain: true });
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

  it('keeps a silent save from toasting while still saving the authoritative snapshot', async () => {
    const authoritativeWorld = initGame({ skipTerrain: true, villageName: 'Silent autosave' });
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
        getWorld: () => initGame({ skipTerrain: true, villageName: 'Stale display copy' }),
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

  it('the exit save writes the slot and never downloads (background path)', async () => {
    const authoritativeWorld = initGame({ skipTerrain: true, villageName: 'Exit save' });
    const view = createInitialView(authoritativeWorld.width, authoritativeWorld.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    saveGameToSlotMock.mockReturnValue({ success: true });
    const loop = {
      exportAuthoritativeWorld: async () => authoritativeWorld,
      getView: () => view,
      getWorld: () => authoritativeWorld,
      mutateWorld: (mutator: (world: WorldState) => void) => mutator(authoritativeWorld),
    };

    const saved = await persistGame(
      {
        getLoop: () => loop,
        getWorld: () => authoritativeWorld,
        getView: () => view,
      },
      { markGameSaved, showToast },
      { chronicle: false, feedback: false, background: true },
    );

    expect(saved).toBe(true);
    expect(saveGameToSlotMock).toHaveBeenCalledWith(authoritativeWorld, view);
    expect(saveGameMock).not.toHaveBeenCalled();
  });

  it('reports the existing error and leaves saved state unchanged when persistence fails', async () => {
    const world = initGame({ skipTerrain: true });
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
   * The worker allows one export in flight, but a manual save still owes the player a download and a
   * toast: it queues behind the background save instead of being answered by it.
   */
  it('queues a manual save behind a background save so it still downloads and toasts', async () => {
    const world = initGame({ skipTerrain: true, villageName: 'Queued manual save' });
    const view = createInitialView(world.width, world.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    saveGameMock.mockReturnValue({ success: true });
    saveGameToSlotMock.mockReturnValue({ success: true });

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

    const background = persistGame(
      accessors,
      { markGameSaved, showToast },
      { background: true, feedback: false },
    );
    // Started while the background save is still exporting: the exit-save + Ctrl+S shape.
    const manual = persistGame(accessors, { markGameSaved, showToast }, { feedback: true });

    releaseExport();
    const [backgroundResult, manualResult] = await Promise.all([background, manual]);

    expect(backgroundResult).toBe(true);
    expect(manualResult).toBe(true);
    expect(exportAuthoritativeWorld).toHaveBeenCalledTimes(2);
    expect(saveGameToSlotMock).toHaveBeenCalledOnce();
    expect(saveGameMock).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledWith({ message: 'Game saved successfully', type: 'success' });
  });

  it('lets a background save share the in-flight manual save', async () => {
    const world = initGame({ skipTerrain: true, villageName: 'Shared save' });
    const view = createInitialView(world.width, world.height);
    saveGameMock.mockReturnValue({ success: true });
    const exportAuthoritativeWorld = vi.fn(async () => world);
    const loop = {
      exportAuthoritativeWorld,
      getView: () => view,
      getWorld: () => world,
      mutateWorld: (mutator: (w: WorldState) => void) => mutator(world),
    };
    const accessors = { getLoop: () => loop, getWorld: () => world, getView: () => view };
    const callbacks = { markGameSaved: vi.fn(), showToast: vi.fn() };

    const manual = persistGame(accessors, callbacks);
    const background = persistGame(accessors, callbacks, { background: true, feedback: false });
    expect(await Promise.all([manual, background])).toEqual([true, true]);
    expect(exportAuthoritativeWorld).toHaveBeenCalledOnce();
    expect(saveGameMock).toHaveBeenCalledOnce();
    expect(saveGameToSlotMock).not.toHaveBeenCalled();
  });

  it('joins a failed overlapping export, then allows one clean retry (COV-B-02)', async () => {
    const world = initGame({ skipTerrain: true, villageName: 'Failed overlap' });
    const view = createInitialView(world.width, world.height);
    const showToast = vi.fn();
    const markGameSaved = vi.fn();
    let releaseExport = (): void => {};
    const gate = new Promise<void>((resolve) => { releaseExport = resolve; });
    const exportAuthoritativeWorld = vi.fn(async () => {
      await gate;
      return world;
    });
    const loop = {
      exportAuthoritativeWorld,
      getView: () => view,
      getWorld: () => world,
      mutateWorld: (_mutator: (world: WorldState) => void) => undefined,
    };
    const accessors = {
      getLoop: () => loop,
      getWorld: () => world,
      getView: () => view,
    };
    const callbacks = { markGameSaved, showToast };
    saveGameMock.mockReturnValueOnce({ success: false, error: 'Quota exceeded' });
    saveGameMock.mockReturnValueOnce({ success: true });

    const first = persistGame(accessors, callbacks);
    const joined = persistGame(accessors, callbacks, { background: true });
    releaseExport();
    expect(await Promise.all([first, joined])).toEqual([false, false]);
    expect(exportAuthoritativeWorld).toHaveBeenCalledTimes(1);
    expect(saveGameMock).toHaveBeenCalledTimes(1);
    expect(saveGameToSlotMock).not.toHaveBeenCalled();
    expect(markGameSaved).not.toHaveBeenCalled();

    expect(await persistGame(accessors, callbacks)).toBe(true);
    expect(exportAuthoritativeWorld).toHaveBeenCalledTimes(2);
    expect(saveGameMock).toHaveBeenCalledTimes(2);
    expect(markGameSaved).toHaveBeenCalledTimes(1);
  });

  it('allows a later save after the in-flight one settles', async () => {
    const world = initGame({ skipTerrain: true, villageName: 'Sequential' });
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
    const world = initGame({ skipTerrain: true, villageName: 'Retry' });
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

  it('refuses an imported save that is over the size cap before it is read', () => {
    // The cap is a memory guard for the file read plus its parsed copy, not a save-content rule.
    expect(saveImportSizeRefusal(MAX_SAVE_IMPORT_BYTES)).toBeNull();
    const refusal = saveImportSizeRefusal(MAX_SAVE_IMPORT_BYTES + 1);
    expect(refusal).toContain('64 MB');
    expect(refusal).toContain('imports saves up to');
  });
});

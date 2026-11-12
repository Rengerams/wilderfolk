import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import {
  persistGame,
  persistGameOnPageHide,
  waitForPendingSave,
} from '../src/hooks/useGamePersistence';
import { clearColonySessionState, clearTransientBuildView } from '../src/hooks/useGameSession';
import { BuildingType } from '../src/game/gameTypes';
import { soundDirector } from '../src/audio';

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

describe('leaving a colony persists and resets its session', () => {
  beforeEach(() => {
    saveGameMock.mockReset();
    saveGameToSlotMock.mockReset();
  });

  afterEach(async () => {
    await waitForPendingSave();
    vi.restoreAllMocks();
  });

  it('the pagehide write uses the loop world and marks a worker-owned snapshot best-effort', () => {
    const world = initGame({ skipTerrain: true, villageName: 'Page exit' });
    const view = createInitialView(world.width, world.height);
    saveGameToSlotMock.mockReturnValue({ success: true });

    const makeLoop = (usingWorker: boolean) => ({
      exportAuthoritativeWorld: async () => world,
      getView: () => view,
      getWorld: () => world,
      isUsingSimWorker: () => usingWorker,
      mutateWorld: (mutator: (w: WorldState) => void) => mutator(world),
    });
    const accessors = (usingWorker: boolean) => ({
      getLoop: () => makeLoop(usingWorker),
      getWorld: () => world,
      getView: () => view,
    });

    expect(persistGameOnPageHide(accessors(true))).toEqual({
      written: true,
      authoritative: false,
    });
    expect(saveGameToSlotMock).toHaveBeenCalledWith(world, view);

    expect(persistGameOnPageHide(accessors(false))).toEqual({
      written: true,
      authoritative: true,
    });
    expect(saveGameToSlotMock).toHaveBeenCalledTimes(2);
  });

  it('respects the save-on-leave preference at page exit', () => {
    const world = initGame({ skipTerrain: true, villageName: 'Auto-save off' });
    world.autoSave = false;
    const view = createInitialView(world.width, world.height);
    const loop = {
      exportAuthoritativeWorld: async () => world,
      getView: () => view,
      getWorld: () => world,
      mutateWorld: (mutator: (w: WorldState) => void) => mutator(world),
    };

    expect(persistGameOnPageHide({
      getLoop: () => loop,
      getWorld: () => world,
      getView: () => view,
    })).toEqual({ written: false, authoritative: true });
    expect(saveGameToSlotMock).not.toHaveBeenCalled();
  });

  it('a leave save and the unmount save that joins it write the slot once', async () => {
    const world = initGame({ skipTerrain: true, villageName: 'One exit save' });
    const view = createInitialView(world.width, world.height);
    saveGameToSlotMock.mockReturnValue({ success: true });

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
    const callbacks = { markGameSaved: vi.fn(), showToast: vi.fn() };

    // The session stop saves first; the persistence unmount fallback joins the same save.
    const leaveSave = persistGame(accessors, callbacks, { background: true, feedback: false });
    const unmountSave = persistGame(accessors, callbacks, { background: true, feedback: false });

    releaseExport();
    expect(await Promise.all([leaveSave, unmountSave])).toEqual([true, true]);
    expect(exportAuthoritativeWorld).toHaveBeenCalledOnce();
    expect(saveGameToSlotMock).toHaveBeenCalledOnce();
    expect(saveGameToSlotMock).toHaveBeenCalledWith(world, view);
  });

  it('a new colony clears the previous colony UI and stops its audio', () => {
    const stopAll = vi.spyOn(soundDirector, 'stopAll');
    const setBattleReport = vi.fn();
    const setCampaignActive = vi.fn();
    const setFamilyTreeFor = vi.fn();
    const setHasPlacedHouse = vi.fn();
    const setSelectedBuildingType = vi.fn();
    const setWorkHoursOpen = vi.fn();
    const cancelStripDemolition = vi.fn();

    clearColonySessionState({
      cancelStripDemolition,
      setBattleReport,
      setCampaignActive,
      setFamilyTreeFor,
      setHasPlacedHouse,
      setSelectedBuildingType,
      setWorkHoursOpen,
    });

    expect(setSelectedBuildingType).toHaveBeenCalledWith(null);
    expect(setHasPlacedHouse).toHaveBeenCalledWith(false);
    expect(setFamilyTreeFor).toHaveBeenCalledWith(null);
    expect(setBattleReport).toHaveBeenCalledWith(null);
    expect(setWorkHoursOpen).toHaveBeenCalledWith(false);
    expect(setCampaignActive).toHaveBeenCalledWith(false);
    expect(cancelStripDemolition).toHaveBeenCalledOnce();
    expect(stopAll).toHaveBeenCalledOnce();
    // Clears state only: the exit save stays with the session-stop owner, not a second scheduler.
    expect(saveGameMock).not.toHaveBeenCalled();
    expect(saveGameToSlotMock).not.toHaveBeenCalled();
  });

  it('an entering session starts with no build mode', () => {
    const world = initGame({ skipTerrain: true });
    const view = {
      ...createInitialView(world.width, world.height),
      buildMode: BuildingType.Farm,
      buildGhost: { x: 12, y: 8, valid: false, reason: 'blocked' } as const,
      buildStripPreview: { segments: [], rotation: 0 as const, demolition: true },
      buildRotation: 90 as const,
    };

    const next = clearTransientBuildView(view);

    expect(next.buildMode).toBeNull();
    expect(next.buildGhost).toBeNull();
    expect(next.buildStripPreview).toBeNull();
    expect(next.buildRotation).toBe(0);
    // The loaded camera/selection survive: only the transient placement affordance is cleared.
    expect(next.camera).toBe(view.camera);
  });
});

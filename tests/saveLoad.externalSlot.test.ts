/**
 * The browser-slot ruling: a colony too big for the one slot is saved externally, and says why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { resetSimRng } from '../src/game/simRng';
import {
  BROWSER_SLOT_BUDGET_BYTES,
  buildSaveData,
  decideSaveRoute,
  describeCadenceFileSave,
  describeFileSaveReason,
  downloadSaveFile,
  hasSaveSlot,
  hasImportedSave,
  loadGameFromFileTextOutcome,
  loadImportedGameOutcome,
  readSavePayload,
  saveGame,
  saveGameToSlot,
  saveImportedFileToSlot,
  executeConfirmedColonyLoad,
} from '../src/game/saveLoad';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

function colony(size: MapSize = MapSize.Medium): WorldState {
  resetSimRng();
  return initGame({ villageName: 'Ruling Valley', size });
}

beforeEach(() => {
  resetSimRng();
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  resetSimRng();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('UX-01: confirmed load contract', () => {
  it('cancel protects the running world and leaves the in-flight guard reusable', () => {
    const guard = { current: false };
    const confirm = vi.fn(() => false);
    const mutateWorld = vi.fn();
    expect(executeConfirmedColonyLoad(true, guard, confirm, mutateWorld)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(mutateWorld).not.toHaveBeenCalled();
    expect(guard.current).toBe(false);

    expect(executeConfirmedColonyLoad(false, guard, confirm, mutateWorld)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(mutateWorld).toHaveBeenCalledOnce();
    expect(guard.current).toBe(false);
  });

  it('confirmed loading runs once; a re-entrant click is ignored', () => {
    const guard = { current: false };
    const confirm = vi.fn(() => true);
    const callback = vi.fn(() => {
      expect(executeConfirmedColonyLoad(true, guard, confirm, vi.fn())).toBe(false);
    });
    expect(executeConfirmedColonyLoad(true, guard, confirm, callback)).toBe(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(guard.current).toBe(false);
  });

  it('releases the lock if the load throws', () => {
    const guard = { current: false };
    expect(() => executeConfirmedColonyLoad(false, guard, () => true, () => {
      throw new Error('corrupt load');
    })).toThrow('corrupt load');
    expect(guard.current).toBe(false);
  });
});

describe('a colony too big for the browser slot saves externally', () => {
  it('writes no slot entry for a Large map and names the file path with its reason', () => {
    const world = colony(MapSize.Large);
    const result = saveGame(world, createInitialView(world.width, world.height));

    expect(result).toEqual({ success: true, fileReason: 'map-too-large' });
    expect(hasSaveSlot()).toBe(false);
    expect(describeFileSaveReason('map-too-large')).toContain('Load from file');
  });

  it('refuses the slot for any payload past the budget, naming the reason', () => {
    const world = colony();
    // The chronicle cap itself: 20 000 lines is what walks a colony's payload toward the quota.
    world.eventLog = Array.from({ length: 20_000 }, (_, i) => ({
      id: i,
      tick: i,
      year: 1,
      day: 1,
      type: 'event' as const,
      message: 'a chronicle line '.repeat(8),
    }));
    const view = createInitialView(world.width, world.height);
    const json = JSON.stringify(buildSaveData(world, view));

    expect(json.length * 2).toBeGreaterThan(BROWSER_SLOT_BUDGET_BYTES);
    expect(decideSaveRoute(world, json)).toEqual({ target: 'file', reason: 'payload-too-large' });
    // A save with no user gesture behind it refuses too, rather than downloading on a timer.
    const result = saveGameToSlot(world, view);
    expect(result).toEqual({
      success: false,
      error: describeCadenceFileSave('payload-too-large'),
      fileReason: 'payload-too-large',
    });
    expect(hasSaveSlot()).toBe(false);
  });

  it('still writes the slot for a Medium colony inside the budget', () => {
    const world = colony();
    const result = saveGame(world, createInitialView(world.width, world.height));

    expect(result).toEqual({ success: true });
    expect(hasSaveSlot()).toBe(true);
    expect(readSavePayload().valid).toBe(true);
  });

  it('a manual save downloads even when the slot is full, reporting the slot as unwritten', () => {
    const world = colony();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {},
    });
    const result = saveGame(world, createInitialView(world.width, world.height));

    // The manual save exports the file regardless; the slot write is a bonus that reports its own failure.
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('slotWarning');
    expect(result).not.toHaveProperty('fileReason');
  });

  it('keeps the genuine slot-full warning for a slot write that was attempted and refused', () => {
    const world = colony();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {},
    });
    const result = downloadSaveFile(world, createInitialView(world.width, world.height));

    expect(result.success).toBe(true);
    expect(result).toHaveProperty('slotWarning');
    expect(result).not.toHaveProperty('fileReason');
  });

  it('keeps a pre-existing quick-save byte-for-byte when importing another colony', () => {
    const quick = colony();
    quick.villageName = 'My original quick-save';
    expect(saveGameToSlot(quick, createInitialView(quick.width, quick.height)).success).toBe(true);
    const original = localStorage.getItem('ecosim_save');
    expect(original).toBeTruthy();

    const imported = colony();
    imported.villageName = 'Imported Valley';
    const fileJson = JSON.stringify(buildSaveData(
      imported, createInitialView(imported.width, imported.height),
    ));
    expect(saveImportedFileToSlot(fileJson, imported).success).toBe(true);
    expect(localStorage.getItem('ecosim_save')).toBe(original);
    expect(localStorage.getItem('ecosim_imported_save')).toBe(fileJson);
    expect(hasImportedSave()).toBe(true);

    const recovered = loadImportedGameOutcome();
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.world.villageName).toBe('Imported Valley');
    expect(localStorage.getItem('ecosim_save')).toBe(original);
  });

  it('refuses to copy an overlarge import without disturbing either browser slot', () => {
    const quick = colony();
    expect(saveGameToSlot(quick, createInitialView(quick.width, quick.height)).success).toBe(true);
    const original = localStorage.getItem('ecosim_save');
    const imported = colony(MapSize.Large);
    const result = saveImportedFileToSlot('{"_version":"ignored"}', imported);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('fileReason', 'map-too-large');
    expect(localStorage.getItem('ecosim_save')).toBe(original);
    expect(hasImportedSave()).toBe(false);
  });

  it('round-trips a colony through the file text a download would carry', () => {
    const world = colony();
    world.villageName = 'File Valley';
    const json = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));

    const outcome = loadGameFromFileTextOutcome(json);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.villageName).toBe('File Valley');
    expect(outcome.world.entities.length).toBeGreaterThan(0);
  });
});

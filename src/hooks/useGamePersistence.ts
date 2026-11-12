import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { saveGame, saveGameToSlot, describeFileSaveReason } from '../game/gameEngine';
import type { WorldState } from '../game/gameEngine';
import { downloadChronicleLog, loadExportChronicleOnSave } from '../game/eventLogExport';
import { GameLoop } from '../game/gameLoop';
import { isCrashRecoveryActive } from '../components/GameErrorBoundary';
import type { ViewState } from '../game/viewState';

/**
 * A colony only the file path can hold: the exit save stands down for it and says so once.
 */
let slotRefusingNoticeShown = false;

export interface SaveToast {
  message: string;
  /**
   * `warning` = the action partly succeeded. Used when a save reaches a file but the browser slot
   * could not be written, which the player must know because Load will not see it.
   */
  type: 'success' | 'warning' | 'error';
}

export interface PersistCurrentGameOptions {
  chronicle?: boolean;
  feedback?: boolean;
  /** A save with no user gesture behind it (the exit save): never triggers a file download. */
  background?: boolean;
}

type PersistenceLoop = Pick<
  GameLoop,
  'exportAuthoritativeWorld' | 'getView' | 'getWorld' | 'mutateWorld'
> & {
  /** Optional so a test double that only exports a world still satisfies the contract. */
  lastExportWasDegraded?: () => boolean;
  /** Optional so a test double need not model worker mode. */
  isUsingSimWorker?: () => boolean;
};

/** What a page-exit write managed to persist, and whether it was the authoritative world. */
export interface PageHideSaveOutcome {
  written: boolean;
  /** False when a worker owned the newest state, so only the main-thread shadow could be written. */
  authoritative: boolean;
}

export interface GamePersistenceAccessors {
  getLoop: () => PersistenceLoop | null;
  getWorld: () => WorldState;
  getView: () => ViewState | null;
}

export interface PersistGameCallbacks {
  markGameSaved: () => void;
  showToast: (toast: SaveToast) => void;
}

export interface UseGamePersistenceOptions {
  loopRef: RefObject<GameLoop | null>;
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
  onGameSaved: () => void;
}

/**
 * The save currently running, if any. Saves serialize because the worker has one export slot; a
 * background save joins an in-flight one, while a manual save always runs its own write.
 */
let saveInFlight: Promise<boolean> | null = null;

/** Largest imported save this build reads — beyond it the file is refused before it is loaded. */
export const MAX_SAVE_IMPORT_BYTES = 64 * 1024 * 1024;

/**
 * The refusal for an imported save too large to read safely, or null when it may be read. Text plus
 * its parsed copy multiply in memory, so the size is checked before the file is loaded.
 */
export function saveImportSizeRefusal(sizeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= MAX_SAVE_IMPORT_BYTES) return null;
  const megabytes = (sizeBytes / (1024 * 1024)).toFixed(1);
  const limit = MAX_SAVE_IMPORT_BYTES / (1024 * 1024);
  return `That save file is ${megabytes} MB — Wilderfolk imports saves up to ${limit} MB. Load a save this build exported.`;
}

/**
 * Persists the authoritative game snapshot.
 * Coordinates directly with the web worker / GameLoop to guarantee authoritative state.
 */
export async function persistGame(
  accessors: GamePersistenceAccessors,
  callbacks: PersistGameCallbacks,
  options?: PersistCurrentGameOptions,
): Promise<boolean> {
  // A background save may share an in-flight write; a manual save owes the player its own download
  // and toast, so it queues behind the in-flight save instead of joining it.
  if (saveInFlight && (options?.background ?? false)) return saveInFlight;

  const previous = saveInFlight ?? Promise.resolve(true);
  const run = previous
    .catch(() => false)
    .then(() => persistGameOnce(accessors, callbacks, options));
  saveInFlight = run;
  try {
    return await run;
  } finally {
    // Only the newest queued save clears the guard, so a queue of manual saves stays serialized.
    if (saveInFlight === run) saveInFlight = null;
  }
}

/**
 * Waits for the save already running, so a caller that replaces or deletes the slot can order
 * itself after it instead of racing it.
 */
export function waitForPendingSave(): Promise<void> {
  if (!saveInFlight) return Promise.resolve();
  return saveInFlight.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Synchronous page-exit write. A worker export cannot complete before the page dies, so this uses
 * the loop's current world and reports that write as best-effort when a worker owns the newest state.
 */
export function persistGameOnPageHide(
  accessors: GamePersistenceAccessors,
): PageHideSaveOutcome {
  const loop = accessors.getLoop();
  if (!loop || isCrashRecoveryActive() || !loop.getWorld().autoSave) {
    return { written: false, authoritative: true };
  }
  const view = loop.getView();
  if (!view) return { written: false, authoritative: true };
  const result = saveGameToSlot(loop.getWorld(), view);
  return {
    written: result.success,
    authoritative: result.success && !(loop.isUsingSimWorker?.() ?? false),
  };
}

async function persistGameOnce(
  accessors: GamePersistenceAccessors,
  callbacks: PersistGameCallbacks,
  options?: PersistCurrentGameOptions,
): Promise<boolean> {
  const chronicle = options?.chronicle ?? false;
  const feedback = options?.feedback ?? true;
  const loop = accessors.getLoop();
  const view = loop?.getView() ?? accessors.getView();
  if (!view) return false;

  let worldToSave = accessors.getWorld();
  if (loop) {
    worldToSave = await loop.exportAuthoritativeWorld();
    // Never overwrite a valid save with the stale display shadow: an unacknowledged upgrade
    // may exist only in the worker or only on screen, and neither is authoritative.
    if (loop.lastExportWasDegraded?.()) {
      if (feedback) callbacks.showToast({
        message: 'Save not written — simulation worker did not confirm the current world. Please retry.',
        type: 'error',
      });
      return false;
    }
  }

  const background = options?.background ?? false;
  const result = background
    ? saveGameToSlot(worldToSave, view)
    : saveGame(worldToSave, view);
  if (result.success && !result.fileReason) {
    slotRefusingNoticeShown = false;
  }

  if (!result.success) {
    if (result.fileReason) {
      // The exit save leaves the download to the player, so it says so once.
      if (!slotRefusingNoticeShown) {
        slotRefusingNoticeShown = true;
        callbacks.showToast({ message: result.error, type: 'warning' });
      }
      return false;
    }
    if (feedback) callbacks.showToast({ message: result.error, type: 'error' });
    return false;
  }
  const chronicleExported = chronicle && loadExportChronicleOnSave();
  if (chronicleExported) {
    try {
      downloadChronicleLog(worldToSave.eventLog, {
        villageName: worldToSave.villageName,
        year: worldToSave.year,
        day: worldToSave.dayInYear,
        tick: worldToSave.tick,
        population: worldToSave.humanPopulation,
      });
    } catch {
      /* Storage save succeeded, export download failed gracefully */
    }
  }

  if (feedback) {
    accessors.getLoop()?.mutateWorld((world) => {
      const id = world.nextFloatingTextId++;
      world.floatingTexts.push({
        id,
        x: world.width / 2,
        y: world.height / 2 - 50,
        text: 'Game Saved! 💾',
        color: '#22c55e',
        life: 60,
        maxLife: 60,
        scale: 1.5,
      });
    });
  }

  if (result.fileReason) {
    // The slot was skipped on purpose, so Load must not be enabled against it.
    callbacks.showToast({
      message: `${describeFileSaveReason(result.fileReason)}${chronicleExported ? ' · chronicle .txt downloaded' : ''}`,
      type: 'warning',
    });
    return true;
  }

  if (result.slotWarning) {
    // The file is on disk but the slot is not: do not enable Load against a slot that was never written.
    if (feedback) callbacks.showToast({ message: result.slotWarning, type: 'warning' });
    return true;
  }

  callbacks.markGameSaved();

  if (feedback) {
    callbacks.showToast({
      message: chronicleExported ? 'Game saved · chronicle .txt downloaded' : 'Game saved successfully',
      type: 'success',
    });
  }

  return true;
}

/**
 * Owns browser persistence feedback and the unmount lifecycle save.
 */
export function useGamePersistence({
  loopRef,
  worldRef,
  viewRef,
  onGameSaved,
}: UseGamePersistenceOptions) {
  const [saveToast, setSaveToast] = useState<SaveToast | null>(null);
  const persistCurrentGameRef = useRef<
    (options?: PersistCurrentGameOptions) => Promise<boolean>
  >(async () => false);
  /** Set once the synchronous page-exit write has run, so teardown does not save a second time. */
  const pageHideSaveWrittenRef = useRef(false);

  const showSaveToast = useCallback((toast: SaveToast) => {
    setSaveToast(toast);
  }, []);

  const dismissSaveToast = useCallback(() => {
    setSaveToast(null);
  }, []);

  const persistenceAccessors = useMemo<GamePersistenceAccessors>(
    () => ({
      getLoop: () => loopRef.current,
      getWorld: () => worldRef.current,
      getView: () => viewRef.current,
    }),
    [loopRef, worldRef, viewRef],
  );

  const persistCurrentGame = useCallback(
    (options?: PersistCurrentGameOptions) =>
      persistGame(
        persistenceAccessors,
        { markGameSaved: onGameSaved, showToast: showSaveToast },
        options,
      ),
    [persistenceAccessors, onGameSaved, showSaveToast],
  );

  /**
   * The one save a colony exit runs: page exit, menu return and React teardown all share it.
   * The auto-save preference means "save when you leave"; off means exit writes nothing.
   */
  const persistOnSessionStop = useCallback((): Promise<boolean> => {
    if (pageHideSaveWrittenRef.current) return Promise.resolve(true);
    const loop = loopRef.current;
    if (!loop || isCrashRecoveryActive() || !loop.getWorld().autoSave) return Promise.resolve(false);
    return persistCurrentGame({ chronicle: false, feedback: false, background: true });
  }, [loopRef, persistCurrentGame]);

  // The page can die between the last render and React teardown, where an async worker export has
  // no time to finish. This is the synchronous best-effort save for that exit.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    /** One handler for both transitions: pagehide writes, pageshow re-arms the bfcache session. */
    const onPageLifecycle = (event: PageTransitionEvent) => {
      if (event.type === 'pageshow') {
        pageHideSaveWrittenRef.current = false;
        return;
      }
      if (pageHideSaveWrittenRef.current) return;
      const outcome = persistGameOnPageHide(persistenceAccessors);
      // Only a completed, authoritative write may suppress the later session-stop save. A worker
      // replica write is best-effort and must let the authoritative export still run.
      pageHideSaveWrittenRef.current = outcome.written && outcome.authoritative;
    };
    window.addEventListener('pagehide', onPageLifecycle);
    window.addEventListener('pageshow', onPageLifecycle);
    return () => {
      window.removeEventListener('pagehide', onPageLifecycle);
      window.removeEventListener('pageshow', onPageLifecycle);
    };
  }, [persistenceAccessors]);

  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(dismissSaveToast, 4000);
    return () => clearTimeout(timer);
  }, [dismissSaveToast, saveToast]);

  useLayoutEffect(() => {
    persistCurrentGameRef.current = persistCurrentGame;
  }, [persistCurrentGame]);

  // Last-resort teardown save. The session hook normally calls `persistOnSessionStop` first, while
  // loopRef is still live; this branch only matters when no session stop preceded the unmount.
  useEffect(() => {
    return () => {
      void persistOnSessionStop();
    };
  }, [persistOnSessionStop]);

  return {
    dismissSaveToast,
    persistCurrentGame,
    persistCurrentGameRef,
    persistOnSessionStop,
    saveToast,
    showSaveToast,
  };
}
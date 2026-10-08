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
};

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
 * The save currently running, if any.
 *
 * Two saves can overlap in practice: the exit save and a Ctrl+S or menu save, both of which resume
 * from the same idle wake. Without this, the second call reached `GameWorkerHost.exportSave()`, which
 * refuses a second export while one is in flight (`'Export already in flight'`) —
 * `GameLoop.exportAuthoritativeWorld` caught that, warned, and fell back to `this.world`, **the
 * display shadow**, so the save recorded a world up to `MAX_PIPELINE_DEPTH` ticks behind the worker
 * *while toasting "Game saved successfully"*
 *
 * Coalescing is the right resolution rather than queueing: both callers want the same thing — the
 * most recent authoritative snapshot written to the same slot — so the second one waits for the first
 * and reports its result. Serialising them would only write the same state twice.
 *
 * Module scope, not a hook ref, so the keyboard handler and the unmount cleanup all see it;
 * `persistGame` is a module function, not a hook.
 */
let saveInFlight: Promise<boolean> | null = null;

/**
 * Persists the authoritative game snapshot.
 * Coordinates directly with the web worker / GameLoop to guarantee authoritative state.
 */
export async function persistGame(
  accessors: GamePersistenceAccessors,
  callbacks: PersistGameCallbacks,
  options?: PersistCurrentGameOptions,
): Promise<boolean> {
  // A second save joins the one already running instead of racing it for the worker's single export
  // slot — see `saveInFlight`.
  if (saveInFlight) return saveInFlight;

  const run = persistGameOnce(accessors, callbacks, options);
  saveInFlight = run;
  try {
    return await run;
  } finally {
    // Cleared whether the save succeeded or not, so a failure can still be retried.
    saveInFlight = null;
  }
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
  // The worker export is allowed to fall back to the display world, which carries optimistic commands
  // the worker never confirmed. Say so rather than let a success toast imply the file matches the
  // running colony.
  if (feedback && loop?.lastExportWasDegraded?.()) {
    callbacks.showToast({
      message: 'Saved from the screen copy — the simulation worker did not answer in time.',
      type: 'warning',
    });
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

  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(dismissSaveToast, 4000);
    return () => clearTimeout(timer);
  }, [dismissSaveToast, saveToast]);

  useLayoutEffect(() => {
    persistCurrentGameRef.current = persistCurrentGame;
  }, [persistCurrentGame]);

  // Best-effort save on component unmount. Delegates to the latest persist
  // closure, which lazily reads loopRef/worldRef/viewRef at call time, so no
  // stale ref values are captured when the cleanup runs.
  useEffect(() => {
    return () => {
      // No loop means no colony to save: under StrictMode the mount effect runs twice and an
      // unguarded unmount save would overwrite the real slot with an empty world.
      //
      // The rule's remedy (capture `.current` at effect setup) would delete that guard: this effect
      // runs on mount, when no loop exists yet, so a captured value is always null and the save never
      // happens on a real teardown. Reading the live ref is the point.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const loop = loopRef.current;
      if (!loop) return;
      // The auto-save preference now means "save when you leave"; with it off, exit writes nothing.
      if (!loop.getWorld().autoSave) return;
      void persistCurrentGameRef.current({ chronicle: false, feedback: false, background: true });
    };
  }, [loopRef]);

  return {
    dismissSaveToast,
    persistCurrentGame,
    persistCurrentGameRef,
    saveToast,
    showSaveToast,
  };
}
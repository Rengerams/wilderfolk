import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { saveGame } from '../game/gameEngine';
import type { WorldState } from '../game/gameEngine';
import { downloadChronicleLog, loadExportChronicleOnSave } from '../game/eventLogExport';
import { GameLoop } from '../game/gameLoop';
import type { ViewState } from '../game/viewState';

/** Auto-save cadence, in milliseconds. The game menu's copy renders this (`AUTO_SAVE_INTERVAL_MS / 1000`). */
export const AUTO_SAVE_INTERVAL_MS = 30_000;
const AUTO_SAVE_FAILURE_MESSAGE = 'Auto-save failed — try manual save from the menu';

export interface SaveToast {
  message: string;
  type: 'success' | 'error';
}

export interface PersistCurrentGameOptions {
  chronicle?: boolean;
  feedback?: boolean;
}

type PersistenceLoop = Pick<
  GameLoop,
  'exportAuthoritativeWorld' | 'getView' | 'getWorld' | 'mutateWorld'
>;

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
 * Two saves can overlap in practice: the 30 s autosave interval (`useGamePersistence`'s effect) and a
 * Ctrl+S or the unmount save, both of which resume from the same idle wake. Without this, the second
 * call reached `GameWorkerHost.exportSave()`, which refuses a second export while one is in flight
 * (`'Export already in flight'`) — `GameLoop.exportAuthoritativeWorld` caught that, warned, and fell
 * back to `this.world`, **the display shadow**, so the save recorded a world up to
 * `MAX_PIPELINE_DEPTH` ticks behind the worker *while toasting "Game saved successfully"*
 * (2026-09-21 audit, D-7).
 *
 * Coalescing is the right resolution rather than queueing: both callers want the same thing — the
 * most recent authoritative snapshot written to the same slot — so the second one waits for the first
 * and reports its result. Serialising them would only write the same state twice.
 *
 * Module scope, not a hook ref, so the interval callback, the keyboard handler and the unmount
 * cleanup all see it; `persistGame` is a module function, not a hook.
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

  const result = saveGame(worldToSave, view);
  if (!result.success) {
    if (feedback) callbacks.showToast({ message: result.error, type: 'error' });
    return false;
  }

  if (chronicle && loadExportChronicleOnSave()) {
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

  callbacks.markGameSaved();

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

    callbacks.showToast({
      message:
        chronicle && loadExportChronicleOnSave()
          ? 'Game saved · chronicle .txt downloaded'
          : 'Game saved successfully',
      type: 'success',
    });
  }

  return true;
}

/**
 * Owns browser persistence feedback, periodic auto-save intervals, and unmount lifecycle saves.
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

  // Periodic Auto-Save
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (autoSaveIntervalRef.current) return;

    autoSaveIntervalRef.current = setInterval(() => {
      const loop = loopRef.current;
      if (!loop) return;

      const snapshot = loop.getWorld();
      if (!snapshot.autoSave) return;

      void persistCurrentGameRef.current({ chronicle: false, feedback: false })
        .then((ok) => {
          if (!ok) showSaveToast({ message: AUTO_SAVE_FAILURE_MESSAGE, type: 'error' });
        })
        .catch(() => {
          showSaveToast({ message: AUTO_SAVE_FAILURE_MESSAGE, type: 'error' });
        });
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [loopRef, showSaveToast]);

  // Best-effort save on component unmount. Delegates to the latest persist
  // closure, which lazily reads loopRef/worldRef/viewRef at call time, so no
  // stale ref values are captured when the cleanup runs.
  useEffect(() => {
    return () => {
      // No loop means no colony to save: under StrictMode the mount effect runs twice and an
      // unguarded unmount save would overwrite the real slot with an empty world (R1).
      //
      // The rule's remedy (capture `.current` at effect setup) would delete that guard: this effect
      // runs on mount, when no loop exists yet, so a captured value is always null and the save never
      // happens on a real teardown. Reading the live ref is the point.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!loopRef.current) return;
      void persistCurrentGameRef.current({ chronicle: false, feedback: false });
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
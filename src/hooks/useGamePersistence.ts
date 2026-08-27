import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { saveGame } from '../game/gameEngine';
import type { WorldState } from '../game/gameEngine';
import { downloadChronicleLog, loadExportChronicleOnSave } from '../game/eventLogExport';
import { GameLoop } from '../game/gameLoop';
import type { ViewState } from '../game/viewState';

const AUTO_SAVE_INTERVAL_MS = 30_000;
const AUTO_SAVE_FAILURE_MESSAGE = 'Auto-save failed — try manual save from the menu';

export type SaveToast = {
  message: string;
  type: 'success' | 'error';
};

export type PersistCurrentGameOptions = {
  chronicle?: boolean;
  feedback?: boolean;
};

type PersistenceLoop = Pick<
  GameLoop,
  'exportAuthoritativeWorld' | 'getView' | 'getWorld' | 'mutateWorld'
>;

export type GamePersistenceAccessors = {
  getLoop: () => PersistenceLoop | null;
  getWorld: () => WorldState;
  getView: () => ViewState | null;
};

type PersistGameCallbacks = {
  markGameSaved: () => void;
  showToast: (toast: SaveToast) => void;
};

type UseGamePersistenceOptions = {
  loopRef: RefObject<GameLoop | null>;
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
  onGameSaved: () => void;
};

/**
 * Persists the authoritative game snapshot without claiming any simulation ownership.
 * The caller supplies the current loop and display-world accessors so the worker remains
 * the sole source of truth whenever it is active.
 */
export async function persistGame(
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
      /* localStorage save succeeded */
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
      message: chronicle && loadExportChronicleOnSave()
        ? 'Game saved · chronicle .txt downloaded'
        : 'Game saved successfully',
      type: 'success',
    });
  }

  return true;
}

/**
 * Owns browser persistence feedback and lifecycle behavior while leaving simulation
 * authority with the game loop and its worker-owned world snapshot.
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

  const persistenceAccessors: GamePersistenceAccessors = {
    getLoop: () => loopRef.current,
    getWorld: () => worldRef.current,
    getView: () => viewRef.current,
  };

  const persistCurrentGame = useCallback(
    (options?: PersistCurrentGameOptions) => persistGame(
      persistenceAccessors,
      { markGameSaved: onGameSaved, showToast: showSaveToast },
      options,
    ),
    [onGameSaved, showSaveToast],
  );

  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(dismissSaveToast, 4000);
    return () => clearTimeout(timer);
  }, [dismissSaveToast, saveToast]);

  useLayoutEffect(() => {
    persistCurrentGameRef.current = persistCurrentGame;
  }, [persistCurrentGame]);

  // Auto-save every 30 seconds (stable interval via ref guard).
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (autoSaveIntervalRef.current) return;
    autoSaveIntervalRef.current = setInterval(() => {
      const loop = loopRef.current;
      if (!loop) return;
      const snapshot = loop.getWorld();
      if (!snapshot.autoSave) return;
      void persistCurrentGameRef.current({ chronicle: false, feedback: false }).then((ok) => {
        if (!ok) showSaveToast({ message: AUTO_SAVE_FAILURE_MESSAGE, type: 'error' });
      });
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [loopRef, showSaveToast]);

  // Best-effort save on unmount when a session is still active.
  useEffect(() => () => {
    const loop = loopRef.current;
    if (!loop) return;
    const view = loop.getView() ?? viewRef.current;
    if (!view) return;
    void persistCurrentGameRef.current({ chronicle: false, feedback: false });
  }, [loopRef, viewRef]);

  return {
    dismissSaveToast,
    persistCurrentGame,
    persistCurrentGameRef,
    saveToast,
    showSaveToast,
  };
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { BuildingType, type WorldState } from '../game/gameEngine';
import { GameLoop } from '../game/gameLoop';
import type { EntityCatalog } from '../game/entityCatalog';
import type { WorkerCommand } from '../game/simWorker/commands';
import { computeVillageStats, type VillageStatsSummary } from '../game/uiSimSummary';
import { resetHousingRelocationMonitor } from '../game/housingRelocationMonitor';
import type { ViewState } from '../game/viewState';
import { stopAllAudio } from '../audio';

export type GameSessionAction = WorkerCommand | ((world: WorldState) => WorldState);

/** The battle report the app is showing; owned by the session, not by a colony. */
export interface ColonyBattleReport {
  rivalName: string;
  raidId?: string;
  baselineId: number;
  incoming?: boolean;
}

/** App-owned setters the colony boundary clears on every session transition. */
export interface ColonySessionStateResetters {
  cancelStripDemolition: () => void;
  setBattleReport: Dispatch<SetStateAction<ColonyBattleReport | null>>;
  setCampaignActive: Dispatch<SetStateAction<boolean>>;
  setFamilyTreeFor: Dispatch<SetStateAction<number | null>>;
  setHasPlacedHouse: Dispatch<SetStateAction<boolean>>;
  setSelectedBuildingType: Dispatch<SetStateAction<BuildingType | null>>;
  setWorkHoursOpen: Dispatch<SetStateAction<boolean>>;
}

type UseGameSessionParams = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  initialWorld: WorldState;
  initialView: ViewState;
  spritesLoaded: boolean;
  showIntro: boolean;
  showMapSetup: boolean;
  setWorld: Dispatch<SetStateAction<WorldState>>;
  setView: Dispatch<SetStateAction<ViewState>>;
  setVillageStats: Dispatch<SetStateAction<VillageStatsSummary>>;
  setCatalog: Dispatch<SetStateAction<EntityCatalog | null>>;
  setHasPlacedHouse: Dispatch<SetStateAction<boolean>>;
  /** Saves the departing colony while its loop (and worker) are still alive. */
  onBeforeStop?: () => Promise<boolean> | boolean | void;
};

/** Determines whether the existing gameplay session is allowed to run. */
export function shouldRunGameSession(
  spritesLoaded: boolean,
  showIntro: boolean,
  showMapSetup: boolean,
): boolean {
  return spritesLoaded && !showIntro && !showMapSetup;
}

/**
 * One colony boundary for load/new/leave: per-colony UI and the old soundscape must not cross it.
 * `App` decides the next world; this owner only clears the state a previous colony left behind.
 */
export function clearColonySessionState(resetters: ColonySessionStateResetters): void {
  resetters.cancelStripDemolition();
  resetters.setBattleReport(null);
  resetters.setCampaignActive(false);
  resetters.setFamilyTreeFor(null);
  resetters.setHasPlacedHouse(false);
  resetters.setSelectedBuildingType(null);
  resetters.setWorkHoursOpen(false);
  // Process-wide churn counters outlive a world object, so the colony boundary must clear them.
  resetHousingRelocationMonitor();
  stopAllAudio();
}

/**
 * Build mode is transient interaction state, not saved colony state, so an entering session starts
 * with no placement ghost, strip preview or inherited rotation.
 */
export function clearTransientBuildView(view: ViewState): ViewState {
  return {
    ...view,
    buildMode: null,
    buildGhost: null,
    buildStripPreview: null,
    buildRotation: 0,
  };
}

/**
 * Owns only the existing GameLoop lifecycle, worker snapshot subscription, and
 * generic command/action dispatch. The loop remains authoritative for world state.
 */
export function useGameSession({
  canvasRef,
  initialWorld,
  initialView,
  spritesLoaded,
  showIntro,
  showMapSetup,
  setWorld,
  setView,
  setVillageStats,
  setCatalog,
  setHasPlacedHouse,
  onBeforeStop,
}: UseGameSessionParams) {
  const [sessionRevision, setSessionRevision] = useState(0);
  const worldRef = useRef(initialWorld);
  const viewRef = useRef(initialView);
  const loopRef = useRef<GameLoop | null>(null);
  const catalogRef = useRef<EntityCatalog | null>(null);
  const onBeforeStopRef = useRef(onBeforeStop);

  useLayoutEffect(() => {
    onBeforeStopRef.current = onBeforeStop;
  }, [onBeforeStop]);

  useEffect(() => {
    worldRef.current = initialWorld;
    viewRef.current = initialView;
  });

  useEffect(() => {
    if (!shouldRunGameSession(spritesLoaded, showIntro, showMapSetup)) {
      loopRef.current?.stop();
      loopRef.current = null;
      return;
    }

    const loop = new GameLoop(worldRef.current, viewRef.current, () => canvasRef.current);
    loopRef.current = loop;
    const unsubscribe = loop.subscribe((nextWorld, nextView, simChanged, nextCatalog) => {
      worldRef.current = nextWorld;
      viewRef.current = nextView;
      catalogRef.current = nextCatalog;
      // Canvas/minimap read refs every frame — skip React commits on periodic polls.
      if (!simChanged) return;
      setCatalog(nextCatalog);
      setVillageStats(computeVillageStats(nextWorld, nextCatalog));
      setHasPlacedHouse((previous) => previous || nextWorld.buildings.some(
        (building) => building.type === BuildingType.House
          && (building.completed || building.constructionProgress > 0),
      ));
      setWorld(nextWorld);
      setView(nextView);
    });
    loop.start();

    return () => {
      unsubscribe();
      // The persistence hook's callback reads loopRef, so it must run before the ref is cleared,
      // and the loop must stay alive until a worker-backed export has settled.
      let pendingSave: Promise<boolean> | boolean | void;
      try {
        pendingSave = onBeforeStopRef.current?.();
      } catch {
        pendingSave = undefined;
      }
      loopRef.current = null;
      void Promise.resolve(pendingSave)
        .catch(() => false)
        .then(() => loop.stop());
    };
  }, [canvasRef, setCatalog, setHasPlacedHouse, setVillageStats, setView, setWorld, showIntro, showMapSetup, spritesLoaded]);

  const applyGameAction = useCallback((action: GameSessionAction) => {
    if (typeof action === 'function') {
      loopRef.current?.applyAction(action);
    } else {
      loopRef.current?.applyCommand(action);
    }
  }, []);

  const replaceSession = useCallback((world: WorldState, view: ViewState) => {
    const nextView = clearTransientBuildView(view);
    worldRef.current = world;
    viewRef.current = nextView;
    setWorld(world);
    setView(nextView);
    loopRef.current?.setSession(world, nextView);
    setSessionRevision((revision) => revision + 1);
  }, [setView, setWorld]);

  return {
    applyGameAction,
    catalogRef,
    loopRef,
    replaceSession,
    sessionRevision,
    viewRef,
    worldRef,
  };
}

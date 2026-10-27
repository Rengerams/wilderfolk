import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { BuildingType, type WorldState } from '../game/gameEngine';
import { GameLoop } from '../game/gameLoop';
import type { EntityCatalog } from '../game/entityCatalog';
import type { WorkerCommand } from '../game/simWorker/commands';
import { computeVillageStats, type VillageStatsSummary } from '../game/uiSimSummary';
import type { ViewState } from '../game/viewState';

export type GameSessionAction = WorkerCommand | ((world: WorldState) => WorldState);

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
}: UseGameSessionParams) {
  const worldRef = useRef(initialWorld);
  const viewRef = useRef(initialView);
  const loopRef = useRef<GameLoop | null>(null);
  const catalogRef = useRef<EntityCatalog | null>(null);

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
      loop.stop();
      loopRef.current = null;
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
    worldRef.current = world;
    viewRef.current = view;
    setWorld(world);
    setView(view);
    loopRef.current?.setSession(world, view);
  }, [setView, setWorld]);

  return {
    applyGameAction,
    catalogRef,
    loopRef,
    replaceSession,
    viewRef,
    worldRef,
  };
}

import { useEffect, type RefObject } from 'react';
import { GameLoop } from '../game/gameLoop';
import type { EntityCatalog } from '../game/entityCatalog';
import {
  CAMERA_ZOOM_STEP_IN,
  CAMERA_ZOOM_STEP_OUT,
  focusCameraOn,
  clampCameraTarget,
} from '../game/viewState';
import { isRotatableBuildingType } from '../game/buildingRotation';
import { isPlayerHuman } from '../game/playerHuman';
import {
  isEditableTarget,
  resolveSidebarTabFromKey,
  HOTKEY_BUILDINGS,
  type SidebarTab,
} from '../game/hotkeys';

export interface UseKeyboardControlsOptions {
  loopRef: RefObject<GameLoop | null>;
  selectedBuildingTypeRef: RefObject<import('../game/gameEngine').BuildingType | null>;
  gameplayActiveRef: RefObject<boolean>;
  showShortcutsRef: RefObject<boolean>;
  keysRef: RefObject<Set<string>>;
  cameraVelRef: RefObject<{ x: number; y: number }>;
  catalogRef: RefObject<EntityCatalog | null>;
  openTab: (tab: SidebarTab) => void;
  setProgressSubTab: (tab: 'research' | 'trade' | 'goals') => void;
  setShowShortcuts: (value: boolean | ((prev: boolean) => boolean)) => void;
  setBuildPanelOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  cancelBuildModeRef: RefObject<() => void>;
  togglePauseRef: RefObject<() => void>;
  selectBuildingTypeRef: RefObject<(type: import('../game/gameEngine').BuildingType) => void>;
  toggleGridRef: RefObject<() => void>;
  rotateBuildPlacementRef: RefObject<() => void>;
  applyZoomRef: RefObject<(factor: number, screenX?: number, screenY?: number) => void>;
  dismissBigNewsRef: RefObject<(id: string) => void>;
  dismissActiveEventRef: RefObject<() => void>;
  dismissTipRef: RefObject<() => void>;
  topBigNewsIdRef: RefObject<string | null>;
  hasActiveEventRef: RefObject<boolean>;
  hasContextualTipRef: RefObject<boolean>;
  persistCurrentGameRef: RefObject<
    (options?: { chronicle?: boolean; feedback?: boolean }) => Promise<boolean>
  >;
}

export function useKeyboardControls({
  loopRef,
  selectedBuildingTypeRef,
  gameplayActiveRef,
  showShortcutsRef,
  keysRef,
  cameraVelRef,
  catalogRef,
  openTab,
  setProgressSubTab,
  setShowShortcuts,
  setBuildPanelOpen,
  cancelBuildModeRef,
  togglePauseRef,
  selectBuildingTypeRef,
  toggleGridRef,
  rotateBuildPlacementRef,
  applyZoomRef,
  dismissBigNewsRef,
  dismissActiveEventRef,
  dismissTipRef,
  topBigNewsIdRef,
  hasActiveEventRef,
  hasContextualTipRef,
  persistCurrentGameRef,
}: UseKeyboardControlsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inFormControl = isEditableTarget(e.target);

      if (!inFormControl) {
        keysRef.current.add(e.key.toLowerCase());
      }

      if (
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat
        && gameplayActiveRef.current
        && !showShortcutsRef.current
      ) {
        const tab = resolveSidebarTabFromKey(e);
        if (tab) {
          e.preventDefault();
          if (inFormControl) {
            (document.activeElement as HTMLElement | null)?.blur();
          }
          if (tab === 'progress') setProgressSubTab('research');
          openTab(tab);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void persistCurrentGameRef.current({ chronicle: true, feedback: true });
        return;
      }

      if (inFormControl) return;

      if (e.key === ' ') { e.preventDefault(); togglePauseRef.current(); }
      if (e.key === 'Escape') {
        if (showShortcutsRef.current) {
          setShowShortcuts(false);
        } else if (hasActiveEventRef.current) {
          dismissActiveEventRef.current();
        } else if (topBigNewsIdRef.current) {
          dismissBigNewsRef.current(topBigNewsIdRef.current);
        } else if (hasContextualTipRef.current) {
          dismissTipRef.current();
        } else if (selectedBuildingTypeRef.current) {
          cancelBuildModeRef.current();
        } else {
          loopRef.current?.patchView({ selectedEntityId: null, selectedBuildingId: null });
        }
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts((open) => !open);
      }
      if (e.key === '+' || e.key === '=') {
        applyZoomRef.current(CAMERA_ZOOM_STEP_IN);
      }
      if (e.key === '-') {
        applyZoomRef.current(CAMERA_ZOOM_STEP_OUT);
      }
      // Building hotkeys
      const hotBuild = HOTKEY_BUILDINGS[e.key];
      if (hotBuild != null) {
        selectBuildingTypeRef.current(hotBuild);
        setBuildPanelOpen(true);
      }
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setBuildPanelOpen((open) => !open);
      }
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        toggleGridRef.current();
      }
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const buildType = selectedBuildingTypeRef.current;
        if (buildType && isRotatableBuildingType(buildType)) {
          e.preventDefault();
          rotateBuildPlacementRef.current();
        }
      }
      if (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const loop = loopRef.current;
        if (loop) {
          const world = loop.getWorld();
          const settlers = catalogRef.current?.getPlayerHumans()
            ?? world.entities.filter((ent) => ent.alive && isPlayerHuman(ent));
          if (settlers.length > 0) {
            const cx = settlers.reduce((sum, ent) => sum + ent.x, 0) / settlers.length;
            const cy = settlers.reduce((sum, ent) => sum + ent.y, 0) / settlers.length;
            const nextView = focusCameraOn(loop.getView(), cx, cy, 1.5);
            loop.patchView({ camera: clampCameraTarget(nextView.camera, world.width, world.height) });
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);

    // Camera momentum loop
    let animId: number;
    const cameraLoop = () => {
      const keys = keysRef.current;
      const speed = 6;
      let dx = 0, dy = 0;
      if (keys.has('w') || keys.has('arrowup')) dy -= speed;
      if (keys.has('s') || keys.has('arrowdown')) dy += speed;
      if (keys.has('a') || keys.has('arrowleft')) dx -= speed;
      if (keys.has('d') || keys.has('arrowright')) dx += speed;

      if (dx !== 0 || dy !== 0) {
        cameraVelRef.current.x += dx * 0.3;
        cameraVelRef.current.y += dy * 0.3;
      }

      // Apply momentum with friction
      if (Math.abs(cameraVelRef.current.x) > 0.1 || Math.abs(cameraVelRef.current.y) > 0.1) {
        const loop = loopRef.current;
        if (loop) {
          const view = loop.getView();
          const cam = { ...view.camera };
          cam.targetX += cameraVelRef.current.x / cam.zoom;
          cam.targetY += cameraVelRef.current.y / cam.zoom;
          loop.patchView({
            camera: clampCameraTarget(cam, loop.getWorld().width, loop.getWorld().height),
          }, true);
        }
        cameraVelRef.current.x *= 0.85;
        cameraVelRef.current.y *= 0.85;
      } else {
        cameraVelRef.current.x = 0;
        cameraVelRef.current.y = 0;
      }

      animId = requestAnimationFrame(cameraLoop);
    };
    animId = requestAnimationFrame(cameraLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTab]);
}

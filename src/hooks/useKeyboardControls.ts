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
  isActivatableTarget,
  isLogisticsHotkey,
  isCouncilHotkey,
  resolveSidebarTabFromKey,
  HOTKEY_BUILDINGS,
  type SidebarTab,
} from '../game/hotkeys';
import { isKeyboardClaimed } from '../game/keyboardOwnership';

export interface UseKeyboardControlsOptions {
  loopRef: RefObject<GameLoop | null>;
  /**
   * The map canvas. Camera clamping needs the render viewport, or `clampCameraTarget` falls back
   * to `window.innerWidth/Height` and the camera cannot reach the map's left/right edges.
   */
  canvasRef: RefObject<HTMLCanvasElement | null>;
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
  citizenOverviewOpenRef: RefObject<boolean>;
  toggleCitizenOverviewRef: RefObject<() => void>;
  toggleDashboardRef: RefObject<() => void>;
  closeCitizenOverviewRef: RefObject<() => void>;
  cancelBuildModeRef: RefObject<() => void>;
  togglePauseRef: RefObject<() => void>;
  selectBuildingTypeRef: RefObject<(type: import('../game/gameEngine').BuildingType) => void>;
  toggleGridRef: RefObject<() => void>;
  toggleLogisticsRef: RefObject<() => void>;
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
  canvasRef,
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
  citizenOverviewOpenRef,
  toggleCitizenOverviewRef,
  toggleDashboardRef,
  closeCitizenOverviewRef,
  cancelBuildModeRef,
  togglePauseRef,
  selectBuildingTypeRef,
  toggleGridRef,
  toggleLogisticsRef,
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
      // An open overlay owns the keyboard: it registers after this window-capture handler, so
      // without this guard one Escape also clears the map selection.
      if (isKeyboardClaimed()) return;

      const inFormControl = isEditableTarget(e.target);

      if (!inFormControl) {
        keysRef.current.add(e.key.toLowerCase());
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (e.repeat) return;
        e.preventDefault();
        void persistCurrentGameRef.current({ chronicle: true, feedback: true });
        return;
      }

      // From here on the player is typing into a field, so no hotkey may take the key.
      if (inFormControl) return;

      // A held key is one gesture: OS key repeat must not re-toggle pause/build/windows.
      if (e.repeat) return;

      if (
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat
        && gameplayActiveRef.current
        && !showShortcutsRef.current
      ) {
        const tab = resolveSidebarTabFromKey(e);
        if (tab) {
          e.preventDefault();
          if (tab === 'progress') setProgressSubTab('research');
          openTab(tab);
          return;
        }
      }

      if (e.key === ' ') {
        // Space belongs to a focused control: swallowing it here pauses the game instead
        // of pressing the button the player focused.
        if (isActivatableTarget(e.target)) return;
        e.preventDefault();
        togglePauseRef.current();
      }
      if (
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat
        && gameplayActiveRef.current
        && e.key.toLowerCase() === 'o'
      ) {
        e.preventDefault();
        toggleCitizenOverviewRef.current();
        return;
      }
      // `C` — the village overview, beside `O` and gated the same way: both are windows over the
      // running colony, so neither opens from the intro or the map screen.
      if (gameplayActiveRef.current && isCouncilHotkey(e)) {
        e.preventDefault();
        toggleDashboardRef.current();
        return;
      }
      if (e.key === 'Escape') {
        if (citizenOverviewOpenRef.current) {
          closeCitizenOverviewRef.current();
        } else if (showShortcutsRef.current) {
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
          loopRef.current?.patchView({ selectedEntityId: null, selectedEntityIds: [], selectedBuildingId: null });
        }
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts((open) => !open);
      }

      // Everything below acts on the game *behind* the shortcuts sheet, so none of it may
      // fire while the sheet is open. Escape and '?' above are the ways out.
      if (showShortcutsRef.current) return;

      // Everything below acts on the map, so stop on the intro and map-setup screens; Ctrl/Cmd+S
      // and `?` stay above this gate because they work before a map exists.
      if (!gameplayActiveRef.current) return;

      // No chord reaches the map: Ctrl/Cmd+1..9 switches browser tabs and Alt+= is an OS zoom, so
      // modifier combos return before the zoom and digit handling below.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

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
      // F4 — logistics overlay toggle (X). A presentation-only read of the world, so it rides the
      // same ungated path as the grid toggle above; the owner callback no-ops without a loop.
      if (isLogisticsHotkey(e)) {
        e.preventDefault();
        toggleLogisticsRef.current();
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
            const rect = canvasRef.current?.getBoundingClientRect();
            loop.patchView({
              camera: clampCameraTarget(
                nextView.camera, world.width, world.height, rect?.width, rect?.height,
              ),
            });
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      // Delete unconditionally: a key may have been pressed while the map had focus, and a stale
      // entry keeps the camera panning forever.
      keysRef.current.delete(e.key.toLowerCase());
    };
    // Focus loss never delivers the keyup, so a held movement key would stay in the set
    // and the momentum loop would re-add velocity every frame — the map drifts by itself.
    const releaseHeldKeys = () => {
      keysRef.current.clear();
      cameraVelRef.current.x = 0;
      cameraVelRef.current.y = 0;
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseHeldKeys);
    document.addEventListener('visibilitychange', releaseHeldKeys);

    // Camera momentum loop
    let animId: number;
    const cameraLoop = () => {
      const keys = keysRef.current;
      const speed = 6;
      /**
       * Arrow keys belong to the map cursor while the canvas holds focus; `GameMapStage` binds the
       * same four keys. WASD always pans, so movement never becomes unreachable.
       */
      const arrowsPanCamera = typeof document === 'undefined'
        || document.activeElement !== canvasRef.current;
      let dx = 0, dy = 0;
      if (keys.has('w') || (arrowsPanCamera && keys.has('arrowup'))) dy -= speed;
      if (keys.has('s') || (arrowsPanCamera && keys.has('arrowdown'))) dy += speed;
      if (keys.has('a') || (arrowsPanCamera && keys.has('arrowleft'))) dx -= speed;
      if (keys.has('d') || (arrowsPanCamera && keys.has('arrowright'))) dx += speed;

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
          const rect = canvasRef.current?.getBoundingClientRect();
          loop.patchView({
            camera: clampCameraTarget(
              cam, loop.getWorld().width, loop.getWorld().height, rect?.width, rect?.height,
            ),
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
      window.removeEventListener('blur', releaseHeldKeys);
      document.removeEventListener('visibilitychange', releaseHeldKeys);
      cancelAnimationFrame(animId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTab]);
}
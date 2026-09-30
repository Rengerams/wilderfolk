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
  resolveSidebarTabFromKey,
  HOTKEY_BUILDINGS,
  type SidebarTab,
} from '../game/hotkeys';
import { isKeyboardClaimed } from '../game/keyboardOwnership';

export interface UseKeyboardControlsOptions {
  loopRef: RefObject<GameLoop | null>;
  /**
   * The map canvas. Camera clamping needs the *render* viewport: `clampCameraTarget`
   * otherwise falls back to `window.innerWidth/Height`, which is wider than the map
   * canvas by the width of the side panels, so the camera can never reach the map's
   * left/right edges.
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
      // An open overlay owns the keyboard. It mounts and registers *after* this
      // window-capture handler, so it cannot preempt it: without this guard one Escape
      // closes the overlay and also falls through to clear the map selection
      // (BUG_REPORTS/2026-09-17-keyboard-ignores-open-overlays.md).
      if (isKeyboardClaimed()) return;

      const inFormControl = isEditableTarget(e.target);

      if (!inFormControl) {
        keysRef.current.add(e.key.toLowerCase());
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void persistCurrentGameRef.current({ chronicle: true, feedback: true });
        return;
      }

      // From here on the player is typing into a field, so no hotkey may take the key.
      // The sidebar-tab block used to sit above this guard: typing "forge" into the Guide
      // search stopped at 'f' and jumped to the Frontier tab.
      if (inFormControl) return;

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

      // The hook is mounted above the shell's early returns, so it is live on the intro and the
      // map-setup screens as well — and everything from here down acts on the map. There is no loop
      // to act on there: `isEditableTarget` is false whenever focus sits on a button, which is every
      // control on those screens, so a digit armed a build type and `B` opened the build panel, and
      // the colony started with the rail armed. Ctrl/Cmd+S and `?` stay deliberately **above** this
      // gate: saving and opening this sheet are meaningful before a map exists.
      if (!gameplayActiveRef.current) return;

      // No chord reaches the map. Ctrl/Cmd+1..9 switches browser tabs and Alt+= is an OS zoom; both
      // used to select a building or zoom the map too, so returning from the browser tab found the
      // game in build mode. Every sibling hotkey below already tests for modifiers — this hoists the
      // same rule above the zoom/digit pair that forgot it.
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
      // Delete unconditionally, even when the event's target is a text field: the key may
      // have been pressed while the map had focus, and any key left in the set keeps the
      // camera panning forever. Deleting an absent key is a no-op.
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
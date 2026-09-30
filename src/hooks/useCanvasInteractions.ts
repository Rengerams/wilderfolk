import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { GameLoop } from '../game/gameLoop';
import type { WorldState, BuildingType, Building, Entity } from '../game/gameEngine';
import type { EntityCatalog } from '../game/entityCatalog';
import {
  isStripBuildType,
  inferStripRotation,
  hitTestCamp,
  EntityType,
} from '../game/gameEngine';
import {
  canPlaceBuilding,
  buildStripPreview,
  getPlaceBuildingFailureReason,
} from '../game/buildingActions';
import {
  screenToWorld,
  focusCameraOn,
  nudgeCameraToward,
  clampCameraTarget,
  createBuildGhost,
} from '../game/viewState';
import { snapBuildingCenter } from '../game/buildingRotation';
import { getHumanSelectionBounds } from '../game/humanSprites';
import { playClickSound } from '../audio';
import type { WorkerCommand } from '../game/simWorker/commands';

export interface UseCanvasInteractionsOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  loopRef: RefObject<GameLoop | null>;
  worldRef: RefObject<WorldState>;
  /** Alive-entity catalog for click hit-testing — null before the loop is running. */
  catalogRef: RefObject<EntityCatalog | null>;
  selectedBuildingType: BuildingType | null;
  getViewCamera: () => import('../game/viewState').ViewState['camera'];
  applyGameAction: (action: WorkerCommand | ((w: WorldState) => WorldState)) => void;
  stripDragStartRef: RefObject<{ x: number; y: number } | null>;
  isDraggingRef: RefObject<boolean>;
  cameraDragStartRef: RefObject<{ x: number; y: number } | null>;
  clickOriginRef: RefObject<{ x: number; y: number } | null>;
  /** Right-click drag vs short right-click to cancel build */
  rightClickOriginRef: RefObject<{ x: number; y: number } | null>;
  setInspectorCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  juiceEffectsEnabled: boolean;
  gameplayActive: boolean;
  cancelBuildMode: () => void;
  onPrimeAudioUnlock: () => void;
  audioStartedRef: RefObject<boolean>;
}

/**
 * The `placeStripChain` command for a drag preview whose every segment is valid, or null when the
 * drag cannot be committed.
 *
 * The click path and the drag-release path each validated the preview and built this command
 * identically, so a change to strip placement had to be made twice in the input hot path
 */
function stripChainCommand(
  preview: ReturnType<typeof buildStripPreview>,
  type: BuildingType,
): WorkerCommand | null {
  if (preview.segments.length === 0) return null;
  if (!preview.segments.every((segment) => segment.valid)) return null;
  return {
    proto: 1,
    op: 'placeStripChain',
    type,
    segments: preview.segments,
    rotation: preview.rotation,
  };
}

/**
 * The topmost building at a given world coordinate — the map's one building hit test.
 *
 * Exported because the keyboard cursor's screen-reader description has to name the same building a
 * click here would select (`useMapKeyboardCursor.describeMapCursor`); a second copy of the
 * containment rule would be a second answer to "what is under this point".
 */
export function findBuildingAt(buildings: readonly Building[], worldX: number, worldY: number): Building | null {
  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i];
    if (
      worldX >= b.x - b.width / 2 &&
      worldX <= b.x + b.width / 2 &&
      worldY >= b.y - b.height / 2 &&
      worldY <= b.y + b.height / 2
    ) {
      return b;
    }
  }
  return null;
}

export function useCanvasInteractions({
  canvasRef,
  loopRef,
  worldRef,
  catalogRef,
  selectedBuildingType,
  getViewCamera,
  applyGameAction,
  stripDragStartRef,
  isDraggingRef,
  cameraDragStartRef,
  clickOriginRef,
  rightClickOriginRef,
  setInspectorCollapsed,
  juiceEffectsEnabled,
  gameplayActive,
  cancelBuildMode,
  onPrimeAudioUnlock,
  audioStartedRef,
}: UseCanvasInteractionsOptions) {
  // Suppresses subsequent onClick handling if strip build was already committed on mouseUp
  const stripPlacedOnMouseUpRef = useRef(false);

  const getEventWorldCoords = useCallback(
    (clientX: number, clientY: number): { worldX: number; worldY: number; rect: DOMRect } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;

      const canvasW = canvas.offsetWidth;
      const canvasH = canvas.offsetHeight;
      const scaleX = canvasW / rect.width;
      const scaleY = canvasH / rect.height;
      const screenX = (clientX - rect.left) * scaleX;
      const screenY = (clientY - rect.top) * scaleY;
      const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);
      return { worldX, worldY, rect };
    },
    [canvasRef, getViewCamera],
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Consume strip placement event if it already fired on mouse up
      if (stripPlacedOnMouseUpRef.current) {
        stripPlacedOnMouseUpRef.current = false;
        return;
      }

      if (clickOriginRef.current) {
        const dx = e.clientX - clickOriginRef.current.x;
        const dy = e.clientY - clickOriginRef.current.y;
        clickOriginRef.current = null;
        if (dx * dx + dy * dy > 16) return;
      }

      const coords = getEventWorldCoords(e.clientX, e.clientY);
      if (!coords) return;
      const { worldX, worldY, rect } = coords;

      const loop = loopRef.current;
      const world = loop?.getWorld() ?? worldRef.current;

      if (selectedBuildingType) {
        const rotation = loop?.getView().buildRotation ?? 0;
        const { x: snapX, y: snapY } = snapBuildingCenter(
          selectedBuildingType,
          worldX,
          worldY,
          rotation,
        );

        // Clicking an existing building while placement is invalid selects it & exits build mode
        if (!isStripBuildType(selectedBuildingType)) {
          const valid = canPlaceBuilding(world, selectedBuildingType, snapX, snapY, rotation);
          if (!valid) {
            const under = findBuildingAt(world.buildings, worldX, worldY);
            if (under) {
              playClickSound();
              cancelBuildMode();
              loop?.patchView({
                selectedBuildingId: under.id,
                selectedEntityId: null,
                selectedEntityIds: [],
                selectedCampKey: null,
                highlightedCampKey: null,
              });
              setInspectorCollapsed(false);
              return;
            }
          }
        }

        if (isStripBuildType(selectedBuildingType)) {
          const preview = buildStripPreview(
            world,
            selectedBuildingType,
            snapX,
            snapY,
            snapX,
            snapY,
            rotation,
          );
          const command = stripChainCommand(preview, selectedBuildingType);
          if (command) {
            playClickSound();
            applyGameAction(command);
          }
          return;
        }

        if (canPlaceBuilding(world, selectedBuildingType, snapX, snapY, rotation)) {
          playClickSound();
          applyGameAction({
            proto: 1,
            op: 'startBuilding',
            type: selectedBuildingType,
            x: snapX,
            y: snapY,
            rotation,
          });
        }
        return;
      }

      // 1. Check entity selection (Two-pass hit testing: humans take priority over wildlife)
      const camera = getViewCamera();
      const clickEntities =
        catalogRef.current?.getAlive() ?? world.entities.filter((ent) => ent.alive);
      let clickedEntity: Entity | null = null;

      // Pass 1: Humans
      for (let i = 0; i < clickEntities.length; i++) {
        const ent = clickEntities[i];
        if (ent.type !== EntityType.Human) continue;
        const bounds = getHumanSelectionBounds(ent, camera.zoom);
        const dx = worldX - bounds.cx;
        const dy = worldY - bounds.cy;
        if ((dx / bounds.rx) ** 2 + (dy / bounds.ry) ** 2 <= 1) {
          clickedEntity = ent;
          break;
        }
      }

      // Pass 2: Wildlife (if no human was hit)
      if (!clickedEntity) {
        for (let i = 0; i < clickEntities.length; i++) {
          const ent = clickEntities[i];
          if (ent.type === EntityType.Human || ent.type === EntityType.Tree || ent.type === EntityType.Grass) {
            continue;
          }
          const dx = ent.x - worldX;
          const dy = ent.y - worldY;
          if (dx * dx + dy * dy <= (ent.size * 1.2 + 6) ** 2) {
            clickedEntity = ent;
            break;
          }
        }
      }

      // 2. Check building selection
      const clickedBuilding = findBuildingAt(world.buildings, worldX, worldY);

      // 3. Check camp selection
      const campHit = hitTestCamp(world, worldX, worldY);
      if (campHit && !clickedEntity) {
        const campKey = `${campHit.kind}:${campHit.id}`;
        if (loop) {
          const nextView = focusCameraOn(loop.getView(), campHit.x, campHit.y, 1.5);
          loop.patchView({
            ...nextView,
            selectedEntityId: null,
            selectedEntityIds: [],
            selectedBuildingId: campHit.kind === 'rival' ? campHit.buildingId : null,
            highlightedCampKey: campKey,
            selectedCampKey: campKey,
          });
          setInspectorCollapsed(false);
        }
        return;
      }

      if (clickedEntity || clickedBuilding) {
        const focusTarget = clickedEntity ?? clickedBuilding;
        if (!focusTarget) return;

        if (loop) {
          const view = loop.getView();
          const viewPatch = juiceEffectsEnabled
            ? nudgeCameraToward(
                view, loop.getWorld(), focusTarget.x, focusTarget.y,
                undefined, rect.width, rect.height,
              )
            : view;

          let nextEntityIds: number[];
          if (clickedEntity) {
            const current =
              view.selectedEntityIds ??
              (view.selectedEntityId != null ? [view.selectedEntityId] : []);
            nextEntityIds = e.shiftKey
              ? current.includes(clickedEntity.id)
                ? current.filter((id) => id !== clickedEntity.id)
                : [...current, clickedEntity.id]
              : [clickedEntity.id];
          } else {
            nextEntityIds = e.shiftKey ? view.selectedEntityIds ?? [] : [];
          }

          loop.patchView({
            ...viewPatch,
            selectedEntityId: nextEntityIds[nextEntityIds.length - 1] ?? null,
            selectedEntityIds: nextEntityIds,
            selectedBuildingId: clickedBuilding?.id ?? null,
            highlightedCampKey:
              clickedEntity?.faction === 'rival' && clickedEntity.groupId
                ? `rival:${clickedEntity.groupId}`
                : clickedEntity?.faction === 'visitor' && clickedEntity.groupId
                  ? `visitor:${clickedEntity.groupId}`
                  : clickedBuilding?.faction === 'rival' && clickedBuilding.groupId
                    ? `rival:${clickedBuilding.groupId}`
                    : null,
            selectedCampKey: null,
          });
        }
        setInspectorCollapsed(false);
      } else {
        loop?.patchView({
          selectedEntityId: null,
          selectedEntityIds: [],
          selectedBuildingId: null,
          highlightedCampKey: null,
          selectedCampKey: null,
        });
      }
    },
    [
      getEventWorldCoords,
      selectedBuildingType,
      juiceEffectsEnabled,
      getViewCamera,
      applyGameAction,
      cancelBuildMode,
      worldRef,
      catalogRef,
      loopRef,
      clickOriginRef,
      setInspectorCollapsed,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getEventWorldCoords(e.clientX, e.clientY);
      if (!coords) return;
      const { worldX, worldY, rect } = coords;

      const loop = loopRef.current;
      const liveWorld = loop?.getWorld() ?? worldRef.current;

      if (isDraggingRef.current && cameraDragStartRef.current) {
        const dx = e.clientX - cameraDragStartRef.current.x;
        const dy = e.clientY - cameraDragStartRef.current.y;
        if (loop) {
          const cam = loop.getView().camera;
          const zoom = cam.zoom > 0 ? cam.zoom : 1;
          const nextCam = {
            ...cam,
            targetX: cam.targetX - dx / zoom,
            targetY: cam.targetY - dy / zoom,
          };
          loop.patchView(
            {
              camera: clampCameraTarget(
                nextCam,
                liveWorld.width,
                liveWorld.height,
                rect.width || liveWorld.width,
                rect.height || liveWorld.height,
              ),
            },
            true,
          );
        }
        cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
      }

      // Track hovered building (top-most priority)
      let hovered: Building | null = null;
      if (!selectedBuildingType && !isDraggingRef.current) {
        hovered = findBuildingAt(liveWorld.buildings, worldX, worldY);
      }

      if (selectedBuildingType) {
        if (isStripBuildType(selectedBuildingType) && stripDragStartRef.current) {
          const start = stripDragStartRef.current;
          const rotation = inferStripRotation(start.x, start.y, worldX, worldY);
          const preview = buildStripPreview(
            liveWorld,
            selectedBuildingType,
            start.x,
            start.y,
            worldX,
            worldY,
            rotation,
          );
          loop?.patchView(
            {
              buildStripPreview: preview,
              buildRotation: rotation,
              buildGhost: null,
              hoveredBuildingId: hovered?.id ?? null,
            },
            true,
          );
        } else if (!isStripBuildType(selectedBuildingType)) {
          const rotation = loop?.getView().buildRotation ?? 0;
          const { x: snapX, y: snapY } = snapBuildingCenter(
            selectedBuildingType,
            worldX,
            worldY,
            rotation,
          );
          // The owner's *reason*, not just its boolean: the ghost names the blocker
          // (`buildingPlacementLabels`) so a dry-bank Bridge reads as "must span river water" instead
          // of "Blocked" (`LIVE-FINDINGS-STATUS.md` F5).
          const reason = getPlaceBuildingFailureReason(
            liveWorld,
            selectedBuildingType,
            snapX,
            snapY,
            rotation,
          );
          loop?.patchView(
            {
              buildGhost: createBuildGhost(snapX, snapY, reason),
              buildStripPreview: null,
              hoveredBuildingId: hovered?.id ?? null,
            },
            true,
          );
        } else {
          loop?.patchView({ hoveredBuildingId: hovered?.id ?? null }, true);
        }
      } else {
        loop?.patchView({ hoveredBuildingId: hovered?.id ?? null }, true);
      }
    },
    [
      getEventWorldCoords,
      selectedBuildingType,
      worldRef,
      loopRef,
      stripDragStartRef,
      isDraggingRef,
      cameraDragStartRef,
    ],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (gameplayActive && e.button === 0) {
        onPrimeAudioUnlock();
        audioStartedRef.current = true;
      }
      // Right-click pan initiation
      if (e.button === 2) {
        rightClickOriginRef.current = { x: e.clientX, y: e.clientY };
        isDraggingRef.current = true;
        cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 0 && selectedBuildingType && isStripBuildType(selectedBuildingType)) {
        const coords = getEventWorldCoords(e.clientX, e.clientY);
        if (!coords) return;
        stripDragStartRef.current = { x: coords.worldX, y: coords.worldY };
        clickOriginRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 1 || (e.button === 0 && !selectedBuildingType)) {
        isDraggingRef.current = true;
        cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
        clickOriginRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [
      gameplayActive,
      selectedBuildingType,
      onPrimeAudioUnlock,
      audioStartedRef,
      getEventWorldCoords,
      stripDragStartRef,
      isDraggingRef,
      cameraDragStartRef,
      clickOriginRef,
      rightClickOriginRef,
    ],
  );

  const handleMouseUp = useCallback(
    (e?: React.MouseEvent) => {
      if (
        stripDragStartRef.current &&
        selectedBuildingType &&
        isStripBuildType(selectedBuildingType)
      ) {
        const start = stripDragStartRef.current;
        stripDragStartRef.current = null;
        const loop = loopRef.current;
        const currentWorld = loop?.getWorld() ?? worldRef.current;
        const preview =
          loop?.getView().buildStripPreview ??
          buildStripPreview(
            currentWorld,
            selectedBuildingType,
            start.x,
            start.y,
            start.x,
            start.y,
            loop?.getView().buildRotation ?? 0,
          );

        // Commit only if all segments are valid
        const command = stripChainCommand(preview, selectedBuildingType);
        if (command) {
          playClickSound();
          applyGameAction(command);
          stripPlacedOnMouseUpRef.current = true;
        }
        loop?.patchView({ buildStripPreview: null });
      }

      // Short right-click cancels build mode
      if (rightClickOriginRef.current && e?.button === 2) {
        const ox = rightClickOriginRef.current.x;
        const oy = rightClickOriginRef.current.y;
        const dx = e.clientX - ox;
        const dy = e.clientY - oy;
        rightClickOriginRef.current = null;
        if (dx * dx + dy * dy < 36 && selectedBuildingType) {
          cancelBuildMode();
        }
      } else {
        rightClickOriginRef.current = null;
      }

      isDraggingRef.current = false;
      cameraDragStartRef.current = null;
      clickOriginRef.current = null;
    },
    [
      selectedBuildingType,
      applyGameAction,
      cancelBuildMode,
      stripDragStartRef,
      isDraggingRef,
      cameraDragStartRef,
      clickOriginRef,
      rightClickOriginRef,
      loopRef,
      worldRef,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    stripDragStartRef.current = null;
    isDraggingRef.current = false;
    cameraDragStartRef.current = null;
    clickOriginRef.current = null;
    rightClickOriginRef.current = null;
    stripPlacedOnMouseUpRef.current = false;
    loopRef.current?.patchView({ hoveredBuildingId: null, buildStripPreview: null }, true);
  }, [
    loopRef,
    stripDragStartRef,
    isDraggingRef,
    cameraDragStartRef,
    clickOriginRef,
    rightClickOriginRef,
  ]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Alt-tabbing (or a cancelled pointer) mid-drag never delivers mouseup/mouseleave to the
  // canvas, so the drag refs would stay set and the camera would follow the cursor with no
  // button pressed. Reset on focus loss on the same terms as leaving the canvas.
  useEffect(() => {
    const resetDrag = () => handleMouseLeave();
    window.addEventListener('blur', resetDrag);
    window.addEventListener('pointercancel', resetDrag);
    document.addEventListener('visibilitychange', resetDrag);
    return () => {
      window.removeEventListener('blur', resetDrag);
      window.removeEventListener('pointercancel', resetDrag);
      document.removeEventListener('visibilitychange', resetDrag);
    };
  }, [handleMouseLeave]);

  return {
    handleCanvasClick,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
  };
}
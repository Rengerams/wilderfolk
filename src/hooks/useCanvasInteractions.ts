import { useCallback, type RefObject } from 'react';
import type { GameLoop } from '../game/gameLoop';
import type { WorldState, BuildingType, Building, Entity } from '../game/gameEngine';
import type { EntityCatalog } from '../game/entityCatalog';
import {
  isStripBuildType,
  inferStripRotation,
  hitTestCamp,
  EntityType,
} from '../game/gameEngine';
import { canPlaceBuilding, buildStripPreview } from '../game/buildingActions';
import { screenToWorld, focusCameraOn, nudgeCameraToward, clampCameraTarget } from '../game/viewState';
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
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (clickOriginRef.current) {
      const dx = e.clientX - clickOriginRef.current.x;
      const dy = e.clientY - clickOriginRef.current.y;
      clickOriginRef.current = null;
      if (dx * dx + dy * dy > 16) return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = worldRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);

    if (selectedBuildingType) {
      const rotation = loopRef.current?.getView().buildRotation ?? 0;
      const { x: snapX, y: snapY } = snapBuildingCenter(selectedBuildingType, worldX, worldY, rotation);

      // Click an existing building while placement is invalid → select it & exit build mode
      // (so you don't need right-click just to open the inspector)
      if (!isStripBuildType(selectedBuildingType)) {
        const valid = canPlaceBuilding(world, selectedBuildingType, snapX, snapY, rotation);
        if (!valid) {
          let under: Building | null = null;
          for (const b of world.buildings) {
            if (
              worldX >= b.x - b.width / 2 && worldX <= b.x + b.width / 2
              && worldY >= b.y - b.height / 2 && worldY <= b.y + b.height / 2
            ) {
              under = b;
              break;
            }
          }
          if (under) {
            playClickSound();
            cancelBuildMode();
            loopRef.current?.patchView({
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
        const preview = buildStripPreview(world, selectedBuildingType, snapX, snapY, snapX, snapY, rotation);
        if (preview.segments.length > 0 && preview.segments.every((seg) => seg.valid)) {
          playClickSound();
          applyGameAction({
            proto: 1,
            op: 'placeStripChain',
            type: selectedBuildingType,
            segments: preview.segments,
            rotation: preview.rotation,
          });
        }
        // Stay in build mode for continuous strip / next segment
        return;
      }
      // Continuous place — keep tool selected for another click
      if (canPlaceBuilding(world, selectedBuildingType, snapX, snapY, rotation)) {
        playClickSound();
        applyGameAction({ proto: 1, op: 'startBuilding', type: selectedBuildingType, x: snapX, y: snapY, rotation });
      }
      return;
    }

    // Check building selection first so scenery inside the footprint doesn't steal clicks
    let clickedBuilding: Building | null = null;
    for (const b of world.buildings) {
      if (worldX >= b.x - b.width / 2 && worldX <= b.x + b.width / 2 &&
          worldY >= b.y - b.height / 2 && worldY <= b.y + b.height / 2) {
        clickedBuilding = b;
        break;
      }
    }

    // Check entity selection (humans still win over buildings; trees/grass do not)
    const camera = getViewCamera();
    const clickEntities = catalogRef.current?.getAlive()
      ?? world.entities.filter((ent) => ent.alive);
    let clickedEntity: Entity | null = null;
    for (const ent of clickEntities) {
      // Scenery (grass/trees) is never click-selectable — otherwise the dense,
      // array-first grass tiles win the hit-test race over citizens standing on
      // them (clicking a settler kept selecting grass instead).
      if (ent.type === EntityType.Tree || ent.type === EntityType.Grass) {
        continue;
      }
      if (ent.type === EntityType.Human) {
        // Human sprites are much taller than their collision size, so use the rendered bounds.
        const bounds = getHumanSelectionBounds(ent, camera.zoom);
        const dx = worldX - bounds.cx;
        const dy = worldY - bounds.cy;
        if ((dx / bounds.rx) ** 2 + (dy / bounds.ry) ** 2 <= 1) {
          clickedEntity = ent;
          break;
        }
        continue;
      }
      const dx = ent.x - worldX;
      const dy = ent.y - worldY;
      if (dx * dx + dy * dy <= (ent.size * 1.2 + 6) ** 2) {
        clickedEntity = ent;
        break;
      }
    }

    const campHit = hitTestCamp(world, worldX, worldY);
    if (campHit && !clickedEntity) {
      const campKey = `${campHit.kind}:${campHit.id}`;
      const loop = loopRef.current;
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
      const loop = loopRef.current;
      const focusTarget = clickedEntity ?? clickedBuilding;
      if (!focusTarget) return;
      const focusX = focusTarget.x;
      const focusY = focusTarget.y;
      if (loop) {
        const view = loop.getView();
        const viewPatch = juiceEffectsEnabled
          ? nudgeCameraToward(view, loop.getWorld(), focusX, focusY)
          : view;
        // Multi-select: shift-click toggles a settler in the selection; a
        // shift-click on a building keeps the settlers "armed" for multi-assign.
        let nextEntityIds: number[];
        if (clickedEntity) {
          const current = view.selectedEntityIds ?? (view.selectedEntityId != null ? [view.selectedEntityId] : []);
          nextEntityIds = e.shiftKey
            ? current.includes(clickedEntity.id)
              ? current.filter((id) => id !== clickedEntity.id)
              : [...current, clickedEntity.id]
            : [clickedEntity.id];
        } else {
          nextEntityIds = e.shiftKey
            ? view.selectedEntityIds ?? []
            : [];
        }
        loop.patchView({
          ...viewPatch,
          selectedEntityId: nextEntityIds[nextEntityIds.length - 1] ?? null,
          selectedEntityIds: nextEntityIds,
          selectedBuildingId: clickedBuilding?.id ?? null,
          highlightedCampKey: clickedEntity?.faction === 'rival' && clickedEntity.groupId
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
      loopRef.current?.patchView({
        selectedEntityId: null,
        selectedEntityIds: [],
        selectedBuildingId: null,
        highlightedCampKey: null,
        selectedCampKey: null,
      });
    }
  }, [selectedBuildingType, juiceEffectsEnabled, getViewCamera, applyGameAction, cancelBuildMode, canvasRef, worldRef, catalogRef, loopRef, clickOriginRef, setInspectorCollapsed]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = worldRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;
    const screenX = (e.clientX - rect.left) * (canvasW / rect.width);
    const screenY = (e.clientY - rect.top) * (canvasH / rect.height);
    const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);

    if (isDraggingRef.current && cameraDragStartRef.current) {
      const dx = e.clientX - cameraDragStartRef.current.x;
      const dy = e.clientY - cameraDragStartRef.current.y;
      const loop = loopRef.current;
      if (loop) {
        const cam = loop.getView().camera;
        const nextCam = {
          ...cam,
          targetX: cam.targetX - dx / cam.zoom,
          targetY: cam.targetY - dy / cam.zoom,
        };
        // Viewport-aware clamp: dragging can't expose an empty ring around the map.
        const w = loop.getWorld();
        const rect = canvasRef.current?.getBoundingClientRect();
        loop.patchView(
          {
            camera: clampCameraTarget(
              nextCam, w.width, w.height,
              rect?.width ?? w.width, rect?.height ?? w.height,
            ),
          },
          true,
        );
      }
      cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
    }

    // Track hovered building for visual highlight
    let hovered: Building | null = null;
    if (!selectedBuildingType && !isDraggingRef.current) {
      for (const b of world.buildings) {
        if (worldX >= b.x - b.width / 2 && worldX <= b.x + b.width / 2 &&
            worldY >= b.y - b.height / 2 && worldY <= b.y + b.height / 2) {
          hovered = b;
          break;
        }
      }
    }

    if (selectedBuildingType) {
      const loop = loopRef.current;
      const liveWorld = loop?.getWorld() ?? world;
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
        loop?.patchView({
          buildStripPreview: preview,
          buildRotation: rotation,
          buildGhost: null,
          hoveredBuildingId: hovered?.id ?? null,
        }, true);
      } else if (!isStripBuildType(selectedBuildingType)) {
        const rotation = loop?.getView().buildRotation ?? 0;
        const { x: snapX, y: snapY } = snapBuildingCenter(selectedBuildingType, worldX, worldY, rotation);
        const valid = canPlaceBuilding(liveWorld, selectedBuildingType, snapX, snapY, rotation);
        loop?.patchView({
          buildGhost: { x: snapX, y: snapY, valid },
          buildStripPreview: null,
          hoveredBuildingId: hovered?.id ?? null,
        }, true);
      } else {
        loop?.patchView({ hoveredBuildingId: hovered?.id ?? null }, true);
      }
    } else {
      loopRef.current?.patchView({ hoveredBuildingId: hovered?.id ?? null }, true);
    }
  }, [selectedBuildingType, getViewCamera, canvasRef, worldRef, loopRef, stripDragStartRef, isDraggingRef, cameraDragStartRef]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameplayActive && e.button === 0) {
      onPrimeAudioUnlock();
      audioStartedRef.current = true;
    }
    // Right-click: start pan; cancel build only on short click (mouseup)
    if (e.button === 2) {
      rightClickOriginRef.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = true;
      cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 0 && selectedBuildingType && isStripBuildType(selectedBuildingType)) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const canvasW = canvas.offsetWidth;
      const canvasH = canvas.offsetHeight;
      const screenX = (e.clientX - rect.left) * (canvasW / rect.width);
      const screenY = (e.clientY - rect.top) * (canvasH / rect.height);
      const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);
      stripDragStartRef.current = { x: worldX, y: worldY };
      return;
    }
    if (e.button === 1 || (e.button === 0 && !selectedBuildingType)) {
      isDraggingRef.current = true;
      cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
      clickOriginRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [gameplayActive, selectedBuildingType, onPrimeAudioUnlock, audioStartedRef, getViewCamera, canvasRef, stripDragStartRef, isDraggingRef, cameraDragStartRef, clickOriginRef, rightClickOriginRef]);

  const handleMouseUp = useCallback((e?: React.MouseEvent) => {
    if (stripDragStartRef.current && selectedBuildingType && isStripBuildType(selectedBuildingType)) {
      const start = stripDragStartRef.current;
      stripDragStartRef.current = null;
      const loop = loopRef.current;
      const preview = loop?.getView().buildStripPreview
        ?? buildStripPreview(
          loop?.getWorld() ?? worldRef.current,
          selectedBuildingType,
          start.x,
          start.y,
          start.x,
          start.y,
          loop?.getView().buildRotation ?? 0,
        );
      if (preview.segments.length > 0) {
        playClickSound();
        applyGameAction({ proto: 1, op: 'placeStripChain', type: selectedBuildingType, segments: preview.segments, rotation: preview.rotation });
      }
      loop?.patchView({ buildStripPreview: null });
    }
    // Short right-click cancels build; drag pans the map
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
  }, [selectedBuildingType, applyGameAction, cancelBuildMode, stripDragStartRef, isDraggingRef, cameraDragStartRef, clickOriginRef, rightClickOriginRef, loopRef, worldRef]);

  const handleMouseLeave = useCallback(() => {
    stripDragStartRef.current = null;
    isDraggingRef.current = false;
    cameraDragStartRef.current = null;
    clickOriginRef.current = null;
    rightClickOriginRef.current = null;
    loopRef.current?.patchView({ hoveredBuildingId: null, buildStripPreview: null }, true);
  }, [loopRef, stripDragStartRef, isDraggingRef, cameraDragStartRef, clickOriginRef, rightClickOriginRef]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    handleCanvasClick,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
  };
}

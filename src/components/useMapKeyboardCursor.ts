import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import {
  BUILDING_CONFIGS,
  GRID_SIZE,
  snapToGrid,
  type Camera,
  type WorldState,
} from '../game/gameEngine';
import type { WorldMap } from '../game/gameTypes';
import { screenToWorld, worldToScreen, type ViewState } from '../game/viewState';
import { supportsTerrainHeightMesh, terrainRiseAt } from '../game/terrainAtlas';
import { snapBuildingCenter } from '../game/buildingRotation';
import { getPlaceBuildingFailureReason } from '../game/buildingPlacementActions';
import { getPlaceBuildingFailureLabel } from '../game/buildingPlacementLabels';
import { isKeyboardClaimed } from '../game/keyboardOwnership';
import { findBuildingAt } from '../hooks/useCanvasInteractions';

/**
 * Keyboard cursor for the map canvas: arrows move it, Enter places/selects, Escape clears it.
 * It dispatches real pointer events (never a new command) and defers to `isKeyboardClaimed`.
 */

/**
 * One arrow-key step, in world units — two placement cells, so one press reads as about one building.
 */
export const MAP_CURSOR_STEP_WORLD_UNITS = GRID_SIZE * 2;

/** A point in world coordinates — the same space `screenToWorld` converts pointer pixels into. */
export interface MapCursorPoint {
  x: number;
  y: number;
}

/** The world rectangle the cursor may occupy. */
export interface MapCursorBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Arrow key → one cursor step. Screen +x is world +x; `worldToScreen` applies no rotation. */
const CURSOR_STEPS: Readonly<Record<string, MapCursorPoint | undefined>> = {
  ArrowUp: { x: 0, y: -MAP_CURSOR_STEP_WORLD_UNITS },
  ArrowDown: { x: 0, y: MAP_CURSOR_STEP_WORLD_UNITS },
  ArrowLeft: { x: -MAP_CURSOR_STEP_WORLD_UNITS, y: 0 },
  ArrowRight: { x: MAP_CURSOR_STEP_WORLD_UNITS, y: 0 },
};

/**
 * Activation key. Enter only, never Space: `useKeyboardControls` claims Space to pause in the capture phase.
 */
export const MAP_CURSOR_ACTIVATION_KEY = 'Enter';

/** Escape: clears the cursor. Cancelling an armed build type stays the game's own Escape chain. */
export const MAP_CURSOR_CANCEL_KEY = 'Escape';

const MAP_CURSOR_STEP_KEYS: readonly string[] = Object.freeze(Object.keys(CURSOR_STEPS));

/** Every key this hook binds — the table the hotkey guards check against `hotkeys.ts`. */
export const MAP_CURSOR_KEYS: readonly string[] = [
  ...MAP_CURSOR_STEP_KEYS,
  MAP_CURSOR_ACTIVATION_KEY,
  MAP_CURSOR_CANCEL_KEY,
];

/** `aria-keyshortcuts` value for the canvas — the same table, in the order the keys are listed. */
export const MAP_CURSOR_KEYSHORTCUTS = MAP_CURSOR_KEYS.join(' ');

/** What a key means, given the keyboard's current owner and whether a cursor exists. */
export type MapCursorIntent =
  | { type: 'move'; step: MapCursorPoint }
  | { type: 'reveal' }
  | { type: 'activate' }
  | { type: 'cancel' }
  | { type: 'none' };

export interface MapCursorIntentContext {
  /** True while an overlay holds the keyboard claim (`keyboardOwnership.isKeyboardClaimed`). */
  keyboardClaimed: boolean;
  /** True while a cursor is already on the map. */
  hasCursor: boolean;
  /** True for a held key's auto-repeat events (`KeyboardEvent.repeat`). */
  isRepeat: boolean;
}

/**
 * The key → intent mapping, ownership included, so the claim guard and its table stay one pinnable unit.
 */
export function resolveMapCursorIntent(key: string, context: MapCursorIntentContext): MapCursorIntent {
  if (context.keyboardClaimed) return { type: 'none' };
  const step = CURSOR_STEPS[key];
  // Holding an arrow walks the cursor, exactly as holding a movement key pans the camera.
  if (step) return { type: 'move', step };
  if (key === MAP_CURSOR_CANCEL_KEY) return { type: 'cancel' };
  if (key === MAP_CURSOR_ACTIVATION_KEY) {
    // A held Enter must not become a building spree: one press, one placement, the same as one click.
    // Every sibling hotkey in `useKeyboardControls` carries the same `!e.repeat` gate.
    if (context.isRepeat) return { type: 'none' };
    // The first Enter establishes the cursor rather than acting blind: nothing is under a cursor that
    // does not exist yet, and a placement is not something to spend on a guess.
    return context.hasCursor ? { type: 'activate' } : { type: 'reveal' };
  }
  return { type: 'none' };
}

function clampAxis(value: number, min: number, max: number): number {
  return max < min ? min : Math.min(max, Math.max(min, value));
}

/** The cursor pulled inside `bounds` — used when the camera moved under a resting cursor. */
export function clampMapCursor(cursor: MapCursorPoint, bounds: MapCursorBounds): MapCursorPoint {
  return {
    x: clampAxis(cursor.x, bounds.minX, bounds.maxX),
    y: clampAxis(cursor.y, bounds.minY, bounds.maxY),
  };
}

/** One step from `cursor`, clamped. */
export function moveMapCursor(
  cursor: MapCursorPoint,
  step: MapCursorPoint,
  bounds: MapCursorBounds,
): MapCursorPoint {
  return clampMapCursor({ x: cursor.x + step.x, y: cursor.y + step.y }, bounds);
}

/**
 * Where the cursor first appears: the canvas centre via `screenToWorld`, snapped to the placement lattice.
 */
export function initialMapCursorPoint(
  camera: Camera,
  viewportW: number,
  viewportH: number,
): MapCursorPoint {
  const [x, y] = screenToWorld(viewportW / 2, viewportH / 2, camera, viewportW, viewportH);
  return { x: snapToGrid(x, GRID_SIZE), y: snapToGrid(y, GRID_SIZE) };
}

/**
 * The cursor's movable rectangle: the map narrowed to the visible viewport; a zero-sized viewport
 * (before layout) falls back to the whole map rather than an inverted box.
 */
export function mapCursorBounds(
  camera: Camera,
  world: { width: number; height: number },
  viewportW: number,
  viewportH: number,
): MapCursorBounds {
  if (viewportW <= 0 || viewportH <= 0) {
    return { minX: 0, minY: 0, maxX: world.width, maxY: world.height };
  }
  const [left, top] = screenToWorld(0, 0, camera, viewportW, viewportH);
  const [right, bottom] = screenToWorld(viewportW, viewportH, camera, viewportW, viewportH);
  return {
    minX: Math.max(0, Math.min(left, world.width)),
    minY: Math.max(0, Math.min(top, world.height)),
    maxX: Math.min(world.width, Math.max(right, 0)),
    maxY: Math.min(world.height, Math.max(bottom, 0)),
  };
}

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A world point in `MouseEvent` client coordinates — the inverse of `getEventWorldCoords` in
 * `useCanvasInteractions`; both halves use the canvas's logical `offsetWidth`/`offsetHeight`.
 */
export function mapCursorClientPoint(
  cursor: MapCursorPoint,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  canvasRect: CanvasRect,
  map: WorldMap | null = null,
): { clientX: number; clientY: number } {
  if (canvasWidth <= 0 || canvasHeight <= 0 || canvasRect.width <= 0 || canvasRect.height <= 0) {
    return {
      clientX: canvasRect.left + canvasRect.width / 2,
      clientY: canvasRect.top + canvasRect.height / 2,
    };
  }
  const [screenX, screenY] = worldToScreen(
    cursor.x, cursor.y - (supportsTerrainHeightMesh(map) ? terrainRiseAt(map, cursor.x, cursor.y) : 0), camera, canvasWidth, canvasHeight,
  );
  return {
    clientX: canvasRect.left + screenX * (canvasRect.width / canvasWidth),
    clientY: canvasRect.top + screenY * (canvasRect.height / canvasHeight),
  };
}

/** The view fields the description reads, so a caller (and a test) can pass only those. */
export type MapCursorView = Pick<ViewState, 'buildMode' | 'buildRotation'>;

/**
 * Screen-reader text for the cursor: position, what is under it, and — while a build type is armed —
 * the placement owner's own verdict wording, exactly as the canvas ghost shows it.
 */
export function describeMapCursor(
  world: WorldState,
  view: MapCursorView,
  cursor: MapCursorPoint,
): string {
  const at = `${Math.round(cursor.x)}, ${Math.round(cursor.y)}`;
  const type = view.buildMode;
  if (type != null) {
    const rotation = view.buildRotation;
    const { x, y } = snapBuildingCenter(type, cursor.x, cursor.y, rotation);
    const label = BUILDING_CONFIGS[type].label;
    const reason = getPlaceBuildingFailureReason(world, type, x, y, rotation);
    return reason == null
      ? `Map cursor at ${at} — ${label} can be placed here. Press Enter to place.`
      : `Map cursor at ${at} — ${label} cannot be placed here: ${getPlaceBuildingFailureLabel(type, reason, world.researchNodes)}.`;
  }
  const hovered = findBuildingAt(world.buildings, cursor.x, cursor.y);
  return hovered == null
    ? `Map cursor at ${at} — open ground. Press Enter to select.`
    : `Map cursor at ${at} — ${BUILDING_CONFIGS[hovered.type].label}. Press Enter to select.`;
}

/**
 * Replay the cursor's world point as a real `MouseEvent`, so the keyboard rides the same `onClick` /
 * `onMouseMove` props as the pointer instead of a hand-built React event.
 */
function dispatchCursorPointerEvent(
  canvas: HTMLCanvasElement,
  type: 'mousemove' | 'click',
  cursor: MapCursorPoint,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  map: WorldMap | null,
): void {
  const { clientX, clientY } = mapCursorClientPoint(
    cursor,
    camera,
    canvasWidth,
    canvasHeight,
    canvas.getBoundingClientRect(),
    map,
  );
  canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));
}

export interface UseMapKeyboardCursorOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  worldRef: RefObject<WorldState>;
  /**
   * The live view — read only. The cursor is not stored in `ViewState` because nothing here can patch it.
   */
  viewRef: RefObject<ViewState>;
  /**
   * The marker element the cursor's screen position is written to. The component owns it: a ref must
   * not travel back out of a hook's return value, and this one is written outside render.
   */
  markerRef: RefObject<HTMLDivElement | null>;
}

export interface MapKeyboardCursorHandle {
  /** Canvas `onKeyDown`. */
  onKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void;
  /** True while a cursor is on the map. */
  active: boolean;
  /** Live description for the screen reader (empty until the cursor is first used). */
  announcement: string;
}

export function useMapKeyboardCursor({
  canvasRef,
  worldRef,
  viewRef,
  markerRef,
}: UseMapKeyboardCursorOptions): MapKeyboardCursorHandle {
  const cursorRef = useRef<MapCursorPoint | null>(null);
  const [active, setActive] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  /**
   * Canvas geometry and camera, read the way the pointer path reads them. The view ref can lag the
   * loop's silent camera patches until its next notification, so the marker trails during a fast pan.
   */
  const readViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width <= 0 || height <= 0) return null;
    return { canvas, width, height, camera: viewRef.current.camera };
  }, [canvasRef, viewRef]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
      const intent = resolveMapCursorIntent(event.key, {
        keyboardClaimed: isKeyboardClaimed(),
        hasCursor: cursorRef.current != null,
        isRepeat: event.repeat,
      });
      if (intent.type === 'none') return;

      const world = worldRef.current;
      const viewport = readViewport();
      if (!world || !viewport) return;
      const { canvas, camera, width, height } = viewport;

      event.preventDefault();

      if (intent.type === 'cancel') {
        // The armed build type is cancelled by `useKeyboardControls`' Escape chain before this runs,
        // so this half only clears the cursor: one owner per rule.
        cursorRef.current = null;
        setActive(false);
        setAnnouncement('');
        return;
      }

      const bounds = mapCursorBounds(camera, world, width, height);
      const from = cursorRef.current
        ?? initialMapCursorPoint(camera, width, height);
      const next = intent.type === 'move'
        ? moveMapCursor(from, intent.step, bounds)
        : clampMapCursor(from, bounds);

      cursorRef.current = next;
      setActive(true);

      // Show it: the pointer's own hover path puts the placement ghost (with the owner's verdict) or
      // the hovered-building highlight on the canvas, wherever the keyboard cursor is.
      dispatchCursorPointerEvent(canvas, 'mousemove', next, camera, width, height, world.worldMap);
      if (intent.type === 'activate') {
        // Place or select exactly as a click does — same handler, same coordinates, no new command.
        dispatchCursorPointerEvent(canvas, 'click', next, camera, width, height, world.worldMap);
      }

      setAnnouncement(describeMapCursor(world, viewRef.current, next));
    },
    [readViewport, viewRef, worldRef],
  );

  // The marker lives in screen space, so it follows the camera too: repaint every frame while a cursor exists.
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const paint = () => {
      const marker = markerRef.current;
      const cursor = cursorRef.current;
      const viewport = readViewport();
      if (marker && cursor && viewport) {
        const [screenX, screenY] = worldToScreen(
          cursor.x,
          cursor.y - (supportsTerrainHeightMesh(worldRef.current.worldMap)
            ? terrainRiseAt(worldRef.current.worldMap, cursor.x, cursor.y) : 0),
          viewport.camera,
          viewport.width,
          viewport.height,
        );
        marker.style.transform = `translate(${screenX}px, ${screenY}px)`;
        // Placed before it is shown: the marker mounts `invisible`, so it can never be seen at the
        // parent's origin for the frame between mounting and this write.
        marker.style.visibility = 'visible';
      }
      // Loop handle created inside this effect, never read during render.
      // oxlint-disable-next-line react/immutability
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [active, markerRef, readViewport, worldRef]);

  return { onKeyDown, active, announcement };
}

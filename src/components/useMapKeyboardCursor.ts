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
import { screenToWorld, worldToScreen, type ViewState } from '../game/viewState';
import { snapBuildingCenter } from '../game/buildingRotation';
import { getPlaceBuildingFailureReason } from '../game/buildingPlacementActions';
import { getPlaceBuildingFailureLabel } from '../game/buildingPlacementLabels';
import { isKeyboardClaimed } from '../game/keyboardOwnership';
import { findBuildingAt } from '../hooks/useCanvasInteractions';

/**
 * The map canvas's keyboard cursor — the keyboard path for the two actions the canvas only offered
 * to a pointer: placing the armed building type and selecting what is under the cursor
 * (bug 55 / OPEN-6; `GameMapStage`'s `role="img"` + `tabIndex` half landed with the 2026-09-20 audit,
 * A-2, which recorded the actions as "a design decision, not a mechanical a11y fix").
 *
 * Three rules shape the implementation:
 *
 *  1. **The UI never mutates the world and never invents a command.** Activating at the cursor
 *     dispatches the same `click` a pointer produces on the canvas, so placement and selection run
 *     through `useCanvasInteractions` → `applyGameAction` → `WorkerCommand`, unchanged. Moving the
 *     cursor dispatches the same `mousemove`, which is what makes the existing placement ghost
 *     (footprint outline + the placement owner's verdict label) follow the keyboard exactly as it
 *     follows the mouse — one visual language, not two.
 *  2. **One keyboard-ownership rule.** An overlay that claimed the keyboard owns every key, read
 *     through `keyboardOwnership.isKeyboardClaimed` — the same predicate `useKeyboardControls`
 *     returns on. This hook never claims, so the shared applier stays the only claim site.
 *  3. **The cursor is where the player can see it.** It is clamped to the map *and* to the visible
 *     viewport, so a keyboard user cannot walk it off screen (a pointer cannot leave the canvas
 *     either). Travelling further is the existing camera pan (WASD, drag, wheel, the mini-map).
 *
 * The cursor itself is live view state for a canvas this component does not paint — the map canvas
 * belongs to `GameLoop` — so the position is held here and the canvas is told about it through the
 * pointer path above. `GameMapStage` draws the screen-space marker from the same world point.
 *
 * The cursor maths and the key → intent mapping are pure and exported so they can be pinned without
 * a DOM (`tests/mapKeyboardCursor.test.ts`); the canvas wiring is a source contract
 * (`tests/keyboardGuards.contract.test.ts`).
 */

/**
 * One arrow-key step, in world units.
 *
 * Two placement cells: placement snaps to `GRID_SIZE` (20 wu), a Well is 30 × 30 wu and a House
 * 46 × 40 (`BUILDING_CONFIGS`), so two cells reads as "about one building per press" — coarse enough
 * to cross the valley in a few dozen presses, fine enough to land on a particular plot. A
 * screen-pixel step could not do this job: it is a different world distance at every zoom, and it
 * does not divide the lattice the placement snap uses.
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
 * The activation key. Enter only — deliberately **not** Space: `useKeyboardControls` binds Space to
 * pause on `window` in the capture phase, before any handler on the canvas can run, and
 * `isActivatableTarget` is false for a `role="img"` canvas (it matches buttons and `role="button"`,
 * which is why `MiniMap` can use Space). Space here would pause the game on every placement.
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
 * The key → intent mapping, ownership included.
 *
 * `keyboardClaimed` is part of the mapping rather than a caller's `if`, so the guard is one thing
 * with the table it guards and a test can pin it for every bound key at once.
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
 * Where the cursor appears when the player first presses a key: the world point at the middle of the
 * canvas — the pointer's own mapping (`screenToWorld`) rather than the camera field, so the two can
 * never disagree — snapped to the placement lattice so every later step stays on it.
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
 * The rectangle the cursor may move in: the map, narrowed to what the camera can actually show.
 *
 * A zero-sized viewport (before layout) falls back to the whole map rather than to an inverted box,
 * which would otherwise pin the cursor to a corner.
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
 * Where a world point is on the page, in `MouseEvent` client coordinates.
 *
 * The exact inverse of `useCanvasInteractions.getEventWorldCoords`, which reads a pointer back with
 * `screenToWorld((clientX − rect.left) · canvasW / rect.width, …)`. Both halves use the canvas's
 * `offsetWidth`/`offsetHeight` (the renderer's logical px), because that is the space
 * `worldToScreen` is defined in.
 */
export function mapCursorClientPoint(
  cursor: MapCursorPoint,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  canvasRect: CanvasRect,
): { clientX: number; clientY: number } {
  if (canvasWidth <= 0 || canvasHeight <= 0 || canvasRect.width <= 0 || canvasRect.height <= 0) {
    return {
      clientX: canvasRect.left + canvasRect.width / 2,
      clientY: canvasRect.top + canvasRect.height / 2,
    };
  }
  const [screenX, screenY] = worldToScreen(cursor.x, cursor.y, camera, canvasWidth, canvasHeight);
  return {
    clientX: canvasRect.left + screenX * (canvasRect.width / canvasWidth),
    clientY: canvasRect.top + screenY * (canvasRect.height / canvasHeight),
  };
}

/** The view fields the description reads, so a caller (and a test) can pass only those. */
export type MapCursorView = Pick<ViewState, 'buildMode' | 'buildRotation'>;

/**
 * What a screen reader hears for the cursor: where it is, what is under it, and — while a build type
 * is armed — whether the placement Enter would make is legal, in the placement owner's own wording
 * (`getPlaceBuildingFailureReason` decides, `buildingPlacementLabels` words it, exactly as the ghost
 * on the canvas does).
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
 * Send the canvas the pointer event the cursor's world point implies.
 *
 * A real `MouseEvent` on the canvas, not a hand-built React event object: it is delivered to the
 * same `onClick` / `onMouseMove` props the mouse uses, so the keyboard cannot drift from the pointer
 * path and no caller has to pretend to be a `React.MouseEvent`.
 */
function dispatchCursorPointerEvent(
  canvas: HTMLCanvasElement,
  type: 'mousemove' | 'click',
  cursor: MapCursorPoint,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const { clientX, clientY } = mapCursorClientPoint(
    cursor,
    camera,
    canvasWidth,
    canvasHeight,
    canvas.getBoundingClientRect(),
  );
  canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));
}

export interface UseMapKeyboardCursorOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  worldRef: RefObject<WorldState>;
  /**
   * The live view — read only. The cursor is not stored in `ViewState` because this component has no
   * way to patch it (the loop owns the view; `GameMapStage` receives no patch callback), and the
   * canvas already renders the pointer's own cursor state through the dispatched events above.
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
   * Canvas geometry and camera, read the way the pointer path reads them: `offsetWidth/Height` are
   * the renderer's logical pixels and `getBoundingClientRect()` is where they sit on the page.
   *
   * The camera is `viewRef.current.camera` — the ref the shell refreshes on every loop notification.
   * The loop also patches the view silently while the camera pans (momentum, drag) and only notifies
   * on its `UI_UPDATE_MS` cadence, so a pan can leave this read up to that cadence behind; the marker
   * therefore trails the map during a fast pan and settles with it. Reading the live camera needs a
   * loop handle `App.tsx` does not pass.
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
        // The armed build type is cancelled by the game's own Escape chain in `useKeyboardControls`
        // (which runs before this handler and calls `cancelBuildMode`), so this half only has to
        // clear the cursor: one owner per rule.
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
      dispatchCursorPointerEvent(canvas, 'mousemove', next, camera, width, height);
      if (intent.type === 'activate') {
        // Place or select exactly as a click does — same handler, same coordinates, no new command.
        dispatchCursorPointerEvent(canvas, 'click', next, camera, width, height);
      }

      setAnnouncement(describeMapCursor(world, viewRef.current, next));
    },
    [readViewport, viewRef, worldRef],
  );

  // The marker is positioned in the canvas's own screen space, so it has to follow the camera, not
  // only the cursor: the loop only guarantees the view at its own notification cadence, so this
  // repaints every frame while a cursor exists rather than on React renders.
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
          cursor.y,
          viewport.camera,
          viewport.width,
          viewport.height,
        );
        marker.style.transform = `translate(${screenX}px, ${screenY}px)`;
        // Placed before it is shown: the marker mounts `invisible`, so it can never be seen at the
        // parent's origin for the frame between mounting and this write.
        marker.style.visibility = 'visible';
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [active, markerRef, readViewport]);

  return { onKeyDown, active, announcement };
}

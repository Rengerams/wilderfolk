import { useRef, type ComponentProps, type RefObject } from 'react';
import type { WorldState } from '../game/gameEngine';
import {
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_PRESETS,
  CAMERA_ZOOM_STEP_IN,
  CAMERA_ZOOM_STEP_OUT,
  clampCameraZoom,
  type ViewState,
} from '../game/viewState';
import MiniMap from './MiniMap';
import {
  MAP_CURSOR_KEYSHORTCUTS,
  useMapKeyboardCursor,
} from './useMapKeyboardCursor';
import type { FpsSessionStats } from '../hooks/useFpsMeter';
import type { VirtualPlayerSession } from '../hooks/useVirtualPlayer';

type CanvasHandlers = Pick<
  ComponentProps<'canvas'>,
  'onClick' | 'onContextMenu' | 'onMouseDown' | 'onMouseLeave' | 'onMouseMove' | 'onMouseUp'
>;

export interface GameMapStageProps extends CanvasHandlers {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasCursor: string;
  fps: FpsSessionStats;
  showFps: boolean;
  /** Live auto-play session counters; `null` while auto-play is off. */
  autoPlaySession: VirtualPlayerSession | null;
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
  cameraTargetZoom: number;
  onNavigate: (worldX: number, worldY: number) => void;
  onApplyZoom: (factor: number) => void;
  onSetZoomLevel: (zoom: number) => void;
  onResetZoom: () => void;
}

/** Derives the preset shown by the map zoom control from a live camera target. */
export function getNearestCameraZoomPreset(cameraTargetZoom: number): number {
  const zoom = clampCameraZoom(cameraTargetZoom);
  return CAMERA_ZOOM_PRESETS.reduce(
    (nearest, preset) => (Math.abs(zoom - preset) < Math.abs(zoom - nearest) ? preset : nearest),
    CAMERA_ZOOM_PRESETS[0] ?? CAMERA_ZOOM_DEFAULT,
  );
}

/**
 * Presentation-only map surface. Canvas interaction policy remains in
 * useCanvasInteractions; this component passes handlers to the DOM canvas
 * and renders HUD overlay controls.
 *
 * The one policy it owns is the *keyboard* cursor (`useMapKeyboardCursor`): the canvas had a name
 * and a tab stop but no way to act on the map without a pointer.
 */
export default function GameMapStage({
  canvasRef,
  canvasCursor,
  fps,
  showFps,
  autoPlaySession,
  worldRef,
  viewRef,
  cameraTargetZoom,
  onNavigate,
  onApplyZoom,
  onSetZoomLevel,
  onResetZoom,
  onClick,
  onContextMenu,
  onMouseDown,
  onMouseLeave,
  onMouseMove,
  onMouseUp,
}: GameMapStageProps) {
  const zoom = clampCameraZoom(cameraTargetZoom);
  const selectedPreset = getNearestCameraZoomPreset(cameraTargetZoom);
  const cursorMarkerRef = useRef<HTMLDivElement | null>(null);
  const keyboardCursor = useMapKeyboardCursor({ canvasRef, worldRef, viewRef, markerRef: cursorMarkerRef });

  return (
    <>
      {/* The map is a bare rendered canvas: with no role, no name and no tab stop it was invisible
          to a screen reader and unreachable by Tab, so the app's main surface could not be reached
          without a mouse at all. `role="img"` + `aria-label` give it a text alternative and
          `tabIndex={0}` makes it focusable; neither touches the pointer handlers below, and the
          canvas keeps panning/zooming from the global hotkeys (WASD/arrows, +/−, H) once focused.

          The keyboard cursor closes the other half (bug 55 / OPEN-6): arrows move a cursor, Enter
          places the armed building or selects what is under it, Escape clears it, and the canvas
          describes the cursor through `aria-describedby` + a live region. Placement and selection
          go through the same handlers the mouse uses, and an overlay that owns the keyboard stops
          the whole thing (`useMapKeyboardCursor`). (2026-09-20 audit, A2) */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Valley map"
        aria-describedby="map-keyboard-cursor-status"
        aria-keyshortcuts={MAP_CURSOR_KEYSHORTCUTS}
        tabIndex={0}
        onKeyDown={keyboardCursor.onKeyDown}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onContextMenu={onContextMenu}
        className="map-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
          cursor: canvasCursor,
          display: 'block',
        }}
      />

      {/* The keyboard cursor's position, in the canvas's screen space. The marker only marks where
          the cursor is: what would be placed or selected there is the pointer's own visual, drawn by
          the canvas from the events `useMapKeyboardCursor` dispatches. `invisible` until the first
          paint places it — otherwise it renders one frame in the parent's top-left corner. */}
      {keyboardCursor.active && (
        <div
          ref={cursorMarkerRef}
          className="pointer-events-none invisible absolute left-0 top-0 z-[19]"
          aria-hidden
        >
          <span className="relative block h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_0_10px_rgba(251,191,36,0.45)]">
            <span className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200" />
          </span>
        </div>
      )}

      {/* Cursor state for a screen reader: what is under it and whether a placement is legal, in the
          placement owner's wording. `aria-live` (not just `aria-describedby`) because the cursor moves
          without focus ever leaving the canvas. */}
      <div id="map-keyboard-cursor-status" className="sr-only" aria-live="polite">
        {keyboardCursor.announcement}
      </div>

      {(showFps || autoPlaySession != null) && fps.current != null && (
        <div
          className="pointer-events-none absolute bottom-3 right-16 z-[35] rounded-md border border-emerald-400/30 bg-stone-950/80 px-2 py-1 font-mono text-xs font-bold tabular-nums text-emerald-300 shadow-lg backdrop-blur"
          aria-live="polite"
          title={`Session frame rate over ${fps.samples} sample${fps.samples === 1 ? '' : 's'}`}
        >
          <div>{fps.current} FPS</div>
          {fps.samples > 1 && (
            <div className="text-[10px] font-medium text-emerald-400/90">
              min {fps.min} · avg {fps.avg}
            </div>
          )}
          {autoPlaySession && (
            <div className="text-[10px] font-medium text-cyan-300/90">
              👥 {autoPlaySession.settlers} · 🏠 {autoPlaySession.buildings} · {autoPlaySession.acts} acts
            </div>
          )}
        </div>
      )}

      <div className="map-frame-overlay pointer-events-none absolute inset-0 z-[5]" aria-hidden />

      <MiniMap worldRef={worldRef} viewRef={viewRef} onNavigate={onNavigate} />

      <div className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col items-stretch gap-0.5 rounded-lg border border-stone-600 bg-stone-800/85 p-1 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={() => onApplyZoom(CAMERA_ZOOM_STEP_IN)}
          disabled={cameraTargetZoom >= CAMERA_ZOOM_MAX - 1e-3}
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 transition-colors"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          +
        </button>

        <label className="sr-only" htmlFor="camera-zoom-preset">
          Zoom level
        </label>
        {/* The panel stacked the snapped preset % above the live zoom % with no visible
            label, so after one `+` the player saw "145%" over "160%" and no way to tell which was
            which without hovering. Both now say what they are. */}
        <span className="text-center text-[9px] font-semibold uppercase tracking-wider text-stone-500">
          Set
        </span>

        <select
          id="camera-zoom-preset"
          value={String(selectedPreset)}
          onChange={(event) => onSetZoomLevel(Number(event.target.value))}
          className="h-7 w-9 cursor-pointer appearance-none rounded-md border-0 bg-stone-700/60 px-0 text-center text-[11px] font-semibold tabular-nums text-stone-200 hover:bg-stone-600/80 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-colors"
          title="Pick a zoom preset"
          aria-label="Zoom preset"
        >
          {CAMERA_ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {Math.round(preset * 100)}%
            </option>
          ))}
        </select>

        <span className="text-center text-[9px] font-semibold uppercase tracking-wider text-stone-500">
          Live
        </span>

        <div
          className="px-0.5 text-center text-[10px] font-medium tabular-nums text-stone-400 select-none"
          title="Live zoom"
        >
          {Math.round(zoom * 100)}%
        </div>

        <button
          type="button"
          onClick={() => onApplyZoom(CAMERA_ZOOM_STEP_OUT)}
          disabled={cameraTargetZoom <= CAMERA_ZOOM_MIN + 1e-3}
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 transition-colors"
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          −
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="flex h-7 w-8 items-center justify-center rounded-md text-[13px] text-stone-400 hover:bg-stone-700/80 hover:text-stone-200 transition-colors"
          title={`Reset zoom (${Math.round(CAMERA_ZOOM_DEFAULT * 100)}%)`}
          aria-label="Reset zoom"
        >
          ⟲
        </button>
      </div>
    </>
  );
}
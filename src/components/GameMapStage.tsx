import type { ComponentProps, RefObject } from 'react';
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

type CanvasHandlers = Pick<
  ComponentProps<'canvas'>,
  'onClick' | 'onContextMenu' | 'onMouseDown' | 'onMouseLeave' | 'onMouseMove' | 'onMouseUp'
>;

type GameMapStageProps = CanvasHandlers & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasCursor: string;
  fps: number | null;
  showFps: boolean;
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
  cameraTargetZoom: number;
  onNavigate: (worldX: number, worldY: number) => void;
  onApplyZoom: (factor: number) => void;
  onSetZoomLevel: (zoom: number) => void;
  onResetZoom: () => void;
};

/** Derives the preset shown by the map zoom control from a live camera target. */
export function getNearestCameraZoomPreset(cameraTargetZoom: number): number {
  const zoom = clampCameraZoom(cameraTargetZoom);
  return CAMERA_ZOOM_PRESETS.reduce(
    (nearest, preset) => (
      Math.abs(zoom - preset) < Math.abs(zoom - nearest) ? preset : nearest
    ), CAMERA_ZOOM_PRESETS[0] ?? CAMERA_ZOOM_DEFAULT);
}

/**
 * Presentation-only map surface. Canvas interaction policy remains in
 * useCanvasInteractions; this component simply passes the established handlers
 * to the DOM and renders local map controls.
 */
export default function GameMapStage({
  canvasRef,
  canvasCursor,
  fps,
  showFps,
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

  return (
    <>
      <canvas
        ref={canvasRef}
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
      {showFps && fps != null && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[35] rounded-md border border-emerald-400/30 bg-stone-950/80 px-2 py-1 font-mono text-xs font-bold tabular-nums text-emerald-300 shadow-lg backdrop-blur" aria-live="polite">
          {fps} FPS
        </div>
      )}
      <div className="map-frame-overlay pointer-events-none absolute inset-0 z-[5]" aria-hidden />
      <MiniMap worldRef={worldRef} viewRef={viewRef} onNavigate={onNavigate} />
      <div className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col items-stretch gap-0.5 rounded-lg border border-stone-600 bg-stone-800/85 p-1 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={() => onApplyZoom(CAMERA_ZOOM_STEP_IN)}
          disabled={cameraTargetZoom >= CAMERA_ZOOM_MAX - 1e-3}
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          +
        </button>
        <label className="sr-only" htmlFor="camera-zoom-preset">Zoom level</label>
        <select
          id="camera-zoom-preset"
          value={String(selectedPreset)}
          onChange={(event) => onSetZoomLevel(Number(event.target.value))}
          className="h-7 w-9 cursor-pointer appearance-none rounded-md border-0 bg-stone-700/60 px-0 text-center text-[11px] font-semibold tabular-nums text-stone-200 hover:bg-stone-600/80 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          title={`Zoom ${Math.round(zoom * 100)}% — pick a preset`}
          aria-label="Zoom preset"
        >
          {CAMERA_ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {Math.round(preset * 100)}%
            </option>
          ))}
        </select>
        <div className="px-0.5 text-center text-[10px] font-medium tabular-nums text-stone-400" title="Live zoom">
          {Math.round(zoom * 100)}%
        </div>
        <button
          type="button"
          onClick={() => onApplyZoom(CAMERA_ZOOM_STEP_OUT)}
          disabled={cameraTargetZoom <= CAMERA_ZOOM_MIN + 1e-3}
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          className="flex h-7 w-8 items-center justify-center rounded-md text-[13px] text-stone-400 hover:bg-stone-700/80 hover:text-stone-200"
          title={`Reset zoom (${Math.round(CAMERA_ZOOM_DEFAULT * 100)}%)`}
          aria-label="Reset zoom"
        >
          ⟲
        </button>
      </div>
    </>
  );
}

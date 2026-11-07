/**
 * Headless sim focus, matching in-game camera throttling: without it every entity counts as on screen.
 * `SIM_FULL_SIM=1` disables throttling; `SIM_ZOOM` sets the focus-box zoom.
 */
import type { WorldState } from '../src/game/gameTypes';
import { createSimFocus, type SimulationFocus } from '../src/game/gameEngine';

/** Margin baked into createSimFocus / computeSimulationFocus (keep in sync). */
const FOCUS_MARGIN = 120;
const CANVAS_W = 1280;
const CANVAS_H = 720;

/** Village-sized viewport half-width in world units (settlers cluster near map center). */
function defaultSimZoom(state: Pick<WorldState, 'width' | 'height'>): number {
  // zoom 0.45 on a 1600-wide map ≈ entire map "on screen" — off-screen throttle never fires.
  const targetHalfW = Math.min(520, Math.max(360, state.width * 0.33));
  return CANVAS_W / (2 * Math.max(80, targetHalfW - FOCUS_MARGIN));
}

export function getSimFocus(state: Pick<WorldState, 'width' | 'height'>): SimulationFocus | undefined {
  if (process.env.SIM_FULL_SIM === '1') return undefined;
  const envZoom = process.env.SIM_ZOOM;
  const zoom = envZoom != null && envZoom !== ''
    ? Number(envZoom) || defaultSimZoom(state)
    : defaultSimZoom(state);
  return createSimFocus(state, { zoom, canvasWidth: CANVAS_W, canvasHeight: CANVAS_H });
}
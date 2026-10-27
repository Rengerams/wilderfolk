/** The mini-map's frame cadence: the panel registers one paint, `renderGame` drives it. */

/** Frames between mini-map repaints — the interval its own `requestAnimationFrame` loop ran at. */
export const MINI_MAP_FRAME_INTERVAL = 5;

/** Whether this main-loop frame is the panel's repaint — 12 Hz when the loop runs at 60 fps. */
export function shouldRepaintMiniMap(frame: number): boolean {
  return frame % MINI_MAP_FRAME_INTERVAL === 0;
}

let paint: (() => void) | null = null;

/** The panel hands its paint in on mount; the main render loop drives it from there. */
export function registerMiniMapFrameDraw(fn: (() => void) | null): void {
  paint = fn;
}

/** One frame of the main render loop. The panel decides whether this frame repaints it. */
export function drawMiniMapFrame(): void {
  paint?.();
}

import type { RenderSnapshot } from '../renderSnapshot';

const SCENT_DEBUG = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SCENT_DEBUG === '1';

function worldToScreenX(wx: number, cam: RenderSnapshot['camera'], cw: number): number {
  return (wx - cam.x) * cam.zoom + cw / 2;
}

function worldToScreenY(wy: number, cam: RenderSnapshot['camera'], ch: number): number {
  return (wy - cam.y) * cam.zoom + ch / 2;
}

// ============ SCENT OVERLAY ============
export function drawScentOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!SCENT_DEBUG) return;
  const grid = state.scentGrid;
  const reader = state.scentReader;
  if (!grid && !reader) return;

  const cam = state.camera;
  const cellSize = grid?.cellSize ?? reader!.cellSize;
  const cols = grid?.cols ?? reader!.cols;
  const rows = grid?.rows ?? reader!.rows;
  let max = 0;
  if (reader) {
    max = reader.maxScent();
  } else if (grid) {
    for (let i = 0; i < grid.values.length; i++) {
      if (grid.values[i] > max) max = grid.values[i];
    }
  }
  if (max <= 0) return;

  const wl = cam.x - (cw / 2) / cam.zoom;
  const wr = cam.x + (cw / 2) / cam.zoom;
  const wt = cam.y - (ch / 2) / cam.zoom;
  const wb = cam.y + (ch / 2) / cam.zoom;
  const col0 = Math.max(0, Math.floor(wl / cellSize));
  const col1 = Math.min(cols - 1, Math.ceil(wr / cellSize));
  const row0 = Math.max(0, Math.floor(wt / cellSize));
  const row1 = Math.min(rows - 1, Math.ceil(wb / cellSize));
  const cellPx = cellSize * cam.zoom;

  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const scent = grid ? grid.values[row * cols + col] : reader!.scentAt(col, row);
      if (scent <= 0) continue;
      const sx = worldToScreenX(col * cellSize, cam, cw);
      const sy = worldToScreenY(row * cellSize, cam, ch);
      const alpha = Math.min(0.5, (scent / max) * 0.45);
      ctx.fillStyle = `rgba(168,72,232,${alpha})`;
      ctx.fillRect(sx, sy, cellPx, cellPx);
    }
  }
}

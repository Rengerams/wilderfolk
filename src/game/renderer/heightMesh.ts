/**
 * Textured 2.5D ground: project an existing flat Whittaker chunk onto the same
 * 32px triangular elevation mesh used by all world-space entity foot positions.
 *
 * Baked ONLY when the source chunk completes (or its coarse preview appears).
 * The main draw loop then does one ordinary drawImage per cached projected chunk;
 * there are no triangle transforms or height samples per animation frame.
 */
import type { WorldMap } from '../gameTypes';
import { TERRAIN_HEIGHT_MESH_MAX_RISE, TERRAIN_HEIGHT_MESH_STEP, supportsTerrainHeightMesh, terrainRiseAt } from '../terrainAtlas';
import { createCanvasSurface, getCanvasContext, type CanvasContext2d, type CanvasSurface } from '../canvasLayer';

export const HEIGHT_MESH_TOP_PAD = TERRAIN_HEIGHT_MESH_MAX_RISE;

/** A world rect — all coordinates refer to the unprojected simulation XY plane. */
export interface HeightMeshRect {
  x: number; y: number; width: number; height: number;
}

/** Source vertex in world-relative coordinates; only the destination y changes. */
interface Vertex {
  x: number; y: number; rise: number;
}

/**
 * Approximate the unique ground coordinate under a pixel. Because the mesh's maximum
 * 28px rise is smaller than its 32px cell, y → y − rise is strictly increasing.
 * A bounded bisection gives an unambiguous inverse even on the steepest cliffs.
 */
export function unprojectTerrainY(map: WorldMap | null, x: number, flatY: number): number {
  // v1/v2 draw flat terrain: keep their historic XY pointer mapping unchanged.
  if (!supportsTerrainHeightMesh(map)) return flatY;
  // Rise is bounded in [0, 28] and a 32px mesh edge guarantees no vertical fold.
  // Bisection converges in a fixed 16 probes even on the maximum possible grade.
  let low = flatY;
  let high = flatY + TERRAIN_HEIGHT_MESH_MAX_RISE;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) * 0.5;
    if (mid - terrainRiseAt(map, x, mid) < flatY) low = mid;
    else high = mid;
  }
  return (low + high) * 0.5;
}

/**
 * Clip source material to one projected triangle, then apply an affine y warp.
 *
 * For a planar triangle rise(x,y)=gx*x+gy*y+intercept, x' = x and
 * y' = y + pad - rise(x,y). This avoids heavyweight WebGL and draws exactly the
 * source texels belonging to each cell, rather than re-blitting the whole chunk.
 */
function paintTriangle(
  ctx: CanvasContext2d,
  source: CanvasSurface,
  rect: HeightMeshRect,
  a: Vertex,
  b: Vertex,
  c: Vertex,
  x0: number, y0: number,
  cellW: number, cellH: number,
): void {
  const det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(det) < 0.01) return;
  const gx = ((b.rise - a.rise) * (c.y - a.y) - (c.rise - a.rise) * (b.y - a.y)) / det;
  const gy = ((b.x - a.x) * (c.rise - a.rise) - (c.x - a.x) * (b.rise - a.rise)) / det;
  const intercept = a.rise - gx * a.x - gy * a.y;

  // Adjacent Canvas clip masks each antialias the exact shared edge down
  // toward alpha 0. Their two half-covered triangles leave a visible diagonal
  // seam in opaque water and soil. Overlap triangle masks slightly, and extend
  // the source crop past the nominal cell so the overlapping clip has texels.
  const ax = a.x, ay = a.y + HEIGHT_MESH_TOP_PAD - a.rise;
  const bx = b.x, by = b.y + HEIGHT_MESH_TOP_PAD - b.rise;
  const cx = c.x, cy = c.y + HEIGHT_MESH_TOP_PAD - c.rise;
  const centerX = (ax + bx + cx) / 3;
  const centerY = (ay + by + cy) / 3;
  const expand = (x: number, y: number): [number, number] => {
    const dx = x - centerX, dy = y - centerY;
    const len = Math.hypot(dx, dy) || 1;
    return [x + dx / len * 1.35, y + dy / len * 1.35];
  };
  const [paX, paY] = expand(ax, ay);
  const [pbX, pbY] = expand(bx, by);
  const [pcX, pcY] = expand(cx, cy);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(paX, paY);
  ctx.lineTo(pbX, pbY);
  ctx.lineTo(pcX, pcY);
  ctx.closePath();
  ctx.clip();
  ctx.transform(1, -gx, 0, 1 - gy, 0, HEIGHT_MESH_TOP_PAD - intercept);

  // Cropping source before affine drawing cuts the work from O(chunk²*triangles)
  // to O(chunk²) total source texels across its triangles.
  const padding = 2;
  const left = Math.max(0, x0 - padding);
  const top = Math.max(0, y0 - padding);
  const right = Math.min(rect.width, x0 + cellW + padding);
  const bottom = Math.min(rect.height, y0 + cellH + padding);
  ctx.drawImage(
    source as CanvasImageSource,
    left * source.width / rect.width,
    top * source.height / rect.height,
    (right - left) * source.width / rect.width,
    (bottom - top) * source.height / rect.height,
    left, top, right - left, bottom - top,
  );
  ctx.restore();
}

/** Cached mesh version of an already baked flat ground chunk. */
export function bakeHeightMeshSurface(
  source: CanvasSurface,
  map: WorldMap,
  rect: HeightMeshRect,
): CanvasSurface {
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const projected = createCanvasSurface(width, height + HEIGHT_MESH_TOP_PAD);
  const ctx = getCanvasContext(projected);
  ctx.imageSmoothingEnabled = true;
  const s = TERRAIN_HEIGHT_MESH_STEP;
  // Far-to-near row order: near faces overlay the portion of far faces hidden by a ridge.
  for (let y0 = 0; y0 < height; y0 += s) {
    const cellH = Math.min(s, height - y0);
    for (let x0 = 0; x0 < width; x0 += s) {
      const cellW = Math.min(s, width - x0);
      const x1 = x0 + cellW, y1 = y0 + cellH;
      const a: Vertex = { x: x0, y: y0, rise: terrainRiseAt(map, rect.x + x0, rect.y + y0) };
      const b: Vertex = { x: x1, y: y0, rise: terrainRiseAt(map, rect.x + x1, rect.y + y0) };
      const c: Vertex = { x: x0, y: y1, rise: terrainRiseAt(map, rect.x + x0, rect.y + y1) };
      const d: Vertex = { x: x1, y: y1, rise: terrainRiseAt(map, rect.x + x1, rect.y + y1) };
      // Same anti-diagonal split as terrainRiseAt, important for exact sprite grounding.
      paintTriangle(ctx, source, rect, a, b, c, x0, y0, cellW, cellH);
      paintTriangle(ctx, source, rect, b, d, c, x0, y0, cellW, cellH);
    }
  }
  return projected;
}

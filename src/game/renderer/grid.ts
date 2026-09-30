import { GRID_SIZE, TERRAIN_TILE_SIZE, snapToGrid } from '../gameTypes';
import { isNightHour } from '../dayCycle';
import { getBuildingFootprintForType, snapBuildingCenter } from '../buildingRotation';
import { canPlaceBuildingSnapshot } from '../placementUtils';
import { isUnbuildableTerrainType, isWaterTerrainType } from '../terrain/terrainTraits';
import { terrainRiseAt } from '../terrainAtlas';
import { isStripBuildType } from '../stripBuild';
import { tileTypeAt } from '../terrain/terrainGrid';
import {
  drawProceduralStripBuilding,
  drawStripJunctionOverlay,
} from '../stripRender';
import { worldToScreen as w2s, worldToScreenX, worldToScreenY } from '../viewState';
import type { RenderSnapshot } from '../renderSnapshot';

const GRID_MAJOR_EVERY = 5;

interface GridViewport {
  sx0: number;
  ex: number;
  sy0: number;
  ey: number;
  mx0: number;
  my0: number;
  majorEx: number;
  majorEy: number;
}

function getGridViewport(cam: RenderSnapshot['camera'], cw: number, ch: number): GridViewport {
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const halfW = (cw / 2) / cam.zoom;
  const halfH = (ch / 2) / cam.zoom;
  const wl = cam.x - halfW;
  const wr = cam.x + halfW;
  const wt = cam.y - halfH;
  const wb = cam.y + halfH;

  const sx0 = Math.floor(wl / gs) * gs;
  const sy0 = Math.floor(wt / gs) * gs;
  const mx0 = Math.floor(wl / majorGs) * majorGs;
  const my0 = Math.floor(wt / majorGs) * majorGs;

  return {
    sx0,
    ex: Math.ceil((wr - sx0) / gs) * gs + sx0,
    sy0,
    ey: Math.ceil((wb - sy0) / gs) * gs + sy0,
    mx0,
    my0,
    majorEx: Math.ceil((wr - mx0) / majorGs) * majorGs + mx0,
    majorEy: Math.ceil((wb - my0) / majorGs) * majorGs + my0,
  };
}

// Axis projections of the single owner transform (`viewState.worldToScreen`): the formula lives only
// there, and the D27 wiring guard in `tests/visualsAudit.renderWiring.test.ts` pins the call site by
// name (`worldToScreenX(cx, cam, cw)`). These are the owner's own single-axis accessors — imported,
// not restated — so a grid line no longer allocates a `[x, y]` tuple and discards half of it.

/**
 * Strokes grid lines. Correctly uses major offsets (mx0/my0) when drawing major lines
 * to prevent phase-shifting and visual stutter on camera pan.
 */
export function strokeGridLines(
  ctx: CanvasRenderingContext2D,
  vp: GridViewport,
  cam: RenderSnapshot['camera'],
  cw: number,
  ch: number,
  step: number,
  skipMajor: boolean,
  color: string,
  shadowColor: string,
  lineWidth: number,
) {
  const gs = GRID_SIZE;
  const isMajor = step >= gs * GRID_MAJOR_EVERY;
  const startX = isMajor ? vp.mx0 : vp.sx0;
  const endX = isMajor ? vp.majorEx : vp.ex;
  const startY = isMajor ? vp.my0 : vp.sy0;
  const endY = isMajor ? vp.majorEy : vp.ey;

  // Shadow pass
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = lineWidth + 0.8;
  ctx.beginPath();
  for (let x = startX; x <= endX; x += step) {
    if (skipMajor && Math.round(x / gs) % GRID_MAJOR_EVERY === 0) continue;
    const px = worldToScreenX(x, cam, cw) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, ch);
  }
  for (let y = startY; y <= endY; y += step) {
    if (skipMajor && Math.round(y / gs) % GRID_MAJOR_EVERY === 0) continue;
    const py = worldToScreenY(y, cam, ch) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(cw, py);
  }
  ctx.stroke();

  // Primary pass
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let x = startX; x <= endX; x += step) {
    if (skipMajor && Math.round(x / gs) % GRID_MAJOR_EVERY === 0) continue;
    const px = worldToScreenX(x, cam, cw);
    ctx.moveTo(px, 0);
    ctx.lineTo(px, ch);
  }
  for (let y = startY; y <= endY; y += step) {
    if (skipMajor && Math.round(y / gs) % GRID_MAJOR_EVERY === 0) continue;
    const py = worldToScreenY(y, cam, ch);
    ctx.moveTo(0, py);
    ctx.lineTo(cw, py);
  }
  ctx.stroke();
}

/** Soft diamond “tile” at a screen point — 2.5D grid cell / snap marker. */
export function drawIsoCellMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  fill: string,
  stroke?: string,
  lineWidth = 1,
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}


/** Terrain blockers + focused valid snap points while placing a building. */
export function drawBuildZoneOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.buildMode || !state.worldMap) return;
  const cam = state.camera;
  const map = state.worldMap;
  const halfW = (cw / 2) / cam.zoom;
  const halfH = (ch / 2) / cam.zoom;
  const wl = cam.x - halfW;
  const wr = cam.x + halfW;
  const wt = cam.y - halfH;
  const wb = cam.y + halfH;

  const startTx = Math.max(0, Math.floor(wl / TERRAIN_TILE_SIZE));
  const endTx = Math.min(map.width - 1, Math.ceil(wr / TERRAIN_TILE_SIZE));
  const startTy = Math.max(0, Math.floor(wt / TERRAIN_TILE_SIZE));
  const endTy = Math.min(map.height - 1, Math.ceil(wb / TERRAIN_TILE_SIZE));

  const blockerHw = (TERRAIN_TILE_SIZE * 0.48) * cam.zoom;
  const blockerHh = (TERRAIN_TILE_SIZE * 0.28) * cam.zoom;
  const lipHeight = Math.max(2, 3 * cam.zoom);

  // 1. Render unbuildable terrain markers
  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const type = tileTypeAt(map, tx, ty);
      if (type === null || !isUnbuildableTerrainType(type)) continue;
      if (isWaterTerrainType(type)) continue;

      const wx = tx * TERRAIN_TILE_SIZE + TERRAIN_TILE_SIZE / 2;
      const wy = ty * TERRAIN_TILE_SIZE + TERRAIN_TILE_SIZE / 2;
      const cx = worldToScreenX(wx, cam, cw);
      const cy = worldToScreenY(wy, cam, ch);

      drawIsoCellMarker(
        ctx, cx, cy, blockerHw, blockerHh,
        'rgba(185, 28, 28, 0.32)',
        'rgba(252, 165, 165, 0.35)',
        Math.max(0.8, 1.1 * cam.zoom),
      );

      // South lip for 2.5D elevation
      ctx.fillStyle = 'rgba(80, 10, 10, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cx - blockerHw, cy);
      ctx.lineTo(cx, cy + blockerHh);
      ctx.lineTo(cx + blockerHw, cy);
      ctx.lineTo(cx, cy + blockerHh + lipHeight);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (cam.zoom < 0.45) return;

  // 2. Focused Snap Markers (Restricted to a radius around the cursor/ghost to protect 60 FPS)
  const gs = GRID_SIZE;
  const placeType = state.buildMode;
  const focusX = state.buildGhost?.x ?? cam.x;
  const focusY = state.buildGhost?.y ?? cam.y;
  const focusRadius = Math.min(Math.max(cw, ch) / cam.zoom * 0.45, 280);

  const startX = Math.max(wl, Math.floor((focusX - focusRadius) / gs) * gs);
  const endX = Math.min(wr, Math.ceil((focusX + focusRadius) / gs) * gs);
  const startY = Math.max(wt, Math.floor((focusY - focusRadius) / gs) * gs);
  const endY = Math.min(wb, Math.ceil((focusY + focusRadius) / gs) * gs);

  const hw = Math.max(3.5, 5.5 * cam.zoom);
  const hh = Math.max(2, 3.2 * cam.zoom);
  const focusRadiusSq = focusRadius * focusRadius;

  ctx.save();
  for (let wx = startX; wx <= endX; wx += gs) {
    for (let wy = startY; wy <= endY; wy += gs) {
      const dx = wx - focusX;
      const dy = wy - focusY;
      if (dx * dx + dy * dy > focusRadiusSq) continue;

      const { x: snapX, y: snapY } = snapBuildingCenter(placeType, wx, wy, state.buildRotation);
      const valid = canPlaceBuildingSnapshot(state, placeType, snapX, snapY, state.buildRotation);
      const px = worldToScreenX(snapX, cam, cw);
      const py = worldToScreenY(snapY, cam, ch);

      if (valid) {
        drawIsoCellMarker(
          ctx, px, py, hw, hh,
          'rgba(34, 197, 94, 0.55)',
          'rgba(167, 243, 208, 0.85)',
          Math.max(0.9, 1.2 * cam.zoom),
        );
        ctx.fillStyle = 'rgba(220, 252, 231, 0.9)';
        ctx.beginPath();
        ctx.ellipse(px, py - hh * 0.15, hw * 0.28, hh * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawIsoCellMarker(
          ctx, px, py, hw * 0.85, hh * 0.85,
          'rgba(248, 113, 113, 0.24)',
          'rgba(252, 165, 165, 0.35)',
          1,
        );
      }
    }
  }
  ctx.restore();
}

export function drawGrid(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.showGrid || !state.buildMode) return;
  const cam = state.camera;
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const vp = getGridViewport(cam, cw, ch);

  // Validity checker on coarse cells — diamond plates
  if (cam.zoom >= 0.3 && state.buildMode) {
    const halfW = (majorGs * 0.48) * cam.zoom;
    const halfH = (majorGs * 0.26) * cam.zoom;
    for (let wx = vp.mx0; wx <= vp.majorEx; wx += majorGs) {
      for (let wy = vp.my0; wy <= vp.majorEy; wy += majorGs) {
        const rawX = wx + majorGs / 2;
        const rawY = wy + majorGs / 2;
        const { x: cx, y: cy } = state.buildMode
          ? snapBuildingCenter(state.buildMode, rawX, rawY, state.buildRotation)
          : { x: snapToGrid(rawX, gs), y: snapToGrid(rawY, gs) };
        // Plate and verdict share one centre. The marker used to sit on the raw major-cell centre
        // while `canPlaceBuildingSnapshot` was asked about the *snapped* centre — for a multi-tile
        // footprint a different cell (the coarse lattice is 100 wu, placement snaps to GRID_SIZE =
        // 20), so a plate could show the verdict of the cell beside it. `drawBuildZoneOverlay`
        // below already draws at the snapped centre.
        const px = worldToScreenX(cx, cam, cw);
        const py = worldToScreenY(cy, cam, ch);
        if (px + halfW < 0 || px - halfW > cw || py + halfH < 0 || py - halfH > ch) continue;
        const valid = canPlaceBuildingSnapshot(state, state.buildMode, cx, cy, state.buildRotation);
        drawIsoCellMarker(
          ctx, px, py, halfW, halfH,
          valid ? 'rgba(16, 185, 129, 0.16)' : 'rgba(127, 29, 29, 0.2)',
          valid ? 'rgba(52, 211, 153, 0.22)' : 'rgba(248, 113, 113, 0.22)',
          Math.max(0.7, 1 / cam.zoom),
        );
      }
    }
  }

  // Stable scale hint when zoomed in during build (anchored to first visible interior cell)
  if (cam.zoom >= 0.75) {
    ctx.font = `bold ${Math.max(8, Math.round(9 * cam.zoom))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(167, 243, 208, 0.75)';
    const label = `${majorGs}u`;
    const targetX = Math.max(vp.mx0 + majorGs * 0.5, cam.x - (cw * 0.35) / cam.zoom);
    const targetY = Math.max(vp.my0 + majorGs * 0.5, cam.y - (ch * 0.35) / cam.zoom);
    const lx = worldToScreenX(targetX, cam, cw);
    const ly = worldToScreenY(targetY, cam, ch);
    if (lx > 28 && lx < cw - 28 && ly > 20 && ly < ch - 20) {
      ctx.fillText(label, lx, ly);
    }
  }

  // Enclosed area hint while drawing walls
  if (state.buildStripPreview?.enclosedAreas?.length) {
    for (const area of state.buildStripPreview.enclosedAreas) {
      const [ax, ay] = w2s(area.x, area.y, cam, cw, ch);
      const aw = area.w * cam.zoom;
      const ah = area.h * cam.zoom;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
      ctx.lineWidth = Math.max(1, 1.5 / cam.zoom);
      ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
      ctx.fillRect(ax, ay, aw, ah);
      ctx.strokeRect(ax, ay, aw, ah);
      ctx.setLineDash([]);
    }
  }

  // Strip drag preview (walls / roads)
  if (state.buildMode && state.buildStripPreview && isStripBuildType(state.buildMode)) {
    for (const seg of state.buildStripPreview.segments) {
      const placeType = seg.placeType ?? state.buildMode;
      const segRot = seg.rotation ?? state.buildStripPreview.rotation;
      const footprint = getBuildingFootprintForType(placeType, segRot);
      const [gx, gyBase] = w2s(seg.x, seg.y, cam, cw, ch);
      // Ride the 2.5D relief exactly as the placed wall/road is drawn (`buildings.ts`
      // getBuildingScreenRect samples centre-x / bottom-y of the footprint).
      const gy = gyBase - terrainRiseAt(state.worldMap, seg.x, seg.y + footprint.height / 2) * cam.zoom;
      const bw = footprint.width * cam.zoom;
      const bh = footprint.height * cam.zoom;
      const alpha = seg.valid ? 0.72 : 0.45;
      drawProceduralStripBuilding(ctx, placeType, gx, gy, bw, bh, segRot, alpha);
      if (seg.junctionInfo) {
        drawStripJunctionOverlay(ctx, placeType, gx, gy, bw, bh, seg.junctionInfo, alpha);
      }
      ctx.strokeStyle = seg.valid ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = Math.max(1.2, 1.8 / cam.zoom);
      ctx.setLineDash(seg.valid ? [] : [4, 3]);
      ctx.strokeRect(gx - bw / 2, gy - bh / 2, bw, bh);
      ctx.setLineDash([]);
    }
  }

  // Build ghost footprint — ground diamond plate
  if (state.buildMode && state.buildGhost && !(state.buildStripPreview && isStripBuildType(state.buildMode))) {
    const footprint = getBuildingFootprintForType(state.buildMode, state.buildRotation);
    const [gx, gyBase] = w2s(state.buildGhost.x, state.buildGhost.y, cam, cw, ch);
    // Same relief lift as the ghost sprite in `buildPreview.ts`, or plate and ghost separate.
    const gy = gyBase
      - terrainRiseAt(state.worldMap, state.buildGhost.x, state.buildGhost.y + footprint.height / 2) * cam.zoom;
    const bw = footprint.width * cam.zoom;
    const bh = footprint.height * cam.zoom;
    const valid = state.buildGhost.valid;
    const halfW = bw * 0.52;
    const halfH = Math.max(bh * 0.28, bw * 0.16);

    // Soft ground shadow under the plate
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(gx + 3, gy + halfH * 0.55, halfW * 0.95, halfH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    drawIsoCellMarker(
      ctx, gx, gy, halfW, halfH,
      valid ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)',
      valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)',
      Math.max(1.4, 2 / cam.zoom),
    );

    // South lip for 2.5D thickness
    ctx.fillStyle = valid ? 'rgba(6, 78, 59, 0.45)' : 'rgba(127, 29, 29, 0.5)';
    ctx.beginPath();
    ctx.moveTo(gx - halfW, gy);
    ctx.lineTo(gx, gy + halfH);
    ctx.lineTo(gx + halfW, gy);
    ctx.lineTo(gx, gy + halfH + Math.max(2.5, 3.5 * cam.zoom));
    ctx.closePath();
    ctx.fill();

    // Inner cell ticks for large footprints
    if (cam.zoom >= 0.5 && bw > gs * cam.zoom * 1.5) {
      ctx.strokeStyle = valid ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const left = state.buildGhost.x - footprint.width / 2;
      const right = state.buildGhost.x + footprint.width / 2;
      const top = state.buildGhost.y - footprint.height / 2;
      const bottom = state.buildGhost.y + footprint.height / 2;

      for (let wx = Math.ceil(left / gs) * gs; wx < right; wx += gs) {
        const t = (wx - left) / footprint.width;
        const px = gx - halfW + t * halfW * 2;
        ctx.moveTo(px, gy - halfH * 0.35);
        ctx.lineTo(px, gy + halfH * 0.35);
      }
      for (let wy = Math.ceil(top / gs) * gs; wy < bottom; wy += gs) {
        const t = (wy - top) / footprint.height;
        const py = gy - halfH + t * halfH * 2;
        ctx.moveTo(gx - halfW * 0.35, py);
        ctx.lineTo(gx + halfW * 0.35, py);
      }
      ctx.stroke();
    }

    // Snap anchor (small raised diamond)
    drawIsoCellMarker(
      ctx, gx, gy, Math.max(3, 4.5 * cam.zoom), Math.max(2, 2.8 * cam.zoom),
      valid ? '#4ade80' : '#f87171',
      'rgba(0,0,0,0.55)',
      Math.max(1, 1.2 / cam.zoom),
    );
  }
}

/** Placement grid on top of sprites — major lines only during play; full grid in build mode. */
export function drawGridTopOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.showGrid) return;

  const cam = state.camera;
  const inBuildMode = !!state.buildMode;
  const vp = getGridViewport(cam, cw, ch);
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const isNight = isNightHour(state.hourOfDay);

  if (inBuildMode) {
    const minorW = Math.max(0.55, 0.7 / cam.zoom);
    const majorW = Math.max(0.75, 1.0 / cam.zoom);
    strokeGridLines(ctx, vp, cam, cw, ch, gs, true, 'rgba(190, 220, 205, 0.11)', 'rgba(20, 45, 35, 0.08)', minorW);
    strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, 'rgba(125, 165, 145, 0.22)', 'rgba(20, 45, 35, 0.12)', majorW);
    return;
  }

  const majorW = Math.max(0.7, 1.0 / cam.zoom);
  const lineColor = isNight
    ? 'rgba(226, 232, 240, 0.10)'
    : 'rgba(31, 56, 28, 0.07)';
  strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, lineColor, 'rgba(0,0,0,0.04)', majorW);
}
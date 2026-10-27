/**
 * F4 — Infrastructure and Logistics Overlay: the per-frame draw pass.
 *
 * This painter **decides nothing**. Connectivity, poor-connection classification and commute
 * severity are all computed in `logisticsOverlayData` and arrive on the snapshot; the renderer
 * only maps world coordinates to the screen and strokes what it was handed. Every constant in this
 * file is a drawing concern (line widths, marker radii, culling padding, colours).
 *
 * It lives in the per-frame overlay pass (`renderer/overlay.ts`), **not** in the tick-keyed entity
 * layer: the projection is a live read of the world and the toggle is live view state, so baking
 * it into a bitmap that only repaints on a sim tick would freeze the overlay between ticks and
 * leave it stale while paused — the same bug class as the hunt arrows and the leader aura
 * (`tests/visualsAudit.renderWiring.test.ts` D5/D19).
 */
import { worldToScreen } from '../viewState';
import { viewportFromCamera, type WorldViewport } from '../spatialGrid';
import type { RenderSnapshot } from '../renderSnapshot';
import type {
  LogisticsBuildingFlag,
  LogisticsCommute,
  LogisticsCommuteSeverity,
  LogisticsSupplyLink,
} from '../logisticsOverlayData';

/** Culling padding in world units, so a marker anchored just off-screen still draws. */
const CULL_PADDING_WU = 40;

/** Screen-space marker sizes at zoom 1; all scale with the camera zoom. */
const ROAD_NODE_RADIUS_PX = 2.2;
const BUILDING_MARKER_RADIUS_PX = 7;
const LINK_LINE_WIDTH_PX = 1.4;

const ROAD_NODE_STYLE = 'rgba(56, 189, 248, 0.75)';
const SUPPLY_LINK_STYLE = 'rgba(56, 189, 248, 0.5)';
const POORLY_CONNECTED_STYLE = 'rgba(251, 191, 36, 0.9)';
const NO_ACCESS_STYLE = 'rgba(248, 113, 113, 0.95)';
const OVER_BUDGET_COMMUTE_STYLE = 'rgba(251, 191, 36, 0.7)';
const EXTREME_COMMUTE_STYLE = 'rgba(239, 68, 68, 0.8)';
/** A leg whose direct line crosses water/mountains — deliberately outside the red/amber family. */
const BLOCKED_COMMUTE_STYLE = 'rgba(192, 132, 252, 0.85)';

/** The one place a commute severity becomes a stroke colour. */
function commuteStrokeStyle(severity: LogisticsCommuteSeverity): string {
  if (severity === 'blocked') return BLOCKED_COMMUTE_STYLE;
  if (severity === 'extreme') return EXTREME_COMMUTE_STYLE;
  return OVER_BUDGET_COMMUTE_STYLE;
}

/** True when a world point is outside the visible world rectangle. */
function isOutsideWorld(vp: WorldViewport, x: number, y: number): boolean {
  return x < vp.minX || x > vp.maxX || y < vp.minY || y > vp.maxY;
}

/**
 * Draws the logistics overlay.
 *
 * Culling happens in **world** space against `viewportFromCamera`, before any coordinate is
 * converted; only visible items reach `worldToScreen`. The pass allocates no arrays of its own —
 * it walks the projection's arrays and reuses the module-level style constants.
 */
export function drawLogisticsOverlay(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  const data = state.logistics;
  if (!data) return;

  const cam = state.camera;
  const zoom = cam.zoom;
  const vp = viewportFromCamera(cam.x, cam.y, zoom, cw, ch, CULL_PADDING_WU);

  ctx.save();

  // 1. The network itself — one dot per road strip, so a player can see the components.
  const components = data.roadComponents;
  if (components.length > 0 && zoom >= 0.35) {
    ctx.fillStyle = ROAD_NODE_STYLE;
    const radius = Math.max(1, ROAD_NODE_RADIUS_PX * zoom);
    for (let c = 0; c < components.length; c++) {
      const nodes = components[c].nodes;
      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];
        if (isOutsideWorld(vp, node.x, node.y)) continue;
        const [sx, sy] = worldToScreen(node.x, node.y, cam, cw, ch);
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 2. Commute pressure — home↔work legs, coloured by the projection's severity.
  const commutes = data.commutes;
  if (commutes.length > 0) {
    ctx.lineWidth = Math.max(0.8, LINK_LINE_WIDTH_PX * zoom);
    ctx.setLineDash([5 * zoom, 4 * zoom]);
    for (let i = 0; i < commutes.length; i++) {
      const commute: LogisticsCommute = commutes[i];
      // Both endpoints off the same side means the whole leg is invisible.
      if (isOutsideWorld(vp, commute.homeX, commute.homeY) && isOutsideWorld(vp, commute.workX, commute.workY)) {
        continue;
      }
      const [hx, hy] = worldToScreen(commute.homeX, commute.homeY, cam, cw, ch);
      const [wx, wy] = worldToScreen(commute.workX, commute.workY, cam, cw, ch);
      ctx.strokeStyle = commuteStrokeStyle(commute.severity);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(wx, wy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // 3. Supply links — building centre to the nearest point of the component serving it.
  const links = data.supplyLinks;
  if (links.length > 0) {
    ctx.strokeStyle = SUPPLY_LINK_STYLE;
    ctx.lineWidth = Math.max(0.7, LINK_LINE_WIDTH_PX * zoom);
    ctx.beginPath();
    for (let i = 0; i < links.length; i++) {
      const link: LogisticsSupplyLink = links[i];
      if (isOutsideWorld(vp, link.fromX, link.fromY) && isOutsideWorld(vp, link.toX, link.toY)) continue;
      const [fx, fy] = worldToScreen(link.fromX, link.fromY, cam, cw, ch);
      const [tx, ty] = worldToScreen(link.toX, link.toY, cam, cw, ch);
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
  }

  // 4. Flagged buildings — amber ring for a weak link, red ring for none at all.
  const flags = data.poorlyConnected;
  if (flags.length > 0) {
    const radius = Math.max(3, BUILDING_MARKER_RADIUS_PX * zoom);
    ctx.lineWidth = Math.max(1, 1.4 * zoom);
    for (let i = 0; i < flags.length; i++) {
      const flag: LogisticsBuildingFlag = flags[i];
      if (isOutsideWorld(vp, flag.x, flag.y)) continue;
      const [sx, sy] = worldToScreen(flag.x, flag.y, cam, cw, ch);
      ctx.strokeStyle = flag.issue === 'poorly_connected' ? POORLY_CONNECTED_STYLE : NO_ACCESS_STYLE;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** One legend row: label and swatch colour for the on-map legend control. */
export interface LogisticsLegendEntry {
  readonly label: string;
  readonly color: string;
}

/** The colours the pass strokes, published so the UI legend and the canvas cannot drift apart. */
export const LOGISTICS_LEGEND: readonly LogisticsLegendEntry[] = [
  { label: 'Road network', color: ROAD_NODE_STYLE },
  { label: 'Supply link', color: SUPPLY_LINK_STYLE },
  { label: 'Poorly connected', color: POORLY_CONNECTED_STYLE },
  { label: 'No road access', color: NO_ACCESS_STYLE },
  { label: 'Commute blocked (must detour)', color: BLOCKED_COMMUTE_STYLE },
  { label: 'Commute over budget', color: OVER_BUDGET_COMMUTE_STYLE },
  { label: 'Commute abandoned (snap distance)', color: EXTREME_COMMUTE_STYLE },
];

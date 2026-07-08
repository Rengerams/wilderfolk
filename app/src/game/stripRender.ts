import { BuildingType } from './gameTypes';
import type { BuildingRotation, CornerRotation } from './buildingRotation';
import { normalizeCornerRotation } from './buildingRotation';
import { cornerArms } from './stripJunction';
import type { JunctionKind, StripJunctionInfo } from './stripJunction';

function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function beginRotatedStripFrame(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  rotation: BuildingRotation,
  alpha: number,
): { rw: number; rh: number; x0: number; y0: number } {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  if (rotation === 90) ctx.rotate(Math.PI / 2);
  const rw = Math.max(w, h);
  const rh = Math.min(w, h);
  return { rw, rh, x0: -rw / 2, y0: -rh / 2 };
}

function strokePalisadeRails(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
): void {
  ctx.strokeStyle = '#57534e';
  ctx.lineWidth = Math.max(2, ah * 0.12);
  ctx.beginPath();
  ctx.moveTo(ax, ay + ah * 0.35);
  ctx.lineTo(ax + aw, ay + ah * 0.35);
  ctx.moveTo(ax, ay + ah * 0.62);
  ctx.lineTo(ax + aw, ay + ah * 0.62);
  ctx.stroke();
}

function drawPalisadeArm(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  shadow = false,
): void {
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(ax, ay + ah * 0.55, aw, ah * 0.45);
  }
  drawPalisadePosts(ctx, ax, ay, aw, ah, null);
  strokePalisadeRails(ctx, ax, ay, aw, ah);
}

/** Top-down cobble road — no sprite required. */
export function drawProceduralRoad(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  rotation: BuildingRotation,
  alpha = 1,
): void {
  const { rw, rh, x0, y0 } = beginRotatedStripFrame(ctx, sx, sy, w, h, rotation, alpha);

  ctx.fillStyle = '#3f3a33';
  ctx.fillRect(x0, y0, rw, rh);

  ctx.fillStyle = '#5c5346';
  ctx.fillRect(x0 + 2, y0 + 2, rw - 4, rh - 4);

  ctx.fillStyle = '#78716c';
  ctx.fillRect(x0 + rw * 0.2, y0 + rh * 0.28, rw * 0.6, rh * 0.44);

  const stones = Math.max(4, Math.floor(rw / 14));
  for (let i = 0; i < stones; i++) {
    const t = i / Math.max(1, stones - 1);
    const px = x0 + 4 + t * (rw - 8);
    const jitter = (seeded(i * 3.1) - 0.5) * rh * 0.25;
    ctx.fillStyle = seeded(i) > 0.5 ? '#6b6560' : '#4b453d';
    ctx.beginPath();
    ctx.ellipse(px, y0 + rh * 0.5 + jitter, 2.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, rw - 1, rh - 1);
  ctx.restore();
}

/** Palisade wall segment — readable at map zoom. */
export function drawProceduralWall(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  rotation: BuildingRotation,
  isGate: boolean,
  alpha = 1,
): void {
  const { rw, rh, x0, y0 } = beginRotatedStripFrame(ctx, sx, sy, w, h, rotation, alpha);

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x0, y0 + rh * 0.55, rw, rh * 0.35);

  const gapStart = isGate ? rw * 0.38 : -1;
  const gapEnd = isGate ? rw * 0.62 : -1;
  const skipRange = isGate ? [gapStart, gapEnd] as [number, number] : null;
  drawPalisadePosts(ctx, x0, y0, rw, rh, skipRange);
  strokePalisadeRails(ctx, x0, y0, rw, rh);

  if (isGate) {
    ctx.fillStyle = '#292524';
    ctx.fillRect(x0 + gapStart, y0 + rh * 0.2, gapEnd - gapStart, rh * 0.75);
    ctx.strokeStyle = '#a8a29e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + gapStart, y0 + rh * 0.15, gapEnd - gapStart, rh * 0.8);
  }

  ctx.restore();
}

function drawPalisadePosts(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  skipRange: [number, number] | null,
): void {
  const postW = Math.max(3, rh * 0.22);
  const postCount = Math.max(3, Math.floor(rw / 14));
  for (let i = 0; i < postCount; i++) {
    const t = postCount <= 1 ? 0.5 : i / (postCount - 1);
    const px = x0 + t * (rw - postW);
    if (skipRange && px + postW > skipRange[0] && px < skipRange[1]) continue;
    const lean = (seeded(i * 1.7) - 0.5) * 0.08;
    ctx.save();
    ctx.translate(px + postW / 2, y0 + rh);
    ctx.rotate(lean);
    const grad = ctx.createLinearGradient(0, -rh, 0, 0);
    grad.addColorStop(0, '#94a3b8');
    grad.addColorStop(0.45, '#64748b');
    grad.addColorStop(1, '#475569');
    ctx.fillStyle = grad;
    ctx.fillRect(-postW / 2, -rh * 0.92, postW, rh * 0.92);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-postW / 2, -rh * 0.92, postW, 2);
    ctx.restore();
  }
}

/** L-shaped palisade corner — rotation picks which quadrant is open. */
export function drawProceduralWallCorner(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  rotation: CornerRotation,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  const size = Math.max(w, h);
  const half = size / 2;
  const arm = size * 0.46;
  const thick = size * 0.34;
  const r = normalizeCornerRotation(rotation);

  const arms = cornerArms(r);
  if (arms.north) {
    drawPalisadeArm(ctx, half - thick, -half - arm, thick, arm + half, true);
  }
  if (arms.south) {
    drawPalisadeArm(ctx, half - thick, half, thick, arm + half, true);
  }
  if (arms.east) {
    drawPalisadeArm(ctx, half - arm, -half, arm + half, thick, true);
  }
  if (arms.west) {
    drawPalisadeArm(ctx, -half - arm, -half, arm + half, thick, true);
  }

  ctx.restore();
}

/** Wider cobble cap where road segments meet (tee / cross / elbow). */
export function drawProceduralRoadJunction(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  kind: JunctionKind,
  alpha = 1,
): void {
  if (kind === 'end' || kind === 'straight') return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);

  const size = Math.max(w, h);
  const half = size / 2;
  const cap = size * (kind === 'cross' ? 0.52 : 0.44);

  ctx.fillStyle = '#3f3a33';
  ctx.fillRect(-cap / 2, -cap / 2, cap, cap);
  ctx.fillStyle = '#5c5346';
  ctx.fillRect(-cap / 2 + 2, -cap / 2 + 2, cap - 4, cap - 4);
  ctx.fillStyle = '#78716c';
  ctx.fillRect(-cap * 0.28, -cap * 0.28, cap * 0.56, cap * 0.56);

  const stones = kind === 'cross' ? 6 : 4;
  for (let i = 0; i < stones; i++) {
    const angle = (i / stones) * Math.PI * 2;
    const px = Math.cos(angle) * half * 0.22;
    const py = Math.sin(angle) * half * 0.22;
    ctx.fillStyle = seeded(i * 2.3) > 0.5 ? '#6b6560' : '#4b453d';
    ctx.beginPath();
    ctx.ellipse(px, py, 2.6, 2.1, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-cap / 2 + 0.5, -cap / 2 + 0.5, cap - 1, cap - 1);
  ctx.restore();
}

/** T or + palisade junction — used when a corner connects three or four arms. */
export function drawProceduralWallJunction(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  info: StripJunctionInfo,
  alpha = 1,
): void {
  if (info.kind !== 'tee' && info.kind !== 'cross') return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);

  const size = Math.max(w, h);
  const half = size / 2;
  const thick = size * 0.34;
  const arm = size * 0.46;
  const { connections: c } = info;

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(-half, half * 0.1, size, thick * 0.45);

  if (c.west) drawPalisadeArm(ctx, -half, -thick, arm + half, thick);
  if (c.east) drawPalisadeArm(ctx, half - arm, -thick, arm + half, thick);
  if (c.north) drawPalisadeArm(ctx, -thick, -half, thick, arm + half);
  if (c.south) drawPalisadeArm(ctx, -thick, half - arm, thick, arm + half);

  ctx.restore();
}

export function drawProceduralStripBuilding(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  sx: number,
  sy: number,
  w: number,
  h: number,
  rotation: BuildingRotation | CornerRotation,
  alpha = 1,
): void {
  if (type === BuildingType.Road) {
    drawProceduralRoad(ctx, sx, sy, w, h, rotation as BuildingRotation, alpha);
    return;
  }
  if (type === BuildingType.WallCorner) {
    drawProceduralWallCorner(ctx, sx, sy, w, h, normalizeCornerRotation(rotation), alpha);
    return;
  }
  drawProceduralWall(ctx, sx, sy, w, h, rotation as BuildingRotation, type === BuildingType.WallGate, alpha);
}

export function drawStripJunctionOverlay(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  sx: number,
  sy: number,
  w: number,
  h: number,
  info: StripJunctionInfo,
  alpha = 1,
): void {
  if (type === BuildingType.Road) {
    drawProceduralRoadJunction(ctx, sx, sy, w, h, info.kind, alpha);
    return;
  }
  if (type === BuildingType.WallCorner) {
    drawProceduralWallJunction(ctx, sx, sy, w, h, info, alpha);
  }
}
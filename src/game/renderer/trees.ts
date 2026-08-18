import type { RenderSnapshot } from '../renderSnapshot';
import { getSpriteFrame } from '../spriteLoader';
import { isDrawableSpriteFrame } from './shared';
import { drawGroundAO, drawSpriteFrame } from './spriteDrawing';
import { _cachedTrees } from './entityCache';

const TREE_SPRITE_PATHS = ['/sprites/tree.png', '/sprites/tree2.png'] as const;

export function drawTrees(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const treeFrames = TREE_SPRITE_PATHS.map((p) => getSpriteFrame(p));
  const bushFrame = getSpriteFrame('/sprites/bush.png');
  const stumpFrame = getSpriteFrame('/sprites/stump.png');

  // Sort by Y so lower trees draw in front (simple 2.5D depth)
  const trees = _cachedTrees.length > 1
    ? [..._cachedTrees].sort((a, b) => a.y - b.y || a.id - b.id)
    : _cachedTrees;

  for (const tree of trees) {
    const sx = (tree.x - cam.x) * cam.zoom + cw / 2;
    const sy = (tree.y - cam.y) * cam.zoom + ch / 2;
    const size = tree.size * 2.4 * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;

    // Phase C — denser forest-floor props near trees (stable by id)
    if (cam.zoom >= 0.4) {
      const propRoll = tree.id % 5;
      if ((propRoll === 0 || propRoll === 3) && isDrawableSpriteFrame(stumpFrame)) {
        const px = sx - size * 0.55;
        const py = sy + size * 0.12;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(px + 2, py + size * 0.08, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSpriteFrame(ctx, stumpFrame, px, py, size * 0.85, size * 0.55, 0.5, 0.9);
      }
      if ((propRoll === 1 || propRoll === 2 || propRoll === 4) && isDrawableSpriteFrame(bushFrame)) {
        const px = sx + size * (propRoll === 4 ? -0.4 : 0.48);
        const py = sy + size * 0.08;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(px, py + size * 0.06, size * 0.22, size * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSpriteFrame(ctx, bushFrame, px, py, size * 0.7, size * 0.55, 0.5, 0.9);
      }
    }

    // 2.5D contact shadow (offset SE) + soft canopy pool
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx + size * 0.14, sy + size * 0.34, size * 0.58, size * 0.18, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(sx + size * 0.06, sy + size * 0.22, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft ambient-occlusion pool — the ground darkens right under the canopy.
    drawGroundAO(ctx, sx + size * 0.05, sy + size * 0.18, size * 0.62, 0.10);

    // Oak vs pine by entity id for map variety
    const treeFrame = treeFrames[tree.id % treeFrames.length];
    if (isDrawableSpriteFrame(treeFrame)) {
      const isPine = (tree.id % TREE_SPRITE_PATHS.length) === 1;
      const drawW = size * (isPine ? 1.65 : 2.05);
      const drawH = size * (isPine ? 2.55 : 2.3);
      drawSpriteFrame(ctx, treeFrame, sx, sy - size * 0.08, drawW, drawH, 0.5, 0.92);
    } else {
      // Procedural fallback: trunk + canopy
      ctx.fillStyle = '#5c4030';
      ctx.fillRect(sx - size * 0.08, sy - size * 0.1, size * 0.16, size * 0.45);
      ctx.fillStyle = '#228B22';
      ctx.beginPath();
      ctx.arc(sx, sy - size * 0.25, size * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2d8a3e';
      ctx.beginPath();
      ctx.arc(sx - size * 0.18, sy - size * 0.12, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

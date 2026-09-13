import type { RenderSnapshot } from '../renderSnapshot';
import type { Entity } from '../gameTypes';
import { getSpriteFrame } from '../spriteLoader';
import { isDrawableSpriteFrame } from './shared';
import { drawContactShadow, drawGroundAO, drawSpriteFrame } from './spriteDrawing';
import { _cachedTrees } from './entityCache';

const TREE_SPRITE_PATHS = ['/sprites/tree.png', '/sprites/tree2.png'] as const;
const BLUEBERRY_TREE_SPRITE_PATH = '/sprites/blueberry_tree.png';

let lastCachedTreesRef: readonly Entity[] | null = null;
let sortedTreesCache: Entity[] = [];

/** Re-sorts static trees only when the entity cache reference changes. */
function getSortedTrees(trees: readonly Entity[]): readonly Entity[] {
  if (trees === lastCachedTreesRef) {
    return sortedTreesCache;
  }
  lastCachedTreesRef = trees;
  sortedTreesCache = trees.length > 1
    ? [...trees].sort((a, b) => a.y - b.y || a.id - b.id)
    : [...trees];
  return sortedTreesCache;
}

export function drawTrees(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!_cachedTrees || _cachedTrees.length === 0) return;

  const cam = state.camera;
  const treeFrames = TREE_SPRITE_PATHS.map((p) => getSpriteFrame(p));
  const blueberryTreeFrame = getSpriteFrame(BLUEBERRY_TREE_SPRITE_PATH);
  const bushFrame = getSpriteFrame('/sprites/bush.png');
  const stumpFrame = getSpriteFrame('/sprites/stump.png');

  // $O(1)$ depth-sorted lookup (cached until trees are chopped or spawned)
  const trees = getSortedTrees(_cachedTrees);

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    const sx = (tree.x - cam.x) * cam.zoom + cw / 2;
    const sy = (tree.y - cam.y) * cam.zoom + ch / 2;
    const baseSize = tree.size > 0 ? tree.size : 12;
    const size = baseSize * 2.4 * cam.zoom;

    // Accurate culling margins: accounts for tree height (extends ~2.5x size above sy) and width
    const cullMarginX = size * 1.3 + 30;
    const cullMarginTop = size * 2.6 + 30;
    const cullMarginBottom = size * 0.6 + 30;

    if (
      sx + cullMarginX < 0 ||
      sx - cullMarginX > cw ||
      sy + cullMarginBottom < 0 ||
      sy - cullMarginTop > ch
    ) {
      continue;
    }

    // Dense forest-floor props near trees (only when zoomed in enough to see them)
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

    // 2.5D canopy contact shadow plus ambient occlusion under the trunk
    drawContactShadow(
      ctx,
      sx,
      sy + size * 0.18,
      size * 0.58,
      size * 0.18,
      { offsetX: size * 0.14, offsetY: size * 0.16, alpha: 0.28, enhanced: state.juiceEffectsEnabled },
    );

    drawGroundAO(
      ctx,
      sx + size * 0.05,
      sy + size * 0.18,
      size * 0.62,
      state.juiceEffectsEnabled ? 0.1 : 0.06,
    );

    // Ripe blueberry trees are landmarks; depleted ones read as standard foliage
    const isRipeBlueberry = tree.forageKind === 'blueberry' && (tree.blueberryYield ?? 0) > 0;
    const fallbackFrame = treeFrames[tree.id % TREE_SPRITE_PATHS.length];
    const treeFrame = isRipeBlueberry && isDrawableSpriteFrame(blueberryTreeFrame)
      ? blueberryTreeFrame
      : fallbackFrame;

    if (isDrawableSpriteFrame(treeFrame)) {
      const isPine = (tree.id % TREE_SPRITE_PATHS.length) === 1;
      const drawW = isRipeBlueberry ? size * 1.82 : size * (isPine ? 1.65 : 2.05);
      const drawH = isRipeBlueberry ? size * 2.45 : size * (isPine ? 2.55 : 2.3);
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

      // Blueberries accent in procedural mode
      if (isRipeBlueberry) {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(sx - size * 0.1, sy - size * 0.2, size * 0.08, 0, Math.PI * 2);
        ctx.arc(sx + size * 0.12, sy - size * 0.28, size * 0.08, 0, Math.PI * 2);
        ctx.arc(sx + size * 0.04, sy - size * 0.14, size * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
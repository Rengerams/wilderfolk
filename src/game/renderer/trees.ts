import type { RenderSnapshot } from '../renderSnapshot';
import type { Entity } from '../gameTypes';
import { getSpriteFrame } from '../spriteLoader';
import { isDrawableSpriteFrame } from './shared';
import { drawContactShadow, drawGroundAO, drawSpriteFrame } from './spriteDrawing';
import { _cachedTrees } from './entityCache';

const BLUEBERRY_TREE_SPRITE_PATH = '/sprites/blueberry_tree.png';
/** Regular tree variants — `tree.png` (rounded) and `tree2.png` (taller). Both are preloaded. */
const TREE_SPRITE_PATH = '/sprites/tree.png';
const TREE2_SPRITE_PATH = '/sprites/tree2.png';

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
  const blueberryTreeFrame = getSpriteFrame(BLUEBERRY_TREE_SPRITE_PATH);
  const treeFrame = getSpriteFrame(TREE_SPRITE_PATH);
  const tree2Frame = getSpriteFrame(TREE2_SPRITE_PATH);
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

    // Ripe blueberry trees are landmarks; every other tree is the shipped `tree.png` / `tree2.png`
    // art (odd ids take the taller `tree2.png`), replacing the procedural oak/pine split.
    const isRipeBlueberry = tree.forageKind === 'blueberry' && (tree.blueberryYield ?? 0) > 0;
    if (isRipeBlueberry && isDrawableSpriteFrame(blueberryTreeFrame)) {
      drawSpriteFrame(ctx, blueberryTreeFrame, sx, sy - size * 0.08, size * 1.82, size * 2.45, 0.5, 0.92);
    } else {
      const isTall = (tree.id % 2) === 1;
      const frame = isTall ? tree2Frame : treeFrame;
      if (isDrawableSpriteFrame(frame)) {
        drawSpriteFrame(
          ctx,
          frame,
          sx,
          sy - size * 0.08,
          size * (isTall ? 1.6 : 1.9),
          size * (isTall ? 2.4 : 1.9),
          0.5,
          0.92,
        );
      }
    }
  }
}
import { Season } from '../gameTypes';
import { getSpriteFrame } from '../spriteLoader';
import { isDrawableSpriteFrame } from './shared';
import type { RenderSnapshot } from '../renderSnapshot';
import { drawSpriteFrame } from './spriteDrawing';
import { _cachedGrass } from './entityCache';

function grassSeasonFill(season: Season): string {
  switch (season) {
    case Season.Spring: return '#5eea8a';
    case Season.Summer: return '#a3b35c'; // sun-bleached olive, not spring neon
    case Season.Fall: return '#ca8a04';
    case Season.Winter: return '#cbd5e1';
    default: return '#22c55e';
  }
}

const GRASS_SPRITE_PATHS = ['/sprites/grass.png', '/sprites/grass2.png'] as const;

function grassSeasonAlpha(season: Season): number {
  switch (season) {
    case Season.Winter: return 0.38;
    case Season.Fall: return 0.88;
    case Season.Spring: return 0.98;
    case Season.Summer: return 0.85;
    default: return 0.9;
  }
}

export function drawGrass(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const seasonA = grassSeasonAlpha(state.season);
  const frames = GRASS_SPRITE_PATHS.map((p) => getSpriteFrame(p));
  const hasSprite = frames.some(isDrawableSpriteFrame);

  ctx.save();
  let drawn = 0;
  for (const grass of _cachedGrass) {
    const sx = (grass.x - cam.x) * cam.zoom + cw / 2;
    const sy = (grass.y - cam.y) * cam.zoom + ch / 2;
    const size = grass.size * 1.0 * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;
    // Density cull when zoomed out
    if (cam.zoom < 0.55 && drawn % 3 !== 0) { drawn++; continue; }
    if (cam.zoom < 0.85 && drawn % 2 !== 0) { drawn++; continue; }

    const energyT = Math.max(0.35, Math.min(1, grass.energy / 100));
    const r = size * (0.55 + 0.35 * energyT);

    // Soft contact shadow under tuft
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(sx + r * 0.06, sy + r * 0.22, r * 0.55, r * 0.18, 0.1, 0, Math.PI * 2);
    ctx.fill();

    const frame = frames[grass.id % frames.length];
    if (hasSprite && isDrawableSpriteFrame(frame)) {
      ctx.globalAlpha = seasonA * (0.65 + 0.35 * energyT);
      // Winter desaturate via slight blue wash on alpha only — keep sprite readable
      if (state.season === Season.Winter) ctx.globalAlpha *= 0.75;
      const flip = (grass.id & 1) === 0;
      drawSpriteFrame(
        ctx,
        frame,
        sx,
        sy,
        r * 2.2,
        r * 2.0,
        0.5,
        0.92,
        flip,
      );
      ctx.globalAlpha = 1;
    } else {
      // Procedural fallback
      ctx.fillStyle = grassSeasonFill(state.season);
      ctx.globalAlpha = 0.22 * energyT;
      ctx.beginPath();
      ctx.ellipse(sx, sy + r * 0.15, r * 1.15, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawn++;
  }
  ctx.restore();
}

import { EntityType } from '../gameTypes';
import { SPECIES_CONFIG } from '../speciesConfig';
import { ANIMAL_SPRITE_ANCHOR_Y, getAnimalSpriteMetrics } from '../entitySprites';
import { isActiveMoonHowler } from '../moonHowler';
import type { RenderSnapshot } from '../renderSnapshot';
import { getSpriteFrame } from '../spriteLoader';
import { terrainRiseAt } from '../terrainAtlas';
import { isDrawableSpriteFrame, renderTime } from './shared';
import { _cachedAnimals } from './entityCache';
import { drawSpriteFrame } from './spriteDrawing';
import { drawCombatBurst } from './humans';

export function drawAnimals(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
  forEntityLayerCache = false,
) {
  const cam = state.camera;

  for (const e of _cachedAnimals) {
    const sx = (e.x - cam.x) * cam.zoom + cw / 2;
    // Ride the 2.5D relief — wildlife grazes on the raised terrain surface
    const sy = (e.y - cam.y) * cam.zoom + ch / 2
      - terrainRiseAt(state.worldMap, e.x, e.y) * cam.zoom;
    const cfg = SPECIES_CONFIG[e.type];
    const { spriteH, shadowW, shadowY } = getAnimalSpriteMetrics(e, cam.zoom);
    const cullPad = spriteH * 0.75;
    if (sx + cullPad < -20 || sx - cullPad > cw + 20 || sy + cullPad < -20 || sy - cullPad > ch + 20) continue;

    const sel = state.selectedEntityIds.includes(e.id) || state.selectedEntity?.id === e.id;
    const flipX = e.vx < 0;
    const frame = getSpriteFrame(cfg.sprite);

    // Soft contact shadow (SE offset for 2.5D volume)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx + shadowW * 0.08, sy + shadowY + 1, shadowW * 0.5, shadowW * 0.15, 0.1, 0, Math.PI * 2);
    ctx.fill();

    const drawAnimal = () => {
      if (isDrawableSpriteFrame(frame)) {
        const aspect = frame.sw / frame.sh;
        drawSpriteFrame(
          ctx, frame, sx, sy, spriteH * aspect, spriteH,
          0.5, ANIMAL_SPRITE_ANCHOR_Y, flipX, {}, 'height',
        );
        return;
      }
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(sx, sy, spriteH * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };

    if (e.flash > 0 && !forEntityLayerCache) {
      ctx.globalAlpha = 0.7 + Math.sin(renderTime * 20) * 0.3;
      drawAnimal();
      ctx.globalAlpha = 1;
    } else {
      drawAnimal();
    }

    if (e.huntTargetId && cam.zoom > 0.5) {
      ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🐾', sx, sy - spriteH * 0.55 - 4);
    } else if (e.type === EntityType.Werewolf && cam.zoom > 0.4) {
      // Village head still wearing the howl — crown so they stay findable (use animal metrics only)
      if (state.villageLeaderId === e.id && !e.faction) {
        ctx.font = `${Math.max(11, Math.round(13 * cam.zoom))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText('👑', sx, sy - spriteH * 0.55 - Math.max(10, 12 * cam.zoom));
      }
      if (isActiveMoonHowler(e)) {
        // Pulsing red ring — this Moon Howler is hunting right now.
        const pulse = 0.5 + 0.5 * Math.sin(state.tick * 0.35 + e.id);
        ctx.save();
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + 0.4 * pulse})`;
        ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
        ctx.beginPath();
        ctx.arc(sx, sy, spriteH * (0.45 + 0.12 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🌝', sx, sy - spriteH * 0.55 - 4);
    }

    if (e.combatTicks && e.combatTicks > 0) {
      drawCombatBurst(ctx, sx, sy, spriteH * 0.45, state.tick, e.id);
    }

    if (sel) {
      const ring = e.type === EntityType.Werewolf ? '#c4b5fd' : '#fbbf24';
      const rr = spriteH * 0.4 + 5;
      ctx.save();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.shadowColor = ring;
      ctx.shadowBlur = 10;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}


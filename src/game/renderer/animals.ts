import { EntityType } from '../gameTypes';
import { SPECIES_CONFIG } from '../speciesConfig';
import { ANIMAL_SPRITE_ANCHOR_Y, getAnimalSpriteMetrics } from '../entitySprites';
import { isActiveMoonHowler } from '../moonHowler';
import type { RenderSnapshot } from '../renderSnapshot';
import { getSpriteFrame } from '../spriteLoader';
import { terrainRiseAt } from '../terrainAtlas';
import { isDrawableSpriteFrame, renderTime } from './shared';
import { _cachedAnimals } from './entityCache';
import { drawContactShadow, drawSpriteFrame } from './spriteDrawing';
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
    const frame = getSpriteFrame(cfg.sprite);
    // The sprite is drawn at anchor (0.5, ANIMAL_SPRITE_ANCHOR_Y), so its body extends
    // `spriteH * ANIMAL_SPRITE_ANCHOR_Y` upward and `spriteH * (1 - ANIMAL_SPRITE_ANCHOR_Y)` downward,
    // and `spriteH * aspect / 2` sideways. The old symmetric `spriteH * 0.75` pad was *smaller* than the
    // 0.88 upward extent, so a quadruped whose body was still on-screen by up to ~0.13·spriteH popped out
    // at the bottom edge instead of sliding in. Per-axis pads cull on the actual
    // bounds; the decorations above (🐾, 👑, the moon-howler ring) were never covered by the pad either,
    // so they keep their existing, slightly earlier pop.
    const aspect = frame && isDrawableSpriteFrame(frame) ? frame.sw / frame.sh : 1;
    const padX = (spriteH * aspect) / 2;
    const padUp = spriteH * ANIMAL_SPRITE_ANCHOR_Y;
    const padDown = spriteH * (1 - ANIMAL_SPRITE_ANCHOR_Y);
    if (
      sx + padX < -20 || sx - padX > cw + 20 ||
      sy + padUp < -20 || sy - padDown > ch + 20
    ) continue;

    const sel = state.selectedEntityIds.includes(e.id) || state.selectedEntity?.id === e.id;
    const flipX = e.vx < 0;

    // Shared SE contact shadow keeps wildlife grounded without touching pathing or hit geometry.
    drawContactShadow(
      ctx,
      sx,
      sy + shadowY,
      shadowW * 0.5,
      shadowW * 0.15,
      { offsetX: shadowW * 0.08, offsetY: 1, alpha: 0.28, enhanced: state.juiceEffectsEnabled },
    );

    const drawAnimal = () => {
      if (isDrawableSpriteFrame(frame)) {
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

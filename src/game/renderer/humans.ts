import { BuildingType, EntityType, type Entity } from '../gameTypes';
import { isWorkHour, shouldBeAtHome } from '../dayCycle';
import { findNearestStaffedSchool, findStaffedSchools, isChildAtSchool } from '../education';
import {
  buildHumanCombatStatusFlags,
  getHumanStatusCombatIconFromFlags,
  isPredatorType,
  type HumanCombatStatusFlags,
} from '../combat';
import {
  drawPioneerAt,
  getHumanSpriteMetrics,
  getHumanWalkFrameIndex,
  getHumanSpriteFrame,
  getJuvenileSpriteFrame,
  pickHumanVariant,
  HUMAN_WALK_SPEED_THRESHOLD,
  type HumanGender,
} from '../humanSprites';
import { getChatBubbleText, wrapChatLines } from '../humanChat';
import type { RenderSnapshot } from '../renderSnapshot';
import { terrainRiseAt } from '../terrainAtlas';
import { getRenderSoABuckets } from '../simBuffers/renderSoAEntities';
import { huntAnimProgress } from '../huntvisuals';
import { getCachedNameWidth, isDrawableSpriteFrame, renderTime, roundRect } from './shared';
import {
  getSpeechBubbleFontSize,
  getSpeechBubbleHeadClearance,
  resolveSpeechBubbleRect,
  shouldDrawHumanNameLabel,
  type OverheadRect,
} from './overheadLayout';

import { _cachedHumans, _cachedPartnerById, _renderSoABuckets, _tickAnimals, _tickHumans } from './entityCache';
import { drawContactShadow, drawSpriteFrame, getHumanWalkMotion } from './spriteDrawing';

function drawTalkingMouth(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  flipX: boolean,
  animFrame: number,
) {
  const talking = Math.sin(animFrame * 0.9) > -0.15;
  if (!talking) return;
  const mx = Math.round(sx + (flipX ? -size * 0.08 : size * 0.08));
  const my = Math.round(sy - size * 0.38);
  ctx.fillStyle = '#3d2817';
  ctx.fillRect(mx, my, 2, talking && Math.sin(animFrame * 1.6) > 0 ? 2 : 1);
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  text: string,
  tick: number,
  entityId: number,
  zoom: number,
  hasLeaderCrown: boolean,
  occupiedBubbleRects: OverheadRect[],
) {
  // Tree lines are long — show bubbles a bit earlier when zooming out.
  if (zoom < 0.36 || !text) return;

  ctx.save();
  const bob = Math.sin(tick * 0.14 + entityId) * 1.5;
  const fontSize = getSpeechBubbleFontSize(zoom);
  ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  const padX = 7;
  const padY = 5;
  const lineGap = 2.5;
  // formatChatLine already wraps; split on newlines, re-wrap single blobs.
  const lines = text.includes('\n')
    ? text.split('\n').filter(Boolean)
    : wrapChatLines(text, 30, 3);
  let maxLineW = 0;
  for (const line of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }
  // Cap width so long tree quotes stay readable near screen edges
  const maxBw = Math.min(220 * Math.max(0.85, zoom), Math.max(72, maxLineW + padX * 2));
  const bw = Math.ceil(Math.min(maxBw, maxLineW + padX * 2));
  const lineH = fontSize + lineGap;
  const bh = Math.ceil(padY * 2 + lines.length * lineH - lineGap);
  const desiredRect: OverheadRect = {
    x: Math.round(sx - bw / 2),
    y: Math.round(sy - bh - getSpeechBubbleHeadClearance(size, zoom, hasLeaderCrown) + bob),
    width: bw,
    height: bh,
  };
  const resolvedRect = resolveSpeechBubbleRect(desiredRect, occupiedBubbleRects);
  occupiedBubbleRects.push(resolvedRect);
  const { x: bx, y: by } = resolvedRect;

  // Soft shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, bx + 1, by + 2, bw, bh, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,252,245,0.97)';
  ctx.strokeStyle = 'rgba(41,37,36,0.5)';
  ctx.lineWidth = 1.25;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.fillStyle = 'rgba(255,252,245,0.97)';
  ctx.beginPath();
  ctx.moveTo(sx - 5, by + bh - 1);
  ctx.lineTo(sx, sy - size - 4 + bob * 0.3);
  ctx.lineTo(sx + 5, by + bh - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1c1917';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const textStartY = by + padY + fontSize * 0.08;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Clip visually if measure overflowed maxBw
    if (ctx.measureText(line).width > bw - padX * 2) {
      let clipped = line;
      while (clipped.length > 4 && ctx.measureText(`${clipped}…`).width > bw - padX * 2) {
        clipped = clipped.slice(0, -1);
      }
      ctx.fillText(`${clipped}…`, sx, textStartY + i * lineH);
    } else {
      ctx.fillText(line, sx, textStartY + i * lineH);
    }
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function buildConstructionWorkerIds(buildings: RenderSnapshot['buildings']): Set<number> {
  const ids = new Set<number>();
  for (const b of buildings) {
    if (b.completed) continue;
    for (const id of b.occupants) ids.add(id);
  }
  return ids;
}

interface HumanStatusIconContext {
  hourOfDay: number;
  villageLeaderId: number | null;
  constructionWorkerIds: Set<number>;
  combatFlags: HumanCombatStatusFlags;
  childSchoolById: Map<number, RenderSnapshot['buildings'][number] | undefined>;
}

function buildHumanStatusIconContext(
  state: RenderSnapshot,
  humans: readonly Entity[],
): HumanStatusIconContext {
  const staffedSchools = findStaffedSchools(state.buildings);
  const childSchoolById = new Map<number, RenderSnapshot['buildings'][number] | undefined>();
  for (const human of humans) {
    if (!human.isJuvenile) continue;
    childSchoolById.set(human.id, findNearestStaffedSchool(human, staffedSchools));
  }
  return {
    hourOfDay: state.hourOfDay,
    villageLeaderId: state.villageLeaderId,
    constructionWorkerIds: buildConstructionWorkerIds(state.buildings),
    combatFlags: buildHumanCombatStatusFlags(
      state.unlockedTechs,
      state.hasBlacksmith,
      state.villageForge,
      state.buildings,
    ),
    childSchoolById,
  };
}

function getStatusIcon(human: Entity, ctx: HumanStatusIconContext): string {
  if (ctx.villageLeaderId != null && human.id === ctx.villageLeaderId) return '👑';
  if (human.moonHowlerCursed) return '🌝';
  const combatIcon = getHumanStatusCombatIconFromFlags(human, ctx.combatFlags);
  if (combatIcon) return combatIcon;
  if (human.faction === 'visitor') return '🧳';
  if (human.faction === 'rival') return '🏕️';
  if (human.isJuvenile) {
    const school = ctx.childSchoolById.get(human.id);
    if (school && isWorkHour(ctx.hourOfDay)) {
      return isChildAtSchool(human, school) ? '📚' : '🎒';
    }
    return '👶';
  }
  if (human.pregnant) return '🤰';
  if (human.courtshipProgress && human.courtshipProgress > 0 && !shouldBeAtHome(ctx.hourOfDay)) return '💕';
  if (shouldBeAtHome(ctx.hourOfDay)) return '🏠';
  if (isWorkHour(ctx.hourOfDay) && (human.homeBuildingId || ctx.constructionWorkerIds.has(human.id))) return '🔨';
  if (human.relationshipStatus === 'married' && human.partnerId) return '💍';
  return '🚶';
}

function getPlayerCampCenterFromBuildings(buildings: RenderSnapshot['buildings']): { x: number; y: number } {
  const playerBuildings = buildings.filter((b) => b.completed && b.faction !== 'rival');
  const townHall = playerBuildings.find((b) => b.type === BuildingType.TownHall);
  if (townHall) {
    return { x: townHall.x + townHall.width / 2, y: townHall.y + townHall.height / 2 };
  }
  const house = playerBuildings.find((b) => b.type === BuildingType.House);
  if (house) {
    return { x: house.x + house.width / 2, y: house.y + house.height / 2 };
  }
  if (playerBuildings.length > 0) {
    const b = playerBuildings[0];
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return { x: 0, y: 0 };
}

export function drawTradeRouteLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const hubTypes: BuildingType[] = [BuildingType.Market, BuildingType.Store, BuildingType.TownHall, BuildingType.Workshop];
  let hub = state.buildings.find((b) => b.completed && b.faction !== 'rival' && hubTypes.includes(b.type));
  if (!hub) hub = state.buildings.find((b) => b.completed && b.faction !== 'rival');
  if (!hub) return;
  const hx = (hub.x + hub.width / 2 - cam.x) * cam.zoom + cw / 2;
  const hy = (hub.y + hub.height / 2 - cam.y) * cam.zoom + ch / 2;

  for (const route of state.tradeRoutes) {
    if (!route.active || route.partnerX == null || route.partnerY == null) continue;
    const px = (route.partnerX - cam.x) * cam.zoom + cw / 2;
    const py = (route.partnerY - cam.y) * cam.zoom + ch / 2;
    const marching = route.caravanCarrierId != null;
    ctx.strokeStyle = marching ? 'rgba(251,191,36,0.55)' : 'rgba(52,211,153,0.35)';
    ctx.lineWidth = marching ? 2.5 : 1.5;
    ctx.setLineDash(marching ? [10, 5] : [6, 8]);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = marching ? '#fbbf24' : '#34d399';
    ctx.fillText('🚚', (hx + px) / 2, (hy + py) / 2 - 6);
  }
}

export function drawRaidMarchLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const hasIncoming = (state.pendingRaidEvents?.length ?? 0) > 0;
  const hasOutgoing = (state.pendingOutgoingRaidEvents?.length ?? 0) > 0;
  if ((!hasIncoming && !hasOutgoing) || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const village = getPlayerCampCenterFromBuildings(state.buildings);
  const vx = (village.x - cam.x) * cam.zoom + cw / 2;
  const vy = (village.y - cam.y) * cam.zoom + ch / 2;

  // Incoming: solid rose (threat toward village)
  for (const raid of state.pendingRaidEvents ?? []) {
    const rival = state.rivalSettlements.find((r) => r.id === raid.rivalId);
    if (!rival) continue;
    const rx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const ry = (rival.campY - cam.y) * cam.zoom + ch / 2;
    ctx.strokeStyle = 'rgba(244,63,94,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fb7185';
    ctx.fillText('⚔️', (rx + vx) / 2, (ry + vy) / 2 - 6);
  }

  // Outgoing: dashed amber/orange, heavier stroke; counter-raid uses gold + short dash
  for (const raid of state.pendingOutgoingRaidEvents ?? []) {
    const rival = state.rivalSettlements.find((r) => r.id === raid.rivalId);
    if (!rival) continue;
    const rx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const ry = (rival.campY - cam.y) * cam.zoom + ch / 2;
    const counter = !!raid.isCounterRaid;
    ctx.strokeStyle = counter ? 'rgba(251,191,36,0.7)' : 'rgba(249,115,22,0.7)';
    ctx.lineWidth = counter ? 3 : 2.75;
    ctx.setLineDash(counter ? [4, 4] : [12, 6]);
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.setLineDash([]);
    // Endpoint marker toward rival camp
    const mx = vx + (rx - vx) * 0.92;
    const my = vy + (ry - vy) * 0.92;
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(2.5, 3.5 * Math.min(1, cam.zoom)), 0, Math.PI * 2);
    ctx.fillStyle = counter ? 'rgba(251,191,36,0.85)' : 'rgba(251,146,60,0.85)';
    ctx.fill();
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = counter ? '#fbbf24' : '#fb923c';
    ctx.fillText(counter ? '🛡️' : '🥾', (vx + rx) / 2, (vy + ry) / 2 - 6);
  }
}

export function drawHuntChaseLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.camera.zoom < 0.4) return;
  const cam = state.camera;
  const hunters = state.renderSoA
    ? [..._tickAnimals, ..._tickHumans]
    : state.entities.filter((e) => e.alive && e.huntTargetId);
  const entityById = new Map<number, Entity>();
  if (state.renderSoA) {
    const buckets = _renderSoABuckets ?? getRenderSoABuckets();
    for (const shim of buckets.shims) entityById.set(shim.id, shim);
  } else {
    for (const e of state.entities) {
      if (e.alive) entityById.set(e.id, e);
    }
  }

  for (const hunter of hunters) {
    if (!hunter.huntTargetId) continue;
    const prey = entityById.get(hunter.huntTargetId);
    if (!prey) continue;

    const hx = (hunter.x - cam.x) * cam.zoom + cw / 2;
    const hy = (hunter.y - cam.y) * cam.zoom + ch / 2;
    const px = (prey.x - cam.x) * cam.zoom + cw / 2;
    const py = (prey.y - cam.y) * cam.zoom + ch / 2;

    const isHumanHunter = hunter.type === EntityType.Human;
    ctx.strokeStyle = isHumanHunter ? 'rgba(249,115,22,0.55)' : 'rgba(168,162,158,0.45)';
    ctx.lineWidth = isHumanHunter ? 1.5 : 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `${Math.max(7, 8 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isHumanHunter ? '#fb923c' : '#a8a29e';
    ctx.fillText(isHumanHunter ? '🏹' : isPredatorType(hunter.type) ? '🐾' : '•', (hx + px) / 2, (hy + py) / 2 - 4);
  }
}

/** Hunting Spot shots — dashed arrow flight toward the prey (data from huntvisuals.ts). */
export function drawHuntVisuals(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const visuals = state.huntVisuals;
  if (!visuals || visuals.length === 0 || state.camera.zoom < 0.4) return;
  const cam = state.camera;
  for (const v of visuals) {
    const progress = huntAnimProgress(v);
    if (progress <= 0 || progress >= 1) continue;

    const sx = (v.fromX - cam.x) * cam.zoom + cw / 2;
    const sy = (v.fromY - cam.y) * cam.zoom + ch / 2;
    const tx = (v.toX - cam.x) * cam.zoom + cw / 2;
    const ty = (v.toY - cam.y) * cam.zoom + ch / 2;
    const mx = sx + (tx - sx) * progress;
    const my = sy + (ty - sy) * progress;

    // Dashed flight path behind the arrow
    ctx.strokeStyle = 'rgba(249,115,22,0.45)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow projectile (gold triangle) at the tip
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(ty - sy, tx - sx));
    ctx.fillStyle = v.foughtBack ? '#f87171' : '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(7 * cam.zoom, 0);
    ctx.lineTo(-4 * cam.zoom, -3.5 * cam.zoom);
    ctx.lineTo(-4 * cam.zoom, 3.5 * cam.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function drawCombatBurst(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, tick: number, entityId: number) {
  const pulse = 0.5 + Math.sin(tick * 0.5 + entityId) * 0.5;
  ctx.save();
  ctx.strokeStyle = `rgba(251,191,36,${0.35 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.55 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawHumans(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
  forEntityLayerCache = false,
) {
  const tick = state.tick;
  const cam = state.camera;
  const statusCtx = buildHumanStatusIconContext(state, _cachedHumans);
  const occupiedBubbleRects: OverheadRect[] = [];

  for (const human of _cachedHumans) {
    const sx = (human.x - cam.x) * cam.zoom + cw / 2;
    // Ride the 2.5D relief — settlers walk on the raised terrain surface
    const sy = (human.y - cam.y) * cam.zoom + ch / 2
      - terrainRiseAt(state.worldMap, human.x, human.y) * cam.zoom;
    const { size, spriteH, footOffset } = getHumanSpriteMetrics(human, cam.zoom);
    const cullPad = Math.max(size * 1.5, spriteH);
    if (sx + cullPad < -20 || sx - cullPad > cw + 20 || sy + cullPad < -20 || sy - cullPad > ch + 20) continue;

    const isSel = state.selectedEntityIds.includes(human.id) || state.selectedEntity?.id === human.id;
    const flipX = human.vx < -0.05 || (Math.abs(human.vx) <= 0.05 && Math.cos(human.spriteAngle ?? 0) < 0);
    const speed = Math.hypot(human.vx, human.vy);
    const isWalking = speed > HUMAN_WALK_SPEED_THRESHOLD;
    const walkFrame = isWalking ? getHumanWalkFrameIndex(human.animFrame ?? 0, speed) : 0;
    const walkMotion = getHumanWalkMotion(human, cam.zoom, isWalking, walkFrame);
    const drawSize = size;
    const footY = sy + footOffset;
    const headY = footY - spriteH;
    const bobY = walkMotion.bobY ?? 0;

    const shadowScale = speed > 0.1 ? 1.1 : 1;
    drawContactShadow(
      ctx,
      sx,
      footY,
      size * 0.46 * shadowScale,
      size * 0.13,
      { offsetX: size * 0.08, offsetY: 2, alpha: 0.3, enhanced: state.juiceEffectsEnabled },
    );

    const drawHuman = () => {
      const gender = (human.gender ?? 'male') as HumanGender;
      const variant = human.spriteVariant ?? pickHumanVariant(human.id, gender);
      const frame = human.isJuvenile
                ? getJuvenileSpriteFrame(gender, variant)

        : isWalking
          ? getHumanSpriteFrame(gender, variant, walkFrame)
          : getHumanSpriteFrame(gender, variant, 0);
      if (isDrawableSpriteFrame(frame)) {
        const aspect = frame.sw / frame.sh;
        const anchorY = frame.anchorY ?? 1;
        drawSpriteFrame(
          ctx, frame, sx, footY, spriteH * aspect, spriteH,
          0.5, anchorY, flipX, { bobY }, 'height',
        );
        return;
      }
      drawPioneerAt(
        ctx, sx, footY, spriteH,
        human.gender, variant, walkFrame, flipX, bobY,
      );
    };

    if (human.flash > 0 && !forEntityLayerCache) {
      ctx.save();
      ctx.globalAlpha = 0.7 + Math.sin(renderTime * 20) * 0.3;
      drawHuman();
      ctx.restore();
    } else {
      drawHuman();
    }

    if (human.combatTicks && human.combatTicks > 0) {
      drawCombatBurst(ctx, sx, footY - spriteH * 0.45, drawSize, tick, human.id);
    }

    const isTalking = (human.chatTicks ?? 0) > 0;
    // Village leader — gold ring + crown (visible even zoomed out)
    const isLeader =
      state.villageLeaderId != null
      && human.id === state.villageLeaderId
      && !human.faction;
    if (isTalking) {
      drawTalkingMouth(ctx, sx, headY + spriteH * 0.12, drawSize, flipX, human.animFrame ?? 0);
      const bubbleText = getChatBubbleText(human, tick);
      drawSpeechBubble(
        ctx, sx, headY, drawSize, bubbleText, tick, human.id, cam.zoom,
        isLeader, occupiedBubbleRects,
      );
    }

    if (isLeader && cam.zoom > 0.22) {
      ctx.save();
      const pulse = 0.55 + Math.sin(renderTime * 2.8 + human.id) * 0.2;
      // Soft gold ground ring (double stroke at closer zoom)
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = Math.max(2, 2.5 * cam.zoom);
      ctx.beginPath();
      ctx.ellipse(sx, footY + 1, size * 0.62, size * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (cam.zoom > 0.35) {
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.25 + pulse * 0.2})`;
        ctx.lineWidth = Math.max(1, 1.2 * cam.zoom);
        ctx.beginPath();
        ctx.ellipse(sx, footY + 1, size * 0.78, size * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Head halo
      const halo = ctx.createRadialGradient(sx, headY + bobY, 2, sx, headY + bobY, size * 1.05);
      halo.addColorStop(0, `rgba(253, 224, 71, ${0.4 * pulse})`);
      halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, headY + bobY + spriteH * 0.08, size * 0.95, 0, Math.PI * 2);
      ctx.fill();
      // Crown above head
      const crownY = headY + bobY - Math.max(5, 7 * cam.zoom);
      ctx.font = `${Math.max(12, Math.round(15 * cam.zoom))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText('👑', sx + 0.5, crownY + 0.5);
      ctx.fillStyle = '#fde047';
      ctx.fillText('👑', sx, crownY);
      ctx.restore();
    }

    // Status badge
    if (cam.zoom > 0.6) {
      const bx = sx + size * 0.35;
      const by = headY + spriteH * 0.12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getStatusIcon(human, statusCtx), bx, by);
      ctx.textBaseline = 'alphabetic';
    }

    // Name label — leaders keep a gold plate at lower zoom
    const labelY = headY - 4 - (isLeader && cam.zoom > 0.22 ? Math.max(10, 12 * cam.zoom) : 0);
    if (human.faction && cam.zoom > 0.55) {
      ctx.strokeStyle = human.faction === 'visitor' ? '#22d3ee' : '#fb923c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.38, spriteH * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const nameZoomMin = isLeader ? 0.28 : (human.isJuvenile ? 0.38 : 0.45);
    if (shouldDrawHumanNameLabel(isTalking) && (human.name || human.surname || isLeader) && cam.zoom > nameZoomMin) {
      const prefix = isLeader
        ? '👑 '
        : human.faction === 'visitor'
          ? '↗ '
          : human.faction === 'rival'
            ? '⚑ '
            : '';
      const childTag = human.isJuvenile ? ' · child' : '';
      const roleTag = isLeader && cam.zoom > 0.5 ? ' · Head' : '';
      const idTag = !human.faction && !isLeader && cam.zoom > 0.72 ? ` #${human.id}` : '';
      const displayName = human.name?.trim() || (isLeader ? 'Village head' : 'Settler');
      const fullName = prefix + (human.surname ? `${displayName} ${human.surname}` : displayName) + (human.title ? ` ${human.title}` : '') + roleTag + idTag + childTag;
      const fontSize = Math.max(isLeader ? 8 : 7, Math.min(isLeader ? 11 : 9, (isLeader ? 9.5 : 8) * cam.zoom));
      const tw = getCachedNameWidth(ctx, fullName, fontSize, cam.zoom);
      if (isLeader) {
        ctx.fillStyle = 'rgba(120, 53, 15, 0.82)';
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 1;
        ctx.fillRect(sx - tw / 2 - 4, labelY - fontSize - 3, tw + 8, fontSize + 6);
        ctx.strokeRect(sx - tw / 2 - 4, labelY - fontSize - 3, tw + 8, fontSize + 6);
        ctx.fillStyle = '#fde68a';
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx - tw / 2 - 3, labelY - fontSize - 2, tw + 6, fontSize + 4);
        ctx.fillStyle = human.faction === 'visitor' ? '#67e8f9' : human.faction === 'rival' ? '#fdba74' : human.gender === 'male' ? '#fbbf24' : '#fda4af';
      }
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fullName, sx, labelY);
      ctx.textBaseline = 'alphabetic';
    }

    if (isSel) {
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.44, spriteH * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.44, spriteH * 0.56, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ground marker under feet
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(sx, footY + 2, size * 0.5, size * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}


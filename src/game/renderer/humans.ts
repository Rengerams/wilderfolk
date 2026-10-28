import { BuildingType, EntityType, type Entity } from '../gameTypes';
import { isWorkHour, shouldBeAtHome } from '../dayCycle';
import { isChildAtSchool, isSchoolTime } from '../education';
import {
  buildHumanCombatStatusFlags,
  getHumanStatusCombatIconFromFlags,
  isPredatorType,
  type HumanCombatStatusFlags,
} from '../combat';
import {
  drawPioneerAt,
  getHumanMarkerColors,
  getHumanMarkerRadius,
  getHumanSpriteMetrics,
  getHumanSpriteFrame,
  getJuvenileFigureScale,
  getJuvenileSpriteFrame,
  pickHumanVariant,
  HUMAN_SPRITE_MIN_ZOOM,
  HUMAN_WALK_SPEED_THRESHOLD,
  type HumanGender,
} from '../humanSprites';
import { getChatBubbleText, wrapChatLines } from '../humanChat';
import { isAsleepAtHome } from '../humanSchedule';
import { getPlayerCampCenter } from '../villageAnchor';
import type { RenderSnapshot } from '../renderSnapshot';
import { terrainRiseAt } from '../terrainAtlas';
import { getRenderSoABuckets } from '../simBuffers/renderSoAEntities';
import { huntAnimProgress } from '../huntvisuals';
import { getCachedNameWidth, isDrawableSpriteFrame, motionTime, roundRect } from './shared';
import {
  clampSpeechBubbleTailY,
  formatHumanNameLabel,
  getNamePlateLayout,
  getSpeechBubbleFontSize,
  getSpeechBubbleHeadClearance,
  getStatusBadgeColor,
  getStatusBadgeLayout,
  getStatusBadgeShape,
  resolveSpeechBubbleRect,
  resolveStatusBadgeKind,
  shouldDrawHumanNameLabel,
  type HumanStatusFacts,
  type HumanStatusKind,
  type OverheadRect,
  type StatusBadgeShape,
} from './overheadLayout';

import { _cachedHumans, _cachedPartnerById, _renderSoABuckets, _tickAnimals, _tickHumans } from './entityCache';
import { getSpotlightPresentationMotion, presentationPosition } from './motionInterpolation';
import { drawContactShadow, drawSpriteFrame, getHumanWalkMotion, walkFrameOnClock } from './spriteDrawing';

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

  // Tail — clamped so a lifted bubble's tail stops above the name plate instead of slicing its text.
  const tailBottom = by + bh - 1;
  const tailTipY = clampSpeechBubbleTailY(tailBottom, sy - size - 4 + bob * 0.3, occupiedBubbleRects);
  if (tailTipY > tailBottom + 1) {
    ctx.fillStyle = 'rgba(255,252,245,0.97)';
    ctx.beginPath();
    ctx.moveTo(sx - 5, tailBottom);
    ctx.lineTo(sx, tailTipY);
    ctx.lineTo(sx + 5, tailBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

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
  classHours: boolean;
  villageLeaderId: number | null;
  constructionWorkerIds: Set<number>;
  combatFlags: HumanCombatStatusFlags;
  childSchoolById: Map<number, RenderSnapshot['buildings'][number] | undefined>;
}

function buildHumanStatusIconContext(
  state: RenderSnapshot,
  humans: readonly Entity[],
): HumanStatusIconContext {
  const schools = new Map(state.buildings.filter((b) =>
    b.type === BuildingType.School && b.completed && b.faction !== 'rival' && b.occupants.length > 0,
  ).map((b) => [b.id, b]));
  const childSchoolById = new Map<number, RenderSnapshot['buildings'][number] | undefined>();
  for (const human of humans) {
    if (!human.isJuvenile) continue;
    childSchoolById.set(human.id, schools.get(human.schoolBuildingId ?? -1));
  }
  return {
    hourOfDay: state.hourOfDay,
    classHours: isSchoolTime(state.tick, state.hourOfDay),
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

function getStatusFacts(human: Entity, ctx: HumanStatusIconContext): HumanStatusFacts {
  const school = human.isJuvenile ? ctx.childSchoolById.get(human.id) : undefined;
  const schoolHours = !!school && ctx.classHours;
  return {
    isLeader: ctx.villageLeaderId != null && human.id === ctx.villageLeaderId,
    isMoonHowler: !!human.moonHowlerCursed,
    combatToken: getHumanStatusCombatIconFromFlags(human, ctx.combatFlags),
    faction: human.faction ?? null,
    isJuvenile: !!human.isJuvenile,
    schoolStatus: schoolHours ? (isChildAtSchool(human, school) ? 'atSchool' : 'toSchool') : null,
    isPregnant: !!human.pregnant,
    isCourting: !!human.courtshipProgress && human.courtshipProgress > 0 && !shouldBeAtHome(ctx.hourOfDay),
    isAtHome: shouldBeAtHome(ctx.hourOfDay),
    isWorking: isWorkHour(ctx.hourOfDay) && !!(human.workerBuildingId || ctx.constructionWorkerIds.has(human.id)),
    isMarried: human.relationshipStatus === 'married' && !!human.partnerId,
  };
}

/** Plate colour behind a cut-out in a glyph, so the mark keeps a readable edge. */
const STATUS_BADGE_PLATE = 'rgba(17,24,39,0.85)';

/** Paint one status silhouette in a unit box at the origin; every mark is a path, never a font glyph. */
function paintStatusGlyph(
  ctx: CanvasRenderingContext2D,
  shape: StatusBadgeShape,
  mark: string,
): void {
  switch (shape) {
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(-0.78, 0.5);
      ctx.lineTo(-0.78, -0.34);
      ctx.lineTo(-0.38, 0.02);
      ctx.lineTo(0, -0.46);
      ctx.lineTo(0.38, 0.02);
      ctx.lineTo(0.78, -0.34);
      ctx.lineTo(0.78, 0.5);
      ctx.closePath();
      ctx.fill();
      return;
    case 'crescent':
      ctx.beginPath();
      ctx.arc(0.1, 0, 0.7, Math.PI * 0.42, Math.PI * 1.58);
      ctx.stroke();
      return;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(0, 0.12, 0.62, Math.PI, 0);
      ctx.lineTo(0.62, 0.52);
      ctx.lineTo(-0.62, 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mark;
      ctx.fillRect(-0.62, -0.1, 1.24, 0.2);
      return;
    case 'bow':
      ctx.beginPath();
      ctx.arc(0.16, 0, 0.68, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.16, -0.68);
      ctx.lineTo(0.16, 0.68);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.52, 0);
      ctx.lineTo(0.66, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.9, 0);
      ctx.lineTo(0.48, -0.24);
      ctx.lineTo(0.48, 0.24);
      ctx.closePath();
      ctx.fill();
      return;
    case 'crossed':
      ctx.beginPath();
      ctx.moveTo(-0.62, -0.62);
      ctx.lineTo(0.62, 0.62);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.62, -0.62);
      ctx.lineTo(-0.62, 0.62);
      ctx.stroke();
      return;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(0, -0.74);
      ctx.lineTo(0.64, -0.44);
      ctx.lineTo(0.64, 0.06);
      ctx.quadraticCurveTo(0.64, 0.5, 0, 0.78);
      ctx.quadraticCurveTo(-0.64, 0.5, -0.64, 0.06);
      ctx.lineTo(-0.64, -0.44);
      ctx.closePath();
      ctx.fill();
      return;
    case 'case':
      ctx.fillRect(-0.7, -0.28, 1.4, 0.92);
      ctx.beginPath();
      ctx.arc(0, -0.3, 0.26, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = mark;
      ctx.fillRect(-0.15, -0.08, 0.3, 0.52);
      return;
    case 'tent':
      ctx.beginPath();
      ctx.moveTo(-0.8, 0.58);
      ctx.lineTo(0, -0.72);
      ctx.lineTo(0.8, 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mark;
      ctx.beginPath();
      ctx.moveTo(-0.26, 0.58);
      ctx.lineTo(0, 0.02);
      ctx.lineTo(0.26, 0.58);
      ctx.closePath();
      ctx.fill();
      return;
    case 'book':
      ctx.beginPath();
      ctx.moveTo(-0.84, -0.42);
      ctx.lineTo(-0.04, -0.58);
      ctx.lineTo(-0.04, 0.52);
      ctx.lineTo(-0.84, 0.64);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0.84, -0.42);
      ctx.lineTo(0.04, -0.58);
      ctx.lineTo(0.04, 0.52);
      ctx.lineTo(0.84, 0.64);
      ctx.closePath();
      ctx.fill();
      return;
    case 'pack':
      ctx.fillRect(-0.6, -0.26, 1.2, 0.96);
      ctx.beginPath();
      ctx.arc(0, -0.28, 0.28, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = mark;
      ctx.fillRect(-0.6, 0.14, 1.2, 0.18);
      return;
    case 'babe':
      ctx.beginPath();
      ctx.arc(0, -0.44, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-0.42, -0.02, 0.84, 0.62);
      return;
    case 'belly':
      ctx.beginPath();
      ctx.arc(-0.2, -0.46, 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.1, 0.16, 0.58, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, 0.72);
      ctx.bezierCurveTo(-1.05, 0.02, -0.58, -0.86, 0, -0.28);
      ctx.bezierCurveTo(0.58, -0.86, 1.05, 0.02, 0, 0.72);
      ctx.closePath();
      ctx.fill();
      return;
    case 'house':
      ctx.beginPath();
      ctx.moveTo(-0.84, -0.04);
      ctx.lineTo(0, -0.78);
      ctx.lineTo(0.84, -0.04);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-0.56, 0.02, 1.12, 0.6);
      return;
    case 'mallet':
      ctx.fillRect(-0.13, -0.06, 0.26, 0.72);
      ctx.fillRect(-0.62, -0.7, 1.24, 0.44);
      return;
    case 'ring':
      ctx.beginPath();
      ctx.arc(0, 0.16, 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -0.82);
      ctx.lineTo(0.22, -0.58);
      ctx.lineTo(0, -0.34);
      ctx.lineTo(-0.22, -0.58);
      ctx.closePath();
      ctx.fill();
      return;
    case 'walker':
      ctx.beginPath();
      ctx.arc(0, -0.58, 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -0.3);
      ctx.lineTo(0, 0.18);
      ctx.moveTo(0, 0.18);
      ctx.lineTo(-0.4, 0.72);
      ctx.moveTo(0, 0.18);
      ctx.lineTo(0.42, 0.58);
      ctx.moveTo(0, -0.14);
      ctx.lineTo(-0.44, 0.12);
      ctx.stroke();
      return;
  }
}

/** Status badge: a coloured rim and one drawn silhouette, so the status never needs an emoji font. */
function drawStatusBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rimWidth: number,
  kind: HumanStatusKind,
): void {
  const color = getStatusBadgeColor(kind);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = STATUS_BADGE_PLATE;
  ctx.fill();
  ctx.lineWidth = rimWidth;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.translate(cx, cy);
  ctx.scale(radius, radius);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paintStatusGlyph(ctx, getStatusBadgeShape(kind), STATUS_BADGE_PLATE);
  ctx.restore();
}

export function drawTradeRouteLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.camera.zoom < 0.35) return;
  // `hx`/`hy` are read only from inside the routes loop below, so with no routes the two
  // full-buildings scans that derive them cannot affect any output — this returns before them.
  if (state.tradeRoutes.length === 0) return;
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
  // The anchor is the simulation's own rule (`getPlayerCampCenter`): hall, then house, then the
  // living settlers' mean, then the map centre. A private copy of the building half used to live
  // here and returned the first completed player building when there was no hall or house, so a
  // drawn march line could point somewhere the simulated raid never went
  // (`tests/villageAnchor.singleOwner.test.ts`). `RenderSnapshot` carries the three fields the rule
  // reads, so the snapshot itself is what it is asked for — no cast.
  const village = getPlayerCampCenter(state, state.buildings);
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

  const drawHunterLine = (hunter: Entity, byId: Map<number, Entity>) => {
    if (!hunter.huntTargetId) return;
    const prey = byId.get(hunter.huntTargetId);
    if (!prey) return;

    const hunterPos = presentationPosition(hunter);
    const preyPos = presentationPosition(prey);
    const hx = (hunterPos.x - cam.x) * cam.zoom + cw / 2;
    const hy = (hunterPos.y - cam.y) * cam.zoom + ch / 2;
    const px = (preyPos.x - cam.x) * cam.zoom + cw / 2;
    const py = (preyPos.y - cam.y) * cam.zoom + ch / 2;

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
  };

  if (state.renderSoA) {
    // The SoA bucket builder already made `shimById` for this tick; iterating the two draw buckets
    // directly avoids the per-repaint `[..._tickAnimals, ..._tickHumans]` spread and the per-repaint
    // id Map rebuild.
    const buckets = _renderSoABuckets ?? getRenderSoABuckets();
    const byId = buckets.shimById;
    for (const hunter of _tickAnimals) drawHunterLine(hunter, byId);
    for (const hunter of _tickHumans) drawHunterLine(hunter, byId);
    return;
  }

  // Main-thread fallback: the world's entities are the source of truth and there is no bucket index.
  const byId = new Map<number, Entity>();
  for (const e of state.entities) {
    if (e.alive) byId.set(e.id, e);
  }
  for (const hunter of state.entities) {
    if (hunter.alive && hunter.huntTargetId) drawHunterLine(hunter, byId);
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

    // A physical arrow is rendered at the hunter's projectile position. Do not
    // draw a map-sized dotted tracer: a Hunting Spot is a workplace, not a tower
    // with an automatic beam weapon.
    const angle = Math.atan2(ty - sy, tx - sx);
    const arrowLength = Math.max(8, 13 * cam.zoom);
    const shaftHalf = arrowLength * 0.48;
    const alpha = v.foughtBack ? 0.9 : 1;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    // Wooden shaft.
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = Math.max(1, 1.4 * cam.zoom);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-shaftHalf, 0);
    ctx.lineTo(shaftHalf, 0);
    ctx.stroke();

    // Arrow head.
    ctx.fillStyle = v.foughtBack ? '#f87171' : '#d9e2e8';
    ctx.beginPath();
    ctx.moveTo(shaftHalf + 4 * cam.zoom, 0);
    ctx.lineTo(shaftHalf - 2 * cam.zoom, -2.5 * cam.zoom);
    ctx.lineTo(shaftHalf - 2 * cam.zoom, 2.5 * cam.zoom);
    ctx.closePath();
    ctx.fill();

    // Small fletching at the tail makes the travelling object read as an arrow.
    ctx.fillStyle = v.foughtBack ? '#991b1b' : '#c2410c';
    ctx.beginPath();
    ctx.moveTo(-shaftHalf, 0);
    ctx.lineTo(-shaftHalf - 3 * cam.zoom, -2.4 * cam.zoom);
    ctx.lineTo(-shaftHalf - 1 * cam.zoom, 0);
    ctx.lineTo(-shaftHalf - 3 * cam.zoom, 2.4 * cam.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Combat ring — pulses on the render clock, so a fight reads as motion between simulation ticks. */
export function drawCombatBurst(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, entityId: number) {
  const pulse = 0.5 + Math.sin(motionTime * 6 + entityId) * 0.5;
  ctx.save();
  ctx.strokeStyle = `rgba(251,191,36,${0.35 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.55 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Zoomed-out settler LOD: one small dot instead of the full sprite.
 *
 * Skips every per-settler cost the sprite path pays — frame lookup, walk frame, contact
 * shadow, bob, status badge, speech bubble and name plate — which is both the
 * readability fix and the frame-cost fix for a 200+ citizen village. The dot keeps the
 * settler's own class colour (visitors cyan, rivals orange, the leader gold and
 * crowned) so national and social identity survive the zoom-out.
 */
function drawHumanMarker(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  human: Entity,
  zoom: number,
  isLeader: boolean,
): void {
  const gender = (human.gender ?? 'male') as HumanGender;
  const variant = human.spriteVariant ?? pickHumanVariant(human.id, gender);
  const { fill, outline } = getHumanMarkerColors(gender, variant);
  const radius = getHumanMarkerRadius(zoom, human.isJuvenile, isLeader);
  const fillColor = human.faction === 'visitor' ? '#22d3ee' : human.faction === 'rival' ? '#fb923c' : fill;
  ctx.beginPath();
  ctx.arc(sx, sy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = isLeader ? 2 : 1;
  ctx.strokeStyle = isLeader ? '#fbbf24' : outline;
  ctx.stroke();
  if (isLeader) {
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('👑', sx, sy - radius - 2);
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * The village leader's aura — gold ground rings, head halo and crown — drawn in the per-frame
 * overlay pass, and the **only** owner of it.
 *
 * The aura pulses on `renderTime`, which advances every frame, while the world entity bitmap is
 * repainted only when its layer key changes: once per simulation tick, and never while paused. An
 * aura painted into that bitmap therefore froze at whatever phase the last rebake caught, which is
 * why this lives outside {@link drawHumans}.
 *
 * It re-derives exactly the leader that pass would have drawn an aura for: the same
 * `villageLeaderId` + faction test, the same zoom floor, the same "asleep at home is hidden unless
 * selected" rule, and no aura in marker mode (the zoomed-out marker draws its own crown).
 */
export function drawLeaderAuraOverlay(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  const cam = state.camera;
  if (cam.zoom <= 0.22 || state.villageLeaderId == null) return;
  const leader = _cachedHumans.find((h) => h.id === state.villageLeaderId && !h.faction);
  if (!leader || leader.indoorBuildingId != null) return;

  const isSel = state.selectedEntityIds.includes(leader.id) || state.selectedEntity?.id === leader.id;
  if (!isSel) {
    if (cam.zoom < HUMAN_SPRITE_MIN_ZOOM) return; // marker mode — `drawHumanMarker` draws the crown
    if (isAsleepAtHome(leader, state.buildings, state.hourOfDay)) return;
  }

  const leaderPos = presentationPosition(leader);
  const sx = (leaderPos.x - cam.x) * cam.zoom + cw / 2;
  const sy = (leaderPos.y - cam.y) * cam.zoom + ch / 2
    - terrainRiseAt(state.worldMap, leaderPos.x, leaderPos.y) * cam.zoom;
  const { size, spriteH, footOffset } = getHumanSpriteMetrics(leader, cam.zoom);
  const footY = sy + footOffset;
  const cullPad = Math.max(size * 1.5, spriteH);
  if (sx + cullPad < -20 || sx - cullPad > cw + 20) return;
  if (footY + cullPad < -20 || footY - cullPad > ch + 20) return;

  // Same bob the cached pass would have applied, from the same snapshot.
  const speed = Math.hypot(leader.vx, leader.vy);
  const isWalking = speed > HUMAN_WALK_SPEED_THRESHOLD;
  const walkFrame = isWalking ? walkFrameOnClock(motionTime, speed, leader.id) : 0;
  const bobY = getHumanWalkMotion(leader, cam.zoom, isWalking, walkFrame).bobY ?? 0;
  const headY = footY - spriteH;

  ctx.save();
  const pulse = 0.55 + Math.sin(motionTime * 2.8 + leader.id) * 0.2;
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

export function drawHumans(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
  forEntityLayerCache = false,
) {  const tick = state.tick;
  const cam = state.camera;
  const statusCtx = buildHumanStatusIconContext(state, _cachedHumans);
  const occupiedBubbleRects: OverheadRect[] = [];
  /** Bubbles wait for the layout pass to finish, so every name plate is reserved before one is placed. */
  const pendingBubbles: {
    sx: number; headY: number; size: number; text: string; entityId: number; isLeader: boolean;
  }[] = [];
  /** Village-wide zoom: settlers are dots, unless selected (see `HUMAN_SPRITE_MIN_ZOOM`). */
  const markerMode = cam.zoom < HUMAN_SPRITE_MIN_ZOOM;

  for (const human of _cachedHumans) {
    const isSel = state.selectedEntityIds.includes(human.id) || state.selectedEntity?.id === human.id;
    // Indoor occupants stay selectable in inspectors but never draw a body or overhead UI.
    if (human.indoorBuildingId != null || (!isSel && isAsleepAtHome(human, state.buildings, state.hourOfDay))) continue;

    const pos = presentationPosition(human);
    const sx = (pos.x - cam.x) * cam.zoom + cw / 2;
    // Ride the 2.5D relief — settlers walk on the raised terrain surface
    const sy = (pos.y - cam.y) * cam.zoom + ch / 2
      - terrainRiseAt(state.worldMap, pos.x, pos.y) * cam.zoom;
    const { size, spriteH, footOffset } = getHumanSpriteMetrics(human, cam.zoom);
    const cullPad = Math.max(size * 1.5, spriteH);
    if (sx + cullPad < -20 || sx - cullPad > cw + 20 || sy + cullPad < -20 || sy - cullPad > ch + 20) continue;

    // Village leader — gold ring + crown (visible even zoomed out)
    const isLeader =
      state.villageLeaderId != null
      && human.id === state.villageLeaderId
      && !human.faction;

    // Zoomed-out LOD: one dot per settler, no sprite/shadow/bob/badge/bubble/name.
    if (markerMode && !isSel) {
      drawHumanMarker(ctx, sx, sy, human, cam.zoom, isLeader);
      continue;
    }

    const stageMotion = getSpotlightPresentationMotion(human.id);
    const flipX = stageMotion ? stageMotion.facingLeft
      : human.vx < -0.05 || (Math.abs(human.vx) <= 0.05 && Math.cos(human.spriteAngle ?? 0) < 0);
    const speed = stageMotion?.moving ? 2 : Math.hypot(human.vx, human.vy);
    const isWalking = speed > HUMAN_WALK_SPEED_THRESHOLD;
    // The step is sampled from the render clock: the sim tick moves `animFrame` once a second, which
    // made a walk a one-second hop. The sprite sheet is still selected from the tick-advanced frame.
    const walkFrame = isWalking ? walkFrameOnClock(motionTime, speed, human.id) : 0;
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
        // A child's canvas carries transparent padding around its figure, so grow the drawn box by
        // `1 / figure fraction`: the painted figure, not the canvas, is what has to match the shared
        // `spriteH`. Keeping `spriteH` figure-sized leaves headY, the contact shadow and the
        // selection ring measured against the figure rather than the padded canvas.
        const boxH = human.isJuvenile ? spriteH * getJuvenileFigureScale(human) : spriteH;
        drawSpriteFrame(
          ctx, frame, sx, footY, boxH * aspect, boxH,
          0.5, anchorY, flipX, walkMotion, 'height',
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
      ctx.globalAlpha = 0.7 + Math.sin(motionTime * 20) * 0.3;
      drawHuman();
      ctx.restore();
    } else {
      drawHuman();
    }

    if (human.combatTicks && human.combatTicks > 0) {
      drawCombatBurst(ctx, sx, footY - spriteH * 0.45, drawSize, human.id);
    }

    const isTalking = (human.chatTicks ?? 0) > 0;

    // Every plate is laid out before any bubble is placed, so a bubble dodges its own speaker's
    // name plate and a neighbour's whatever order the settlers are drawn in.
    const nameZoomMin = isLeader ? 0.28 : (human.isJuvenile ? 0.38 : 0.45);
    const labelY = headY - 4 - (isLeader && cam.zoom > 0.22 ? Math.max(10, 12 * cam.zoom) : 0);
    let namePlate: { text: string; fontSize: number; labelY: number; rect: OverheadRect } | null = null;
    if (shouldDrawHumanNameLabel(cam.zoom, nameZoomMin) && (human.name || human.surname || isLeader)) {
      const text = formatHumanNameLabel(human, {
        isLeader,
        showRole: cam.zoom > 0.5,
        showId: cam.zoom > 0.72,
      });
      const fontSize = Math.max(isLeader ? 8 : 7, Math.min(isLeader ? 11 : 9, (isLeader ? 9.5 : 8) * cam.zoom));
      const textWidth = getCachedNameWidth(ctx, text, fontSize, cam.zoom);
      const plate = getNamePlateLayout(labelY, sx, textWidth, fontSize, isLeader);
      occupiedBubbleRects.push(plate.rect);
      namePlate = { text, fontSize, labelY, rect: plate.rect };
    }

    if (isTalking) {
      drawTalkingMouth(ctx, sx, headY + spriteH * 0.12, drawSize, flipX, human.animFrame ?? 0);
      pendingBubbles.push({
        sx,
        headY,
        size: drawSize,
        text: getChatBubbleText(human, tick),
        entityId: human.id,
        isLeader,
      });
    }

    // The leader's aura is deliberately NOT drawn here: it pulses on `renderTime` while this painter
    // feeds a bitmap that is only repainted when its layer key changes. `drawLeaderAuraOverlay` owns
    // it, in the per-frame overlay pass.

    // Status badge
    if (cam.zoom > 0.6) {
      const badge = getStatusBadgeLayout(cam.zoom);
      drawStatusBadge(
        ctx,
        sx + size * 0.35,
        headY + spriteH * 0.12,
        badge.radius,
        badge.rimWidth,
        resolveStatusBadgeKind(getStatusFacts(human, statusCtx)),
      );
    }

    // Faction ring — drawn under the name plate
    if (human.faction && cam.zoom > 0.55) {
      ctx.strokeStyle = human.faction === 'visitor' ? '#22d3ee' : '#fb923c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.38, spriteH * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (namePlate) {
      const { rect } = namePlate;
      if (isLeader) {
        ctx.fillStyle = 'rgba(120, 53, 15, 0.82)';
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 1;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = '#fde68a';
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = human.faction === 'visitor' ? '#67e8f9' : human.faction === 'rival' ? '#fdba74' : human.gender === 'male' ? '#fbbf24' : '#fda4af';
      }
      ctx.font = `bold ${namePlate.fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(namePlate.text, sx, namePlate.labelY);
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

  for (const bubble of pendingBubbles) {
    drawSpeechBubble(
      ctx, bubble.sx, bubble.headY, bubble.size, bubble.text, tick, bubble.entityId, cam.zoom,
      bubble.isLeader, occupiedBubbleRects,
    );
  }
}


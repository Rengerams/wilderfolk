/**
 * Presentation-only spacing rules shared by human overhead overlays.
 * They intentionally contain no simulation state or timing decisions.
 */
import type { Entity } from '../gameTypes';

/** The entity fields the name plate reads. */
export type HumanNameLabelSubject = Pick<
  Entity,
  'name' | 'surname' | 'title' | 'faction' | 'gender' | 'isJuvenile' | 'id'
>;

export interface HumanNameLabelContext {
  readonly isLeader: boolean;
  /** Zoom past which the leader's role suffix is allowed. */
  readonly showRole: boolean;
  /** Zoom past which a settler's id suffix is allowed. */
  readonly showId: boolean;
}

/** Name plate text: the ♂/♀ glyph carries gender, so the plate never reads by colour alone. */
export function formatHumanNameLabel(
  subject: HumanNameLabelSubject,
  context: HumanNameLabelContext,
): string {
  const factionGlyph = subject.faction === 'visitor' ? '↗ ' : subject.faction === 'rival' ? '⚑ ' : '';
  const prefix = context.isLeader ? '👑 ' : factionGlyph;
  const genderGlyph = subject.gender === 'male' ? '♂ ' : subject.gender === 'female' ? '♀ ' : '';
  const displayName = subject.name?.trim() || (context.isLeader ? 'Village head' : 'Settler');
  const fullName = displayName
    + (subject.surname ? ` ${subject.surname}` : '')
    + (subject.title ? ` ${subject.title}` : '');
  const roleTag = context.isLeader && context.showRole ? ' · Head' : '';
  const idTag = !subject.faction && !context.isLeader && context.showId ? ` #${subject.id}` : '';
  const childTag = subject.isJuvenile ? ' · child' : '';
  return prefix + genderGlyph + fullName + roleTag + idTag + childTag;
}

export function getSpeechBubbleFontSize(zoom: number): number {
  return Math.max(7, Math.min(12, 8 * zoom));
}

/** Status-badge disc radius in px at 100 % zoom. */
const STATUS_BADGE_RADIUS_PX = 6.5;
/** Status glyph size in px at 100 % zoom — a colour emoji is unreadable below ~10 px. */
const STATUS_BADGE_FONT_PX = 10;
/** The badge tracks the camera zoom, but never shrinks past legibility or grows past the sprite. */
const STATUS_BADGE_ZOOM_RANGE = { min: 0.8, max: 1.6 } as const;

/**
 * Status-badge geometry — the disc and the glyph inside it, sized together.
 *
 * The glyph is a colour emoji, which is unreadable below ~10 px, so the disc is sized to hold it.
 */
export function getStatusBadgeLayout(zoom: number): { radius: number; fontPx: number } {
  const scale = Math.min(
    STATUS_BADGE_ZOOM_RANGE.max,
    Math.max(STATUS_BADGE_ZOOM_RANGE.min, zoom),
  );
  return { radius: STATUS_BADGE_RADIUS_PX * scale, fontPx: STATUS_BADGE_FONT_PX * scale };
}

export function getSpeechBubbleHeadClearance(
  spriteSize: number,
  zoom: number,
  hasLeaderCrown: boolean,
): number {
  const crownClearance = hasLeaderCrown ? Math.max(10, 12 * zoom) : 0;
  return spriteSize + 14 + crownClearance;
}

/** A speech bubble is the high-priority overhead text while it is visible. */
export function shouldDrawHumanNameLabel(isTalking: boolean): boolean {
  return !isTalking;
}

export interface OverheadRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectanglesOverlap(a: OverheadRect, b: OverheadRect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

/**
 * Place a newer speech bubble above nearby active bubbles. The renderer only
 * keeps this small per-frame list for talking settlers, not all world entities.
 */
export function resolveSpeechBubbleRect(rect: OverheadRect, occupied: readonly OverheadRect[]): OverheadRect {
  let candidate = rect;
  for (let level = 0; level < 8; level++) {
    const conflict = occupied.find((other) => rectanglesOverlap(candidate, other));
    if (!conflict) return candidate;
    candidate = {
      ...candidate,
      y: conflict.y - candidate.height - 6,
    };
  }
  return candidate;
}

/**
 * Name-plate box for a label, plus the padding the painter fills around the text.
 *
 * A plate is an overhead overlay like a bubble, so `resolveSpeechBubbleRect` must be given it.
 */
export function getNamePlateLayout(
  labelY: number,
  sx: number,
  textWidth: number,
  fontSize: number,
  isLeader: boolean,
): { rect: OverheadRect; padX: number; padY: number } {
  const padX = isLeader ? 4 : 3;
  const padY = isLeader ? 3 : 2;
  const width = Math.ceil(textWidth + padX * 2);
  const height = Math.ceil(fontSize + padY * 2);
  return {
    rect: {
      x: Math.round(sx - textWidth / 2 - padX),
      y: Math.round(labelY - fontSize - padY),
      width,
      height,
    },
    padX,
    padY,
  };
}
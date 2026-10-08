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
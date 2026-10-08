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
/** The badge tracks the camera zoom, but never shrinks past legibility or grows past the sprite. */
const STATUS_BADGE_ZOOM_RANGE = { min: 0.8, max: 1.6 } as const;
/** Plate outline as a fraction of the radius — the mark has to read over bright and dark art alike. */
const STATUS_BADGE_RIM_RATIO = 0.2;

/** Status-badge geometry: the plate radius and the outline width drawn inside it. */
export function getStatusBadgeLayout(zoom: number): { radius: number; rimWidth: number } {
  const scale = Math.min(
    STATUS_BADGE_ZOOM_RANGE.max,
    Math.max(STATUS_BADGE_ZOOM_RANGE.min, zoom),
  );
  const radius = STATUS_BADGE_RADIUS_PX * scale;
  return { radius, rimWidth: Math.max(1, radius * STATUS_BADGE_RIM_RATIO) };
}

/** What a settler is doing, as the badge reports it. */
export type HumanStatusKind =
  | 'leader' | 'cursed' | 'guard' | 'hunting' | 'combat' | 'armed'
  | 'visitor' | 'rival' | 'atSchool' | 'toSchool' | 'infant'
  | 'pregnant' | 'courtship' | 'atHome' | 'working' | 'married' | 'idle';

/** Every status the badge can report, in precedence order — leader first, idle last. */
export const HUMAN_STATUS_KINDS: readonly HumanStatusKind[] = [
  'leader', 'cursed', 'guard', 'hunting', 'combat', 'armed',
  'visitor', 'rival', 'atSchool', 'toSchool', 'infant',
  'pregnant', 'courtship', 'atHome', 'working', 'married', 'idle',
];

/** The vector silhouette the badge paints. Never a font glyph, so it cannot become tofu. */
export type StatusBadgeShape =
  | 'crown' | 'crescent' | 'helmet' | 'bow' | 'crossed' | 'shield'
  | 'case' | 'tent' | 'book' | 'pack' | 'babe'
  | 'belly' | 'heart' | 'house' | 'mallet' | 'ring' | 'walker';

const STATUS_BADGE_SHAPES: Record<HumanStatusKind, StatusBadgeShape> = {
  leader: 'crown',
  cursed: 'crescent',
  guard: 'helmet',
  hunting: 'bow',
  combat: 'crossed',
  armed: 'shield',
  visitor: 'case',
  rival: 'tent',
  atSchool: 'book',
  toSchool: 'pack',
  infant: 'babe',
  pregnant: 'belly',
  courtship: 'heart',
  atHome: 'house',
  working: 'mallet',
  married: 'ring',
  idle: 'walker',
};

const STATUS_BADGE_COLORS: Record<HumanStatusKind, string> = {
  leader: '#fde047',
  cursed: '#c4b5fd',
  guard: '#93c5fd',
  hunting: '#fdba74',
  combat: '#fca5a5',
  armed: '#a5b4fc',
  visitor: '#67e8f9',
  rival: '#fb923c',
  atSchool: '#fcd34d',
  toSchool: '#fbbf24',
  infant: '#fda4af',
  pregnant: '#f9a8d4',
  courtship: '#fb7185',
  atHome: '#86efac',
  working: '#fde68a',
  married: '#fef08a',
  idle: '#e7e5e4',
};

/** The drawn silhouette for a status — the badge's shape decision, pure and font-free. */
export function getStatusBadgeShape(kind: HumanStatusKind): StatusBadgeShape {
  return STATUS_BADGE_SHAPES[kind];
}

/** The mark and rim colour for a status. Shape carries the status; colour only reinforces it. */
export function getStatusBadgeColor(kind: HumanStatusKind): string {
  return STATUS_BADGE_COLORS[kind];
}

/** The combat owner publishes a status token; this maps it to the shape the badge draws. */
const COMBAT_TOKEN_STATUS: Record<string, HumanStatusKind> = {
  '🪖': 'guard',
  '🏹': 'hunting',
  '⚔️': 'combat',
  '🛡️': 'armed',
};

export function combatTokenStatusKind(token: string | null): HumanStatusKind | null {
  return token ? COMBAT_TOKEN_STATUS[token] ?? null : null;
}

/** The facts the badge reads — resolved by the caller so the decision stays pure and testable. */
export interface HumanStatusFacts {
  readonly isLeader: boolean;
  readonly isMoonHowler: boolean;
  /** The combat owner's own token, or null. */
  readonly combatToken: string | null;
  readonly faction: 'visitor' | 'rival' | 'trade_caravan' | null;
  readonly isJuvenile: boolean;
  /** Set only for a child who has a staffed school and is inside work hours. */
  readonly schoolStatus: 'atSchool' | 'toSchool' | null;
  readonly isPregnant: boolean;
  readonly isCourting: boolean;
  readonly isAtHome: boolean;
  readonly isWorking: boolean;
  readonly isMarried: boolean;
}

/** Which status the badge reports. Precedence is the reader's: the most specific fact wins. */
export function resolveStatusBadgeKind(facts: HumanStatusFacts): HumanStatusKind {
  if (facts.isLeader) return 'leader';
  if (facts.isMoonHowler) return 'cursed';
  const combat = combatTokenStatusKind(facts.combatToken);
  if (combat) return combat;
  if (facts.faction === 'visitor') return 'visitor';
  if (facts.faction === 'rival') return 'rival';
  if (facts.isJuvenile) return facts.schoolStatus ?? 'infant';
  if (facts.isPregnant) return 'pregnant';
  if (facts.isCourting) return 'courtship';
  if (facts.isAtHome) return 'atHome';
  if (facts.isWorking) return 'working';
  if (facts.isMarried) return 'married';
  return 'idle';
}

export function getSpeechBubbleHeadClearance(
  spriteSize: number,
  zoom: number,
  hasLeaderCrown: boolean,
): number {
  const crownClearance = hasLeaderCrown ? Math.max(10, 12 * zoom) : 0;
  return spriteSize + 14 + crownClearance;
}

/** Whether a settler's name plate is drawn at this zoom. A speaker keeps the plate. */
export function shouldDrawHumanNameLabel(zoom: number, nameZoomMin: number): boolean {
  return zoom > nameZoomMin;
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
 * Lift a speech bubble clear of every rect already reserved this frame — bubbles and name plates.
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
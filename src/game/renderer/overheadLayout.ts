/**
 * Presentation-only spacing rules shared by human overhead overlays.
 * They intentionally contain no simulation state or timing decisions.
 */
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

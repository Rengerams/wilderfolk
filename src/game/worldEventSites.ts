import type { WorldState } from './gameTypes';
import { PATH_CELL } from './gameTypes';
import { isFootprintOnBuildableTerrain, overlapsAnyBuilding } from './placementUtils';
import { getSimRng } from './simRng';
import { deterministicCos, deterministicSin } from './simTrig';

/** Ground a camp's tents and fire occupy, so a site is validated like a small footprint. */
const EVENT_SITE_FOOTPRINT_PX = 32;

/** The placement owner's own rule: buildable ground, clear of every structure. */
function isLegalCampSite(state: WorldState, x: number, y: number, footprintPx = EVENT_SITE_FOOTPRINT_PX): boolean {
  if (state.worldMap
    && !isFootprintOnBuildableTerrain(state, footprintPx, footprintPx, x, y)) return false;
  return !overlapsAnyBuilding(state.buildings, footprintPx, footprintPx, x, y);
}

/**
 * The one legal-prop-point owner for off-cycle spawns (yearly events): buildable ground, clear of
 * every structure. Callers supply their own seeded stream so the draw stays in their sequence.
 */
export function randomLegalPropPoint(
  state: WorldState,
  random: () => number,
  footprintPx = EVENT_SITE_FOOTPRINT_PX,
  attempts = 16,
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const x = random() * state.width;
    const y = random() * state.height;
    if (isLegalCampSite(state, x, y, footprintPx)) return { x, y };
  }
  return null;
}

export function pickSite(
  state: WorldState,
  anchor: { x: number; y: number },
  minDist: number,
  maxDist: number,
  avoid: { x: number; y: number }[] = [],
  options?: { margin?: number; separation?: number; bestOf?: number },
): { x: number; y: number } {
  const margin = options?.margin ?? 80;
  const separation = options?.separation ?? minDist * 0.6;
  const attempts = options?.bestOf && options.bestOf > 1 ? options.bestOf : 40;
  let best: { x: number; y: number } | null = null;
  let bestNearest = -1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = getSimRng('groupEvents')() * Math.PI * 2;
    const dist = minDist + getSimRng('groupEvents')() * (maxDist - minDist);
    const x = Math.max(margin, Math.min(state.width - margin, anchor.x + deterministicCos(angle) * dist));
    const y = Math.max(margin, Math.min(state.height - margin, anchor.y + deterministicSin(angle) * dist));
    if (!isLegalCampSite(state, x, y)) continue;
    const nearest = avoid.reduce((closest, p) => Math.min(closest, Math.hypot(p.x - x, p.y - y)), Infinity);
    if (nearest >= separation) return { x, y };
    if (nearest > bestNearest) {
      bestNearest = nearest;
      best = { x, y };
    }
  }
  if (best) return best;
  // No random draw was legal (flooded shore, crowded ring): widen to the nearest legal ground rather
  // than leaving the camp in a lake or on a house.
  let nearestSite: { x: number; y: number } | null = null;
  let nearestDist = Infinity;
  for (let y = margin; y <= state.height - margin; y += PATH_CELL) {
    for (let x = margin; x <= state.width - margin; x += PATH_CELL) {
      const distance = Math.hypot(x - anchor.x, y - anchor.y);
      if (distance < minDist || distance >= nearestDist || !isLegalCampSite(state, x, y)) continue;
      nearestSite = { x, y };
      nearestDist = distance;
    }
  }
  return nearestSite ?? {
    x: Math.max(margin, Math.min(state.width - margin, anchor.x + minDist)),
    y: Math.max(margin, Math.min(state.height - margin, anchor.y)),
  };
}

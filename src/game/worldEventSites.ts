import type { WorldState } from './gameTypes';
import { getSimRng } from './simRng';

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
    const x = Math.max(margin, Math.min(state.width - margin, anchor.x + Math.cos(angle) * dist));
    const y = Math.max(margin, Math.min(state.height - margin, anchor.y + Math.sin(angle) * dist));
    const nearest = avoid.reduce((closest, p) => Math.min(closest, Math.hypot(p.x - x, p.y - y)), Infinity);
    if (nearest >= separation) return { x, y };
    if (nearest > bestNearest) {
      bestNearest = nearest;
      best = { x, y };
    }
  }
  return best ?? {
    x: Math.max(margin, Math.min(state.width - margin, anchor.x + minDist)),
    y: Math.max(margin, Math.min(state.height - margin, anchor.y)),
  };
}


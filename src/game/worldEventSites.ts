import type { WorldState } from './gameTypes';
import { getSimRng } from './simRng';

export function pickSite(
  state: WorldState,
  anchor: { x: number; y: number },
  minDist: number,
  maxDist: number,
  avoid: { x: number; y: number }[] = []
): { x: number; y: number } {
  const margin = 80;
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = getSimRng('groupEvents')() * Math.PI * 2;
    const dist = minDist + getSimRng('groupEvents')() * (maxDist - minDist);
    const x = Math.max(margin, Math.min(state.width - margin, anchor.x + Math.cos(angle) * dist));
    const y = Math.max(margin, Math.min(state.height - margin, anchor.y + Math.sin(angle) * dist));
    const tooClose = avoid.some((p) => Math.hypot(p.x - x, p.y - y) < minDist * 0.6);
    if (!tooClose) return { x, y };
  }
  return {
    x: Math.max(margin, Math.min(state.width - margin, anchor.x + minDist)),
    y: Math.max(margin, Math.min(state.height - margin, anchor.y)),
  };
}


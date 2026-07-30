import type { RivalSettlement } from './gameTypes';

/** Rival pop syncs from on-map entities — distant camps often show 0 without implying extinction. */
export function formatRivalPopulationLabel(rival: RivalSettlement): string {
  if (rival.population > 0) {
    return `${rival.population} settler${rival.population === 1 ? '' : 's'} on map`;
  }
  return 'Distant camp (war-band off-map)';
}

export function formatRivalRelationshipLabel(rival: RivalSettlement): string {
  const rel = rival.relationship;
  if (rival.population === 0) {
    return `${rel} · abstract faction`;
  }
  return rel;
}
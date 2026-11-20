import type { RivalSettlement } from './gameTypes';

/** Rival population is a strategic count at a distant camp, never a roster of on-map settlers. */
export function formatRivalPopulationLabel(rival: RivalSettlement): string {
  if (rival.population > 0) {
    return `${rival.population} soul${rival.population === 1 ? '' : 's'} at the camp`;
  }
  return 'Camp emptied';
}

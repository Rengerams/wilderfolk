/**
 * Simulation helper utilities: season lookup, tech checks, multipliers, reputation.
 */
import type { WorldState } from './gameTypes';
import { Season } from './gameTypes';
import type { Season as SeasonType } from './gameTypes';

export function getSeason(dayInYear: number): SeasonType {
  if (dayInYear < 90) return Season.Spring;
  if (dayInYear < 180) return Season.Summer;
  if (dayInYear < 270) return Season.Fall;
  return Season.Winter;
}

export function getReproductionMultiplier(season: SeasonType): number {
  switch (season) {
    case Season.Spring:
      return 1.4;
    case Season.Summer:
      return 1.0;
    case Season.Fall:
      return 0.8;
    case Season.Winter:
      return 0.5;
    default:
      return 1.0;
  }
}

export function hasTech(state: WorldState, techId: string): boolean {
  return state.unlockedTechs.includes(techId);
}

export function getMultiplier(state: WorldState, key: string): number {
  let multiplier = 1;
  let add = 0;
  for (const node of state.researchNodes) {
    if (!node.researched) continue;
    for (const effect of node.effects) {
      if (effect.target !== key) continue;
      if (typeof effect.multiplier === 'number') {
        multiplier *= effect.multiplier;
      }
      if (typeof effect.add === 'number') {
        add += effect.add;
      }
    }
  }
  return multiplier + add;
}

export function addReputation(state: WorldState, amount: number): void {
  state.villageReputation = Math.max(0, state.villageReputation + amount);
}

/**
 * Production penalty from pollution.
 * At 0% pollution: 1.0 · At 100% pollution: 0.5.
 * Lives here (not in a layer file) so daily production can import without coupling layers.
 */
export function getPollutionProductionMultiplier(state: WorldState): number {
  return Math.max(0.5, 1 - state.pollutionLevel / 200);
}

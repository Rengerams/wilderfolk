import { Season, WeatherType } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycle';

/** Matches `tickWildlife` grass growth increment. */
export const GRASS_GROWTH_PER_TICK = 2.5;

/** Matches graze bite size in `tickWildlife`. */
export const GRAZE_BITE_ENERGY = 8;

/** Grass patches below this energy can be grazed. */
export const GRASS_GRAZE_MIN_ENERGY = 5;

/** Matches `SPECIES_CONFIG[EntityType.Grass].maxEnergy`. */
export const GRASS_MAX_ENERGY = 100;

/** Same multipliers used by `gameTick` / `tickWildlife`. */
export function getGrassGrowthMultiplier(season: Season, weather: WeatherType): number {
  let base = 1;
  switch (season) {
    case Season.Spring: base = 1.8; break;
    case Season.Summer: base = 1.2; break;
    case Season.Fall: base = 0.6; break;
    case Season.Winter: base = 0.15; break;
  }
  if (weather === WeatherType.Rain) base *= 1.3;
  if (weather === WeatherType.Drought) base *= 0.3;
  if (weather === WeatherType.Snow) base *= 0.5;
  return base;
}

export function getWinterEnergyPenalty(season: Season): number {
  return season === Season.Winter ? 0.4 : 0;
}

/**
 * Grass energy consumed per day to sustain one grazer at metabolic equilibrium.
 * Uses the same bite size and tick cadence as the wildlife sim.
 */
export function grazerGrassEnergyDemandPerDay(
  energyLossPerTick: number,
  grassEnergyGain: number,
  winterPenalty: number,
): number {
  const bitesPerDay = ((energyLossPerTick + winterPenalty) * TICKS_PER_DAY) / grassEnergyGain;
  return bitesPerDay * GRAZE_BITE_ENERGY;
}

/** Metabolism values mirrored from `SPECIES_CONFIG` grazers. */
export const GRAZER_METABOLISM = {
  deer: { energyLossPerTick: 4.2, grassEnergyGain: 55 },
  rabbit: { energyLossPerTick: 2.5, grassEnergyGain: 25 },
  wildkin: { energyLossPerTick: 3, grassEnergyGain: 45 },
} as const;
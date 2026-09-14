import { Season, WeatherType } from './gameTypes';
import { PER_TICK_RATE_SCALE, TICKS_PER_DAY } from './dayCycle';

/**
 * Per-tick grass growth rate. Daily batch applies
 * `GRASS_GROWTH_PER_TICK * grassMult * TICKS_PER_DAY` in `tickGrassDaily`.
 */
export const GRASS_GROWTH_PER_TICK = 2.5;

/** Matches graze bite size when fauna nibble grass. */
export const GRAZE_BITE_ENERGY = 8;

/** Grass patches at or above this energy can be grazed. */
export const GRASS_GRAZE_MIN_ENERGY = 5;

/** Matches `SPECIES_CONFIG[EntityType.Grass].maxEnergy`. */
export const GRASS_MAX_ENERGY = 100;

/** Seasonal/weather multiplier for `tickGrassDaily` growth. */
export function getGrassGrowthMultiplier(season: Season, weather: WeatherType): number {
  let base = 1.0;
  switch (season) {
    case Season.Spring:
      base = 1.8;
      break;
    case Season.Summer:
      base = 1.2;
      break;
    case Season.Fall:
      base = 0.7;
      break;
    // Was 0.15 — winter grass crash wiped grazers by mid-year with no player hunting.
    case Season.Winter:
      base = 0.35;
      break;
  }

  if (weather === WeatherType.Rain) base *= 1.3;
  if (weather === WeatherType.Drought) base *= 0.3;
  if (weather === WeatherType.Snow) base *= 0.55;

  return base;
}

/**
 * Weather multiplier for farm/greenhouse food output.
 * Drought cuts harvests; rain is a small boon; storms rattle the fields.
 * `droughtResist` is the compound `drought_resist` research multiplier
 * (Irrigation, agriculture_3) applied to the drought penalty only, so the
 * advertised "farms work 50% better in drought" turns 0.5 into 0.75.
 */
export function getWeatherFarmMultiplier(weather: WeatherType, droughtResist = 1): number {
  switch (weather) {
    case WeatherType.Rain:
      return 1.15;
    case WeatherType.Storm:
      return 0.9;
    case WeatherType.Drought:
      return 0.5 * droughtResist;
    default:
      return 1.0; // Clear, Fog, Snow
  }
}

export function getWinterEnergyPenalty(season: Season): number {
  // Softer winter burn so fauna survive a full cold season if grass remains.
  return season === Season.Winter ? 0.22 * PER_TICK_RATE_SCALE : 0;
}

/**
 * Grass energy consumed per day to sustain one grazer at metabolic equilibrium.
 * Uses the same bite size and tick cadence as the wildlife simulation.
 */
export function grazerGrassEnergyDemandPerDay(
  energyLossPerTick: number,
  grassEnergyGain: number,
  winterPenalty = 0,
): number {
  const safeGain = Math.max(1, grassEnergyGain);
  const bitesPerDay = ((energyLossPerTick + winterPenalty) * TICKS_PER_DAY) / safeGain;
  return bitesPerDay * GRAZE_BITE_ENERGY;
}

/** Metabolism values mirrored from `SPECIES_CONFIG` grazers (already PER_TICK_RATE_SCALE). */
export const GRAZER_METABOLISM = {
  deer: { energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE, grassEnergyGain: 55 },
  rabbit: { energyLossPerTick: 2.5 * PER_TICK_RATE_SCALE, grassEnergyGain: 25 },
  wildkin: { energyLossPerTick: 3.0 * PER_TICK_RATE_SCALE, grassEnergyGain: 45 },
} as const;

export type GrazerType = keyof typeof GRAZER_METABOLISM;

/** Convenience helper calculating daily grass demand for a specific grazer species. */
export function getGrazerDailyDemand(type: GrazerType, season: Season): number {
  const meta = GRAZER_METABOLISM[type];
  const penalty = getWinterEnergyPenalty(season);
  return grazerGrassEnergyDemandPerDay(meta.energyLossPerTick, meta.grassEnergyGain, penalty);
}
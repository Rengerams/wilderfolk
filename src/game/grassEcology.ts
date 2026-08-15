import { Season, WeatherType } from './gameTypes';
import { PER_TICK_RATE_SCALE, TICKS_PER_DAY } from './dayCycle';

/**
 * Per-tick grass growth rate. Daily batch applies
 * `GRASS_GROWTH_PER_TICK * grassMult * TICKS_PER_DAY` in `tickGrassDaily`.
 */
export const GRASS_GROWTH_PER_TICK = 2.5;

/** Matches graze bite size when fauna nibble grass. */
export const GRAZE_BITE_ENERGY = 8;

/** Grass patches below this energy can be grazed. */
export const GRASS_GRAZE_MIN_ENERGY = 5;

/** Matches `SPECIES_CONFIG[EntityType.Grass].maxEnergy`. */
export const GRASS_MAX_ENERGY = 100;

/** Seasonal/weather multiplier for `tickGrassDaily` growth. */
export function getGrassGrowthMultiplier(season: Season, weather: WeatherType): number {
  let base = 1;
  switch (season) {
    case Season.Spring: base = 1.8; break;
    case Season.Summer: base = 1.2; break;
    case Season.Fall: base = 0.7; break;
    // Was 0.15 — winter grass crash wiped grazers by mid-year with no player hunting.
    case Season.Winter: base = 0.35; break;
  }
  if (weather === WeatherType.Rain) base *= 1.3;
  if (weather === WeatherType.Drought) base *= 0.3;
  if (weather === WeatherType.Snow) base *= 0.55;
  return base;
}

/**
 * Weather multiplier for farm/greenhouse food output (Phase 3.4).
 * Drought cuts harvests; rain is a small boon; storms rattle the fields a
 * little. Snow leaves farms alone (winter balance handled by season elsewhere).
 */
export function getWeatherFarmMultiplier(weather: WeatherType): number {
  switch (weather) {
    case WeatherType.Rain: return 1.15;
    case WeatherType.Storm: return 0.9;
    case WeatherType.Drought: return 0.5;
    default: return 1; // Clear · Fog · Snow
  }
}

export function getWinterEnergyPenalty(season: Season): number {
  // Softer winter burn so fauna survive a full cold season if grass remains.
  return season === Season.Winter ? 0.22 * PER_TICK_RATE_SCALE : 0;
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

/** Metabolism values mirrored from `SPECIES_CONFIG` grazers (already PER_TICK_RATE_SCALE). */
export const GRAZER_METABOLISM = {
  deer: { energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE, grassEnergyGain: 55 },
  rabbit: { energyLossPerTick: 2.5 * PER_TICK_RATE_SCALE, grassEnergyGain: 25 },
  wildkin: { energyLossPerTick: 3 * PER_TICK_RATE_SCALE, grassEnergyGain: 45 },
} as const;
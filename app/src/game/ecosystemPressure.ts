import { EntityType, Season, WeatherType, type WorldState } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycle';
import {
  GRASS_GROWTH_PER_TICK,
  GRASS_MAX_ENERGY,
  GRAZER_METABOLISM,
  getGrassGrowthMultiplier,
  getWinterEnergyPenalty,
  grazerGrassEnergyDemandPerDay,
} from './grassEcology';

export type GrazingPressureLevel = 'stable' | 'caution' | 'critical';

/** Deer:grass ratios aligned across level, advice, and stable-branch warnings. */
const DEER_GRASS_CAUTION_RATIO = 5 / 120;
const DEER_GRASS_CRITICAL_RATIO = 8 / 80;

export interface GrazingPressureReport {
  level: GrazingPressureLevel;
  deerCount: number;
  grassCount: number;
  rabbitCount: number;
  wolfCount: number;
  wildkinCount: number;
  growingGrassCount: number;
  /** Deer grazing demand vs grass recovery (1.0 = balanced). */
  pressureRatio: number;
  /** Grass energy regained per colony day (same units as grazingDemandPerDay). */
  grassRecoveryPerDay: number;
  /** Grass energy consumed per colony day to sustain current grazers (bite-energy units). */
  grazingDemandPerDay: number;
  headline: string;
  advice: string;
}

function countGrowingGrass(state: WorldState): number {
  let growingGrassCount = 0;
  for (const entity of state.entities) {
    if (!entity.alive || entity.type !== EntityType.Grass) continue;
    if (entity.energy < GRASS_MAX_ENERGY) growingGrassCount++;
  }
  return growingGrassCount;
}

/**
 * Estimates whether deer (and other grazers) are outpacing grass regrowth.
 * Demand and recovery are both in grass bite-energy per colony day.
 */
export function getGrazingPressureReport(state: WorldState): GrazingPressureReport {
  const counts = state.wildlifeCounts;
  const deerCount = counts.deer;
  const rabbitCount = counts.rabbits;
  const wolfCount = counts.wolves;
  const wildkinCount = counts.wildkin;

  const grassCount = counts.grass;
  const growingGrassCount = countGrowingGrass(state);
  const grassMult = getGrassGrowthMultiplier(state.season, state.weather);
  const winterPenalty = getWinterEnergyPenalty(state.season);
  const grassRecoveryPerDay = growingGrassCount * GRASS_GROWTH_PER_TICK * grassMult * TICKS_PER_DAY;

  const grazingDemandPerDay =
    grazerGrassEnergyDemandPerDay(GRAZER_METABOLISM.deer.energyLossPerTick, GRAZER_METABOLISM.deer.grassEnergyGain, winterPenalty) * deerCount
    + grazerGrassEnergyDemandPerDay(GRAZER_METABOLISM.rabbit.energyLossPerTick, GRAZER_METABOLISM.rabbit.grassEnergyGain, winterPenalty) * rabbitCount
    + grazerGrassEnergyDemandPerDay(GRAZER_METABOLISM.wildkin.energyLossPerTick, GRAZER_METABOLISM.wildkin.grassEnergyGain, winterPenalty) * wildkinCount;

  const pressureRatio = grazingDemandPerDay / Math.max(grassRecoveryPerDay, GRASS_GROWTH_PER_TICK * TICKS_PER_DAY);

  const deerGrassRatio = deerCount / Math.max(grassCount, 1);
  const pastureTight = deerGrassRatio > DEER_GRASS_CAUTION_RATIO;
  const pastureCritical = deerGrassRatio > DEER_GRASS_CRITICAL_RATIO;

  const allGrassMaxed = grassCount > 0 && growingGrassCount === 0;

  let level: GrazingPressureLevel = 'stable';
  if (pressureRatio >= 1.35 || (deerCount >= 8 && pastureCritical)) {
    level = 'critical';
  } else if (pressureRatio >= 0.95 || (deerCount >= 5 && pastureTight)) {
    level = 'caution';
  }

  // All grass at max energy — zero recovery is saturation, not overgrazing.
  if (allGrassMaxed && level === 'critical') {
    level = pastureTight ? 'caution' : 'stable';
  }

  // Winter/drought recovery dips should not read as overgrazing when pasture patches are abundant.
  if (!pastureTight && deerCount < 8) {
    level = 'stable';
  }

  const seasonNote =
    state.season === Season.Winter
      ? 'Grass barely grows in winter — herds shrink or starve.'
      : state.weather === WeatherType.Drought
        ? 'Drought is slowing grass recovery.'
        : '';

  const headlines: Record<GrazingPressureLevel, string> = {
    stable: 'Grazing pressure is within recovery limits.',
    caution: 'Deer are grazing faster than grass can regrow.',
    critical: 'The valley is overgrazed — grass cannot keep up with deer.',
  };

  const adviceParts: string[] = [];
  if (level !== 'stable') {
    if (pastureTight || deerCount >= 8) {
      if (wolfCount >= 2) {
        adviceParts.push('Let wolves hunt — predators keep deer numbers in check.');
      } else {
        adviceParts.push('A healthy wolf pack is your best balance tool.');
      }
    }
    if (pastureCritical) {
      adviceParts.push('Too many deer for available pasture — expect die-offs soon.');
    }
    if (seasonNote) adviceParts.push(seasonNote);
  } else if (wolfCount === 0 && deerCount >= 5 && pastureTight && !pastureCritical) {
    adviceParts.push('No wolves yet — if deer multiply, grass will thin out.');
  }

  return {
    level,
    deerCount,
    grassCount,
    rabbitCount,
    wolfCount,
    wildkinCount,
    growingGrassCount,
    pressureRatio,
    grassRecoveryPerDay: Math.round(grassRecoveryPerDay),
    grazingDemandPerDay: Math.round(grazingDemandPerDay),
    headline: headlines[level],
    advice: adviceParts.join(' ') || 'Watch deer and grass bars — both should stay in a healthy band.',
  };
}
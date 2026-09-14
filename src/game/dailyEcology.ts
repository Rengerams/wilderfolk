import type { Building, WildlifeCounts, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import { hasTech } from './simHelpers';

const INDUSTRIAL_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>([
  BuildingType.Blacksmith,
  BuildingType.Mill,
  BuildingType.Workshop,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.LumberMill,
]);

const IDEAL_WILDLIFE = 80;

/** Ecosystem health a completed Wildlife Preserve adds (advertised in the build panel). */
export const PRESERVE_HEALTH_BONUS = 4;

/** The wildlife tally plus the settler count the ecosystem-health score reads. */
export type EcosystemCounts = WildlifeCounts & { humans: number };

export interface EcosystemMetrics {
  /** Completed player (non-rival) buildings — the town footprint. */
  playerCompletedBuildings: number;
  buildingImpact: number;
  /** Completed industrial buildings of any faction, before the forestry multiplier. */
  industrialCount: number;
  pollutionLevel: number;
  pollutionPenalty: number;
  preserveCount: number;
  preserveBonus: number;
  /** Rabbits + deer + wolves + foxes + werewolves + wildkin — every species the score counts. */
  totalWildlife: number;
  wildlifeRatio: number;
  wildlifeBonus: number;
  /** Clamped to 0-100 but not rounded; `tickEcosystemMetrics` stores the rounded value. */
  health: number;
}

/**
 * Calculates the Shannon-Wiener biodiversity index (H') for the wildlife population.
 * H' = -sum(p_i * ln(p_i)) where p_i is the relative abundance of each species.
 */
export function calculateBiodiversityIndex(counts: PopulationCounts): number {
  const speciesCounts = [
    counts.rabbits,
    counts.deer,
    counts.wolves,
    counts.foxes,
    counts.werewolves,
    counts.wildkin,
  ];

  let total = 0;
  for (let i = 0; i < speciesCounts.length; i++) {
    total += speciesCounts[i];
  }

  if (total === 0) return 0;

  let entropy = 0;
  for (let i = 0; i < speciesCounts.length; i++) {
    const count = speciesCounts[i];
    if (count > 0) {
      const proportion = count / total;
      entropy -= proportion * Math.log(proportion);
    }
  }

  return entropy;
}

/**
 * The single definition of the ecosystem-health score. `tickEcosystemMetrics`
 * writes it to state and `ecoBreakdown` explains it, so the two cannot drift.
 */
export function calculateEcosystemMetrics(
  state: WorldState,
  counts: EcosystemCounts,
  buildings: Building[],
): EcosystemMetrics {
  let industrialCount = 0;
  let playerCompletedBuildings = 0;
  let preserveCount = 0;

  // Single-pass building scan
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building.completed) continue;

    if (building.faction !== 'rival') {
      playerCompletedBuildings++;
    }

    if (INDUSTRIAL_BUILDING_TYPES.has(building.type)) {
      industrialCount++;
    }

    if (building.type === BuildingType.WildlifePreserve) {
      preserveCount++;
    }
  }

  // Calculate Pollution
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1.0;
  const rawPollution = industrialCount * 4 * pollutionMult + counts.humans / 3;
  const pollutionLevel = Math.max(0, Math.min(100, Math.floor(rawPollution)));

  // Calculate Total Wildlife & Ratio
  const totalWildlife =
    counts.rabbits +
    counts.deer +
    counts.wolves +
    counts.foxes +
    counts.werewolves +
    counts.wildkin;
  const wildlifeRatio = Math.min(1.0, totalWildlife / IDEAL_WILDLIFE);

  // Calculate Ecosystem Health (0 - 100)
  const buildingImpact = playerCompletedBuildings * 2;
  const pollutionPenalty = Math.floor(pollutionLevel / 2);
  const preserveBonus = preserveCount * PRESERVE_HEALTH_BONUS;
  const wildlifeBonus = wildlifeRatio * 30 - 20;

  const rawEcoHealth = 100 - buildingImpact - pollutionPenalty + preserveBonus + wildlifeBonus;
  const health = Math.max(0, Math.min(100, rawEcoHealth));

  return {
    playerCompletedBuildings,
    buildingImpact,
    industrialCount,
    pollutionLevel,
    pollutionPenalty,
    preserveCount,
    preserveBonus,
    totalWildlife,
    wildlifeRatio,
    wildlifeBonus,
    health,
  };
}

/**
 * Refreshes daily-only ecology indexes before the valley stage consumes them.
 * The daily layer retains ownership of the call order and cadence.
 */
export function tickEcosystemMetrics(
  state: WorldState,
  counts: PopulationCounts,
  buildings: Building[],
): void {
  const metrics = calculateEcosystemMetrics(state, counts, buildings);
  state.pollutionLevel = metrics.pollutionLevel;
  state.ecosystemHealth = Math.round(metrics.health);

  // Calculate Biodiversity
  state.biodiversityIndex = calculateBiodiversityIndex(counts);
}
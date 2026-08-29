import type { Building, WorldState } from './gameTypes';
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
 * Refreshes daily-only ecology indexes before the valley stage consumes them.
 * The daily layer retains ownership of the call order and cadence.
 */
export function tickEcosystemMetrics(
  state: WorldState,
  counts: PopulationCounts,
  buildings: Building[],
): void {
  let industrialCount = 0;
  let playerCompletedBuildings = 0;
  let preserveBonus = 0;

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
      preserveBonus += 4;
    }
  }

  // Calculate Pollution
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1.0;
  const rawPollution = industrialCount * 4 * pollutionMult + counts.humans / 3;
  state.pollutionLevel = Math.max(0, Math.min(100, Math.floor(rawPollution)));

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
  const pollutionPenalty = Math.floor(state.pollutionLevel / 2);
  const wildlifeImpact = wildlifeRatio * 30 - 20;

  const rawEcoHealth = 100 - buildingImpact - pollutionPenalty + preserveBonus + wildlifeImpact;
  state.ecosystemHealth = Math.max(0, Math.min(100, Math.round(rawEcoHealth)));

  // Calculate Biodiversity
  state.biodiversityIndex = calculateBiodiversityIndex(counts);
}
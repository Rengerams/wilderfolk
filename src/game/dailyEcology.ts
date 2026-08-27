import type { Building, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import { hasTech } from './simHelpers';

const INDUSTRIAL_BUILDING_TYPES: BuildingType[] = [
  BuildingType.Blacksmith,
  BuildingType.Mill,
  BuildingType.Workshop,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.LumberMill,
];

const IDEAL_WILDLIFE = 80;

export function calculateBiodiversityIndex(counts: PopulationCounts): number {
  const species = [counts.rabbits, counts.deer, counts.wolves, counts.foxes]
    .filter((count) => count > 0);
  const total = species.reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;

  return species.reduce((sum, count) => {
    const proportion = count / total;
    return sum - proportion * Math.log(proportion);
  }, 0);
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
  for (const building of buildings) {
    if (!building.completed) continue;
    if (building.faction !== 'rival') playerCompletedBuildings++;
    if (INDUSTRIAL_BUILDING_TYPES.includes(building.type)) industrialCount++;
  }
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1;
  state.pollutionLevel = Math.min(
    100,
    Math.floor(industrialCount * 4 * pollutionMult + counts.humans / 3),
  );

  const totalWildlife = counts.rabbits + counts.deer + counts.wolves + counts.foxes;
  const wildlifeRatio = Math.min(1, totalWildlife / IDEAL_WILDLIFE);
  const buildingImpact = playerCompletedBuildings * 2;
  const pollutionPenalty = Math.floor(state.pollutionLevel / 2);
  let preserveBonus = 0;
  for (const building of state.buildings) {
    if (building.completed && building.type === BuildingType.WildlifePreserve) preserveBonus += 4;
  }
  state.ecosystemHealth = Math.max(
    0,
    Math.min(100, 100 - buildingImpact - pollutionPenalty + preserveBonus + (wildlifeRatio * 30 - 20)),
  );
  state.biodiversityIndex = calculateBiodiversityIndex(counts);
}

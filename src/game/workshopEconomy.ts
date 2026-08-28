import type { Building, WorldState } from './gameTypes';
import { getWorkshopRecipe } from './workshops';
import { getWorkerSkillMultiplier } from './skills';
import { ensureAdjacencyIndex, getAdjacencyMultiplierFromIndex } from './adjacencyIndex';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import { getMultiplier } from './simHelpers';

/** Estimate the current gold output of a workshop without mutating authoritative state. */
export function estimateWorkshopGold(state: WorldState, building: Building): number {
  const recipe = getWorkshopRecipe(building.workshopRecipeId);
  const workers = building.occupants.length;
  if (workers === 0) return recipe.baseGold;

  const levelMultiplier = building.level || 1;
  const terrainMultiplier = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMultiplier = getAdjacencyMultiplierFromIndex(ensureAdjacencyIndex(state), building);
  const skillMultiplier = getWorkerSkillMultiplier(state, building);
  const festivalMultiplier = state.festival?.active ? 1.5 : 1;
  const goldMultiplier = getMultiplier(state, 'gold_production');
  const globalEfficiencyMultiplier = getMultiplier(state, 'global_efficiency');
  const outputMultiplier =
    (1 + workers * 0.5)
    * levelMultiplier
    * terrainMultiplier
    * adjacencyMultiplier
    * festivalMultiplier
    * skillMultiplier
    * goldMultiplier
    * globalEfficiencyMultiplier;

  return Math.max(1, Math.floor(recipe.baseGold * outputMultiplier));
}

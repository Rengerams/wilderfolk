import type { Building, WorldState } from './gameTypes';
import { getWorkshopRecipe } from './workshops';
import { getWorkerSkillMultiplier } from './skills';
import { ensureAdjacencyIndex, getAdjacencyMultiplierFromIndex } from './adjacencyIndex';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import { getMultiplier } from './simHelpers';

const WORKSHOP_ECONOMY_CONFIG = {
  FESTIVAL_OUTPUT_MULTIPLIER: 1.5,
  WORKER_SCALING_PER_HEAD: 0.5,
  BASE_WORKER_OUTPUT_FACTOR: 1.0,
} as const;

export interface EstimateWorkshopGoldOptions {
  /**
   * If true, estimates the revenue assuming 1 standard worker is present.
   * Useful for inspector tooltips and recipe selection previews on unstaffed buildings.
   */
  previewUnstaffed?: boolean;
}

/**
 * Estimates the daily gold output of a workshop without mutating authoritative state.
 * Returns 0 if the building is incomplete or unstaffed (unless `previewUnstaffed` is enabled).
 */
export function estimateWorkshopGold(
  state: WorldState,
  building: Building,
  options: EstimateWorkshopGoldOptions = {},
): number {
  if (!building.completed || building.faction === 'rival') {
    return 0;
  }

  const recipe = getWorkshopRecipe(building.workshopRecipeId);
  if (!recipe || recipe.baseGold <= 0) {
    return 0;
  }

  const actualWorkers = building.occupants.length;
  if (actualWorkers === 0 && !options.previewUnstaffed) {
    return 0;
  }

  const effectiveWorkers = actualWorkers === 0 && options.previewUnstaffed ? 1 : actualWorkers;

  const levelMultiplier = Math.max(1, building.level || 1);
  const terrainMultiplier = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMultiplier = getAdjacencyMultiplierFromIndex(ensureAdjacencyIndex(state), building);
  const skillMultiplier = actualWorkers > 0 ? getWorkerSkillMultiplier(state, building) : 1.0;
  const festivalMultiplier = state.festival?.active
    ? WORKSHOP_ECONOMY_CONFIG.FESTIVAL_OUTPUT_MULTIPLIER
    : 1.0;
  const goldMultiplier = getMultiplier(state, 'gold_production');
  const globalEfficiencyMultiplier = getMultiplier(state, 'global_efficiency');

  const laborScale =
    WORKSHOP_ECONOMY_CONFIG.BASE_WORKER_OUTPUT_FACTOR +
    effectiveWorkers * WORKSHOP_ECONOMY_CONFIG.WORKER_SCALING_PER_HEAD;

  const combinedMultiplier =
    laborScale *
    levelMultiplier *
    terrainMultiplier *
    adjacencyMultiplier *
    festivalMultiplier *
    skillMultiplier *
    goldMultiplier *
    globalEfficiencyMultiplier;

  return Math.max(1, Math.floor(recipe.baseGold * combinedMultiplier));
}
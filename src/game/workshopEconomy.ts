import type { Building, WorldState } from './gameTypes';
import { getWorkshopRecipe } from './workshops';
import { getWorkerSkillMultiplier } from './skills';
import { ensureAdjacencyIndex, getAdjacencyMultiplierFromIndex } from './adjacencyIndex';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import { getMultiplier } from './simHelpers';
import { isPlayerHuman } from './playerHuman';
import {
  getScheduleLastWorkedHours,
  getScheduleProductivityMultiplier,
  getWorkplacePresenceShare,
} from './scheduleFatigue';
import {
  getWorkHourProductionMultiplier,
  getWorkSchedule,
  getWorkScheduleHours,
} from './workSchedule';
import { getTownHallGovernanceEfficiency } from './townHall';

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

  // Production counts a workshop's workers by their live work assignment, not by occupancy
  // (`dailyBuildingEconomy.tickBuildingProduction` keys `buildingWorkerStats` on
  // `worker.homeBuildingId`), so the estimate has to use the same rule or it predicts output for a
  // workshop that is standing idle (`LIVE-FINDINGS-STATUS.md`, L6).
  const assignedWorkers = state.entities.filter(
    (entity) => entity.alive && isPlayerHuman(entity) && entity.homeBuildingId === building.id,
  );
  const actualWorkers = assignedWorkers.length;
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
  // The three terms the estimate used to omit while production applied them every cycle
  // (`dailyBuildingEconomy.ts:299-305` for the state-wide pair, `:340-347` for fatigue): the
  // schedule-fatigue average over the assigned crew, the attendance share, and the Town Hall's
  // governance efficiency, which production folds into its `globalEff`
  // (`LIVE-FINDINGS-STATUS.md`, L6).
  const fatigueMultiplier = actualWorkers > 0
    ? assignedWorkers.reduce((sum, worker) => sum + getScheduleProductivityMultiplier(worker), 0) / actualWorkers
    : 1.0;
  // Attendance through the same `getWorkplacePresenceShare` rule production uses, so the estimate
  // cannot drift from real output. An unstaffed preview (`previewUnstaffed`) and a world that has no
  // settled day yet both report a full shift, which keeps a standing workshop from looking idle.
  const schedule = getWorkSchedule(state);
  const workedHours = actualWorkers > 0
    ? assignedWorkers.reduce((sum, worker) => sum + getScheduleLastWorkedHours(worker), 0) / actualWorkers
    : 0;
  const presenceMultiplier = getWorkplacePresenceShare(
    workedHours,
    actualWorkers,
    getWorkScheduleHours(schedule),
    options.previewUnstaffed === true || assignedWorkers.some((worker) => worker.scheduleLastWorkedHours != null),
  );
  const workHourMultiplier = getWorkHourProductionMultiplier(getWorkScheduleHours(schedule));
  const governanceMultiplier = getTownHallGovernanceEfficiency(state, state.buildings);

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
    globalEfficiencyMultiplier *
    fatigueMultiplier *
    workHourMultiplier *
    presenceMultiplier *
    governanceMultiplier;

  return Math.max(1, Math.floor(recipe.baseGold * combinedMultiplier));
}
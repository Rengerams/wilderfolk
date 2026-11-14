import type { Building, WorldState } from './gameTypes';
import { getWorkshopRecipe } from './workshops';
import { getWorkerSkillMultiplier } from './skills';
import { ensureAdjacencyIndex, getAdjacencyMultiplierFromIndex } from './adjacencyIndex';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import { getMultiplier } from './simHelpers';
import { isPlayerHuman } from './playerHuman';
import { getHumanNeedsWorkMultiplier } from './simulation/humanPhysiology';
import {
  getScheduleProductivityMultiplier,
  getWorkdayAttendance,
  getWorkplacePresenceShare,
} from './scheduleFatigue';
import { TICKS_PER_HOUR } from './dayCycle';
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

  // Production counts a workshop's crew by live work assignment and pays only the attendance it
  // verified, so the estimate reads the same owner for the same day.
  const assignedWorkers = state.entities.filter(
    (entity) => entity.alive && isPlayerHuman(entity) && entity.workerBuildingId === building.id,
  );
  const attendingWorkers = assignedWorkers
    .map((worker) => ({ worker, hours: getWorkdayAttendance(worker).ticks / TICKS_PER_HOUR }))
    .filter((entry) => entry.hours > 0);
  const actualWorkers = attendingWorkers.length;
  if (actualWorkers === 0 && !options.previewUnstaffed) {
    return 0;
  }

  const effectiveWorkers = actualWorkers === 0 && options.previewUnstaffed ? 1 : actualWorkers;

  const levelMultiplier = Math.max(1, building.level || 1);
  const terrainMultiplier = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMultiplier = getAdjacencyMultiplierFromIndex(ensureAdjacencyIndex(state), building);
  // Same rule as production: only the workers who attended this shift price the crew's skill.
  const workedIds = new Set(attendingWorkers.map((entry) => entry.worker.id));
  const skillMultiplier = actualWorkers > 0
    ? getWorkerSkillMultiplier(state, building, undefined, 'production', workedIds)
    : 1.0;
  const festivalMultiplier = state.festival?.active
    ? WORKSHOP_ECONOMY_CONFIG.FESTIVAL_OUTPUT_MULTIPLIER
    : 1.0;
  const goldMultiplier = getMultiplier(state, 'gold_production');
  const globalEfficiencyMultiplier = getMultiplier(state, 'global_efficiency');
  // The three terms production applies every cycle that the estimate must also apply: schedule
  // fatigue, attendance share, and the Town Hall's governance efficiency.
  const fatigueMultiplier = actualWorkers > 0
    ? attendingWorkers.reduce((sum, entry) => sum + Math.min(
        getScheduleProductivityMultiplier(entry.worker), getHumanNeedsWorkMultiplier(entry.worker)), 0) / actualWorkers
    : 1.0;
  // Attendance through the same `getWorkplacePresenceShare` rule production uses, so the estimate
  // cannot drift from real output; an unstaffed preview and a world with no settled day report a full shift.
  const schedule = getWorkSchedule(state);
  const workedHours = actualWorkers > 0
    ? attendingWorkers.reduce((sum, entry) => sum + entry.hours, 0) / actualWorkers
    : 0;
  const presenceMultiplier = getWorkplacePresenceShare(
    workedHours,
    actualWorkers,
    getWorkScheduleHours(schedule),
    options.previewUnstaffed === true || actualWorkers > 0,
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
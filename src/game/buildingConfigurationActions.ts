import {
  BUILDING_JOB_TYPES,
  BuildingType,
  HUNTING_SPOT_PREY_OPTIONS,
  WORKSHOP_RECIPES,
  type HuntingSpotPrey,
  type StaffingMode,
  type WorldState,
} from './gameTypes';
import type { MineMode } from './buildings';

const STAFFING_MODES: ReadonlySet<StaffingMode> = new Set(['auto', 'manual']);
const MINE_MODES: ReadonlySet<MineMode> = new Set(['stone', 'iron']);
const VALID_RECIPE_IDS: ReadonlySet<string> = new Set(WORKSHOP_RECIPES.map((r) => r.id));
const VALID_PREY_IDS: ReadonlySet<HuntingSpotPrey> = new Set(
  HUNTING_SPOT_PREY_OPTIONS.map((o) => o.id),
);

function isStaffingMode(mode: unknown): mode is StaffingMode {
  return typeof mode === 'string' && STAFFING_MODES.has(mode as StaffingMode);
}

function isMineMode(mode: unknown): mode is MineMode {
  return typeof mode === 'string' && MINE_MODES.has(mode as MineMode);
}

/** Set a workshop recipe only when the requested recipe and player-owned target are valid. */
export function setWorkshopRecipe(
  originalState: WorldState,
  buildingId: number,
  recipeId: string,
): WorldState {
  if (!VALID_RECIPE_IDS.has(recipeId)) return originalState;

  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.type !== BuildingType.Workshop || building.faction === 'rival') {
    return originalState;
  }

  const state = structuredClone(originalState);
  const mutatedBuilding = state.buildings.find((candidate) => candidate.id === buildingId);
  if (mutatedBuilding) {
    mutatedBuilding.workshopRecipeId = recipeId;
  }

  return state;
}

/** Set automatic/manual staffing only for a player-owned building with a job type. */
export function setBuildingStaffingMode(
  originalState: WorldState,
  buildingId: number,
  mode: StaffingMode,
): WorldState {
  if (!isStaffingMode(mode)) return originalState;

  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.faction === 'rival' || !BUILDING_JOB_TYPES[building.type]) {
    return originalState;
  }

  const state = structuredClone(originalState);
  const mutatedBuilding = state.buildings.find((candidate) => candidate.id === buildingId);
  if (mutatedBuilding) {
    mutatedBuilding.staffingMode = mode;
  }

  return state;
}

/** Set a player-owned Mine to a supported extraction mode. */
export function setMineMode(
  originalState: WorldState,
  buildingId: number,
  mode: MineMode,
): WorldState {
  if (!isMineMode(mode)) return originalState;

  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.type !== BuildingType.Mine || building.faction === 'rival') {
    return originalState;
  }

  const state = structuredClone(originalState);
  const mutatedBuilding = state.buildings.find((candidate) => candidate.id === buildingId);
  if (mutatedBuilding) {
    mutatedBuilding.mineMode = mode;
  }

  return state;
}

/** Set Hunting Spot prey only when the option and player-owned target are valid. */
export function setHuntingSpotPrey(
  originalState: WorldState,
  buildingId: number,
  prey: HuntingSpotPrey,
): WorldState {
  if (!VALID_PREY_IDS.has(prey)) return originalState;

  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.type !== BuildingType.HuntingSpot || building.faction === 'rival') {
    return originalState;
  }

  const state = structuredClone(originalState);
  const mutatedBuilding = state.buildings.find((candidate) => candidate.id === buildingId);
  if (mutatedBuilding) {
    mutatedBuilding.huntingSpotPrey = prey;
  }

  return state;
}
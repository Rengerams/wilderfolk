import {
  BUILDING_JOB_TYPES,
  BuildingType,
  HUNTING_SPOT_PREY_OPTIONS,
  WORKSHOP_RECIPES,
  type HuntingSpotPrey,
  type StaffingMode,
  type WorldState,
  type Building,
} from './gameTypes';
import { MINE_ORES, type MineMode } from './buildings';

const STAFFING_MODES: ReadonlySet<StaffingMode> = new Set(['auto', 'manual']);
const MINE_MODES: ReadonlySet<string> = new Set(MINE_ORES);
const VALID_RECIPE_IDS: ReadonlySet<string> = new Set(WORKSHOP_RECIPES.map((r) => r.id));
const VALID_PREY_IDS: ReadonlySet<HuntingSpotPrey> = new Set(
  HUNTING_SPOT_PREY_OPTIONS.map((o) => o.id),
);

/** Apply one player-owned building edit, preserving the original state when it is a no-op. */
function updatePlayerBuilding(
  state: WorldState,
  buildingId: number,
  accept: (building: Building) => boolean,
  apply: (building: Building) => Building,
): WorldState {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.faction === 'rival' || !accept(building)) return state;
  const updated = apply(building);
  if (updated === building) return state;
  return {
    ...state,
    buildings: state.buildings.map((candidate) => candidate === building ? updated : candidate),
  };
}

/** Validate, then patch one typed building field without duplicating the state rewrite. */
function setValidatedOption<K extends keyof Building>(
  state: WorldState,
  buildingId: number,
  valid: boolean,
  field: K,
  value: Building[K],
  accept: (building: Building) => boolean,
): WorldState {
  if (!valid) return state;
  return updatePlayerBuilding(state, buildingId, accept, (building) =>
    building[field] === value ? building : { ...building, [field]: value });
}

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
  return setValidatedOption(
    originalState,
    buildingId,
    VALID_RECIPE_IDS.has(recipeId),
    'workshopRecipeId',
    recipeId,
    (building) => building.type === BuildingType.Workshop,
  );
}

/** Set automatic/manual staffing only for a player-owned building with a job type. */
export function setBuildingStaffingMode(
  originalState: WorldState,
  buildingId: number,
  mode: StaffingMode,
): WorldState {
  return setValidatedOption(
    originalState,
    buildingId,
    isStaffingMode(mode),
    'staffingMode',
    mode,
    (building) => !!BUILDING_JOB_TYPES[building.type],
  );
}

/** Set a player-owned Mine to a supported extraction mode. */
export function setMineMode(
  originalState: WorldState,
  buildingId: number,
  mode: MineMode,
): WorldState {
  return setValidatedOption(
    originalState,
    buildingId,
    isMineMode(mode),
    'mineMode',
    mode,
    (building) => building.type === BuildingType.Mine,
  );
}

/** Set Hunting Spot prey only when the option and player-owned target are valid. */
export function setHuntingSpotPrey(
  originalState: WorldState,
  buildingId: number,
  prey: HuntingSpotPrey,
): WorldState {
  return setValidatedOption(
    originalState,
    buildingId,
    VALID_PREY_IDS.has(prey),
    'huntingSpotPrey',
    prey,
    (building) => building.type === BuildingType.HuntingSpot,
  );
}
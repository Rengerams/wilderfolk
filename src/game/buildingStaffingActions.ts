import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BUILDING_JOB_TYPES } from './gameTypes';
import { addFloatingText, addNotification } from './simEffects';
import {
  addToConstructionCrew,
  assignMissingWorkers,
  isOnConstructionCrew,
  removeWorkerTransition,
} from './workforce';
import { hasWorkAssignment, isImprisoned, isResidenceBuildingType } from './housingModel';
import { allPlayerHumans, isPlayerHuman } from './playerHuman';

/** 
 * 🚀 OPTIMIZED: Single-pass search for a preferred settler, falling back to the first match.
 */
export function pickAdultSettler(
  state: WorldState,
  preferredHumanId: number | undefined,
  filter: (entity: Entity) => boolean,
): Entity | undefined {
  let fallback: Entity | undefined;

  for (const entity of state.entities) {
    if (!filter(entity)) continue;
    
    if (entity.id === preferredHumanId) {
      return entity; // Early exit: found the exact preferred match
    }
    if (!fallback) {
      fallback = entity; // Remember the first valid fallback
    }
  }
  
  return fallback;
}

/**
 * Why the staffing owner refuses one settler at one building — `null` when it accepts them; the
 * vocabulary the inspector shows, gated in the same order as the command path.
 */
export type WorkerAssignmentRefusal =
  | 'unknown-building'
  | 'unknown-settler'
  | 'rival-building'
  | 'residence-building'
  | 'building-full'
  | 'building-has-no-job'
  | 'automatic-job'
  | 'not-a-settler'
  | 'settler-dead'
  | 'juvenile'
  | 'already-assigned'
  | 'imprisoned'
  | 'on-another-crew';

/**
 * The shared candidate gates, each carrying its reason. `isEligibleStaffCandidate` and
 * The construction assignment command and its diagnostics share this eligibility rule.
 */
function staffCandidateRefusal(entity: Entity): WorkerAssignmentRefusal | null {
  if (!isPlayerHuman(entity)) return 'not-a-settler';
  if (!entity.alive) return 'settler-dead';
  if (entity.isJuvenile) return 'juvenile';
  if (hasWorkAssignment(entity)) return 'already-assigned';
  if (isImprisoned(entity)) return 'imprisoned';
  return null;
}

function isEligibleStaffCandidate(entity: Entity): boolean {
  return staffCandidateRefusal(entity) === null;
}

/**
 * A settler who may be assigned as a builder on `building`: the shared core, minus residents and
 * anyone already on another structure's crew.
 */
function isEligibleBuilderForBuilding(
  state: WorldState,
  entity: Entity,
  building: Building,
): boolean {
  return (
    isEligibleStaffCandidate(entity)
    && !building.occupants.includes(entity.id)
    && !isOnConstructionCrew(state.buildings, entity.id, building.id)
  );
}

function findPlayerBuilding(state: WorldState, buildingId: number): Building | undefined {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  return !building || building.faction === 'rival' ? undefined : building;
}

/** 
 * Mutates state — assign a settler to help build an unfinished structure. 
 * Internal mutating version for assigning construction crews.
 */
function _applyBuilderAssignmentMut(
  state: WorldState,
  buildingId: number,
  preferredHumanId?: number,
  quiet = false,
): WorldState {
  const building = findPlayerBuilding(state, buildingId);
  if (!building || building.completed) return state;

  const config = BUILDING_CONFIGS[building.type];
  if (building.occupants.length >= config.maxOccupants) return state;

  const builder = pickAdultSettler(
    state,
    preferredHumanId,
    (entity) => isEligibleBuilderForBuilding(state, entity, building),
  );

  // addToConstructionCrew re-validates and returns false when it refuses — never
  // announce a builder it rejected.
  if (!builder || !addToConstructionCrew(builder, building)) {
    if (!quiet) addFloatingText(state, building.x, building.y, 'No idle settlers!', '#eab308');
    return state;
  }

  if (!quiet) {
  addFloatingText(state, building.x, building.y - 10, '✓ Builder', '#22c55e', 'brief');
  addNotification(
    state,
    'Builder Assigned',
    `${builder.name || 'Settler'} is helping build ${config.label}`,
    'info',
  );
  }
  return state;
}

/** Assign a settler to help build an unfinished structure (including houses). */
export function assignBuilderToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  return _applyBuilderAssignmentMut(structuredClone(originalState), buildingId, preferredHumanId);
}

/** 
 * Mutates state — assign an idle worker to a building.
 * Internal mutating version to avoid redundant structuredClone in loops.
 */
function _assignIdleWorkerToBuildingMut(
  state: WorldState,
  buildingId: number,
  preferredHumanId?: number,
  quiet = false,
): WorldState {
  const building = findPlayerBuilding(state, buildingId);
  if (!building) return state;

  if (!building.completed) {
    return _applyBuilderAssignmentMut(state, buildingId, preferredHumanId, quiet);
  }

  // Completed jobs belong to automatic workforce reconciliation, not player selection.
  return state;
}

/** Staffing-owner assign entry. Generic command routing lives in buildingActionRouting. */
export function assignStaffWorkerToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
  ownership: 'isolated' | 'owned' = 'isolated',
): WorldState {
  return _assignIdleWorkerToBuildingMut(ownership === 'owned' ? originalState : structuredClone(originalState), buildingId, preferredHumanId);
}

/** Fill every open worker/builder slot on one building (one click). */
export function fillBuildingWorkers(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const preview = originalState.buildings.find((building) => building.id === buildingId);
  // Bulk selection only applies to unfinished construction crews; completed workplaces are
  // staffed by automatic reconciliation.
  if (!preview || preview.faction === 'rival' || preview.completed) return originalState;

  const cap = BUILDING_CONFIGS[preview.type].maxOccupants;
  
  // Keep one clone for the entire construction-crew operation.
  let state = structuredClone(originalState);
  let guard = 0;
  let assigned = 0;
  
  while (guard++ < Math.max(cap * 3, 6)) {
    const building = state.buildings.find((candidate) => candidate.id === buildingId);
    if (!building || building.occupants.length >= cap) break;
    
    const before = building.occupants.length;
    state = _assignIdleWorkerToBuildingMut(state, buildingId, preferredHumanId, true);
    
    const afterBuilding = state.buildings.find((candidate) => candidate.id === buildingId);
    if (!afterBuilding || afterBuilding.occupants.length <= before) break;
    assigned += afterBuilding.occupants.length - before;
    
    preferredHumanId = undefined; // Only prefer the first one, then fill with anyone
  }
  if (assigned > 0) {
    const label = BUILDING_CONFIGS[preview.type].label;
    addFloatingText(state, preview.x, preview.y - 10, `✓ ${assigned} assigned`, '#22c55e', 'brief');
    addNotification(state, 'Workers Assigned', `${assigned} settler${assigned === 1 ? '' : 's'} assigned to ${label}`, 'success');
  }
  return state;
}

export function autoStaffAllWorkers(
  originalState: WorldState,
  ownership: 'isolated' | 'owned' = 'isolated',
): WorldState {
  const state = ownership === 'owned' ? originalState : structuredClone(originalState);
  const countAssigned = () => allPlayerHumans(state.entities).filter((human) => human.workerBuildingId != null).length;
  const before = countAssigned();
  const workplaces = state.buildings.filter((building) =>
    building.faction !== 'rival' && BUILDING_JOB_TYPES[building.type] != null,
  );
  // An explicit colony or Virtual Player request is a staffing event even if
  // the passive workforce fingerprint has not changed yet.
  assignMissingWorkers(allPlayerHumans(state.entities), state.buildings, state, true);
  const after = countAssigned();
  const assigned = after - before;

  if (assigned > 0) {
    addNotification(
      state,
      '⚒️ Auto-staff complete',
      `${assigned} settler${assigned === 1 ? '' : 's'} assigned to job buildings.`,
      'success',
    );
  }
  if (assigned === 0 && workplaces.length > 0) {
    addNotification(
      state,
      '⚒️ Auto-staff enabled',
      'Automatic staffing is active. No additional idle adults were assigned; existing workers may be redistributed.',
      'info',
    );
  }
  return state;
}

/** Staffing-owner remove entry. Generic command routing lives in buildingActionRouting. */
export function removeStaffWorkerFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  const human = state.entities.find((entity) => entity.id === humanId);
  if (!building || !human) return state;
  if (building.completed && isResidenceBuildingType(building.type)) return state;

  // `removeWorkerTransition` clears the settler's real job and crew, so refuse unless this
  // building owns the assignment (workplace link or construction-crew roster).
  if (human.workerBuildingId !== buildingId && !building.occupants.includes(humanId)) return state;

  removeWorkerTransition(human, state.buildings);
  assignMissingWorkers(allPlayerHumans(state.entities), state.buildings, state);
  return state;
}

export function canAssignWorkerToBuilding(state: WorldState, buildingId: number): boolean {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.faction === 'rival') return false;

  if (!building.completed) {
    const cap = BUILDING_CONFIGS[building.type].maxOccupants;
    return building.occupants.length < cap && state.entities.some(
      (entity) => isEligibleBuilderForBuilding(state, entity, building),
    );
  }

  // Completed jobs are staffed only by the workforce owner.
  return false;
}

/**
 * The owner's answer to a player assignment request, read-only. Job posts are automatic; builders
 * may be assigned; a settler already on this building is accepted (`null`).
 */
export function getWorkerAssignmentRefusal(
  state: WorldState,
  buildingId: number,
  humanId: number,
): WorkerAssignmentRefusal | null {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return 'unknown-building';
  if (building.faction === 'rival') return 'rival-building';

  const entity = state.entities.find((candidate) => candidate.id === humanId);
  if (!entity) return 'unknown-settler';

  if (building.completed && isResidenceBuildingType(building.type)) return 'residence-building';
  if (building.completed && BUILDING_JOB_TYPES[building.type]) return 'automatic-job';
  if (building.occupants.includes(entity.id)) return null;

  if (!building.completed) {
    if (building.occupants.length >= BUILDING_CONFIGS[building.type].maxOccupants) return 'building-full';
    const core = staffCandidateRefusal(entity);
    if (core) return core;
    if (isOnConstructionCrew(state.buildings, humanId, building.id)) return 'on-another-crew';
    return null;
  }

  return 'building-has-no-job';
}
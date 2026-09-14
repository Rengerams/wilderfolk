import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BUILDING_JOB_TYPES } from './gameTypes';
import { readSkill } from './skills';
import { addFloatingText, addNotification } from './simEffects';
import {
  addToConstructionCrew,
  assignMissingWorkers,
  assignWorkerTransition,
  completedJobBuildings,
  findOverstaffedDonorBuilding,
  pickWorkerToTransfer,
  removeWorkerTransition,
  transferWorkerBetweenBuildings,
} from './workforce';
import { hasWorkAssignment, isImprisoned, isResidenceBuildingType } from './residencyOccupancy';
import { isPlayerHuman } from './playerHuman';

/** Living player humans — one filter pass when actions need the settler list repeatedly. */
function listPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter(isPlayerHuman);
}

export function isOnConstructionCrew(
  state: WorldState,
  humanId: number,
  exceptBuildingId?: number,
): boolean {
  return state.buildings.some(
    (building) => !building.completed && building.id !== exceptBuildingId && building.occupants.includes(humanId),
  );
}

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

/** One shared definition prevents manual, automatic, and preview paths from drifting apart. */
function isEligibleIdleWorker(entity: Entity, state: WorldState): boolean {
  return (
    isPlayerHuman(entity)
    && entity.alive
    && !entity.isJuvenile
    && !entity.pregnant
    && !hasWorkAssignment(entity)
    && !isImprisoned(entity)
    && !isOnConstructionCrew(state, entity.id)
  );
}

/** 
 * Mutates state — assign a settler to help build an unfinished structure. 
 * Internal mutating version to avoid redundant structuredClone in loops.
 */
function _applyBuilderAssignmentMut(
  state: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.faction === 'rival' || building.completed) return state;

  const config = BUILDING_CONFIGS[building.type];
  if (building.occupants.length >= config.maxOccupants) return state;

  const builder = pickAdultSettler(
    state,
    preferredHumanId,
    (entity) =>
      isPlayerHuman(entity)
      && entity.alive
      && !entity.isJuvenile
      && !entity.pregnant
      && !hasWorkAssignment(entity)
      && !isImprisoned(entity)
      && !building.occupants.includes(entity.id)
      && !isOnConstructionCrew(state, entity.id, buildingId),
  );

  // addToConstructionCrew re-validates and returns false when it refuses — never
  // announce a builder it rejected.
  if (!builder || !addToConstructionCrew(builder, building)) {
    addFloatingText(state, building.x + building.width / 2, building.y, 'No idle settlers!', '#eab308');
    return state;
  }

  addFloatingText(state, building.x, building.y - 10, '✓ Builder', '#22c55e', 'brief');
  addNotification(
    state,
    'Builder Assigned',
    `${builder.name || 'Settler'} is helping build ${config.label}`,
    'info',
  );
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
): WorldState {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.faction === 'rival') return state;

  if (!building.completed) {
    return _applyBuilderAssignmentMut(state, buildingId, preferredHumanId);
  }

  if (isResidenceBuildingType(building.type)) return state;

  const config = BUILDING_CONFIGS[building.type];
  if (building.occupants.length >= config.maxOccupants) return state;

  const job = BUILDING_JOB_TYPES[building.type];
  if (!job) return state;

  // `pickAdultSettler` already returns the first eligible settler when no explicit
  // `preferredHumanId` matches, so manual assignment takes the first eligible settler in
  // entity order. A second "best skill" scan used to sit here, but the guard that reached it
  // (`!idleHuman && preferredHumanId === undefined`) could never be true — the audit's L6 —
  // so the intended highest-skill preference was never applied. Restoring that preference is a
  // player-visible change (manual picks would no longer be first-come); the dead scan and its
  // misleading "O(N) scan for best skill" comment are removed instead.
  let idleHuman = pickAdultSettler(
    state,
    preferredHumanId,
    (entity) => isEligibleIdleWorker(entity, state),
  );

  let reassignedFrom: Building | undefined;
  if (!idleHuman) {
    const humans = listPlayerHumans(state);
    const jobBuildings = completedJobBuildings(state.buildings);
    const donor = findOverstaffedDonorBuilding(jobBuildings, humans, building.id);
    const transfer = donor ? pickWorkerToTransfer(humans, donor, building) : undefined;
    if (transfer && donor) {
      transferWorkerBetweenBuildings(transfer, donor, building);
      idleHuman = transfer;
      reassignedFrom = donor;
    }
  } else {
    // Manual assignment command — the leader may take a workplace here.
    assignWorkerTransition(idleHuman, building);
  }

  if (!idleHuman) {
    addFloatingText(state, building.x + building.width / 2, building.y, 'No idle workers!', '#eab308');
    return state;
  }

  const fromLabel = reassignedFrom ? BUILDING_CONFIGS[reassignedFrom.type].label : undefined;
  addFloatingText(
    state,
    building.x,
    building.y - 10,
    reassignedFrom ? '✓ Reassigned' : '✓ Worker',
    '#22c55e',
    'brief',
  );
  addNotification(
    state,
    reassignedFrom ? 'Worker Reassigned' : 'Worker Assigned',
    reassignedFrom
      ? `${idleHuman.name || 'Settler'}: ${fromLabel} → ${BUILDING_CONFIGS[building.type].label}`
      : `${idleHuman.name || 'Settler'} → ${BUILDING_CONFIGS[building.type].label}`,
    'info',
  );

  return state;
}

/** Staffing-owner assign entry. Generic command routing lives in buildingActionRouting. */
export function assignStaffWorkerToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  return _assignIdleWorkerToBuildingMut(structuredClone(originalState), buildingId, preferredHumanId);
}

/** Fill every open worker/builder slot on one building (one click). */
export function fillBuildingWorkers(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const preview = originalState.buildings.find((building) => building.id === buildingId);
  if (!preview || preview.faction === 'rival') return originalState;

  const cap = BUILDING_CONFIGS[preview.type].maxOccupants;
  
  // 🚀 OPTIMIZED: Clone ONCE to avoid O(N) deep clones in the while loop
  let state = structuredClone(originalState);
  let guard = 0;
  
  while (guard++ < Math.max(cap * 3, 6)) {
    const building = state.buildings.find((candidate) => candidate.id === buildingId);
    if (!building || building.occupants.length >= cap) break;
    
    const before = building.occupants.length;
    state = _assignIdleWorkerToBuildingMut(state, buildingId, preferredHumanId);
    
    const afterBuilding = state.buildings.find((candidate) => candidate.id === buildingId);
    if (!afterBuilding || afterBuilding.occupants.length <= before) break;
    
    preferredHumanId = undefined; // Only prefer the first one, then fill with anyone
  }
  
  return state;
}

export function autoStaffAllWorkers(originalState: WorldState): WorldState {
  const state = structuredClone(originalState);
  const countAssigned = () => listPlayerHumans(state).filter((human) => human.homeBuildingId != null).length;
  const before = countAssigned();
  assignMissingWorkers(listPlayerHumans(state), state.buildings);
  const after = countAssigned();
  const assigned = after - before;

  if (assigned > 0) {
    addNotification(
      state,
      '⚒️ Auto-staff complete',
      `${assigned} settler${assigned === 1 ? '' : 's'} assigned to job buildings.`,
      'success',
    );
  } else {
    addNotification(
      state,
      '⚒️ Auto-staff',
      before > 0
        ? 'All job buildings are already staffed — no idle settlers to assign.'
        : 'No settlers available to assign yet.',
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

  // `removeWorkerTransition` releases the settler from every workplace and crew, so a
  // removal aimed at another building would silently free their real job. Refuse unless
  // the settler actually works here — the workplace link (`homeBuildingId`) or the
  // construction-crew occupant list is the assignment this action removes.
  if (human.homeBuildingId !== buildingId && !building.occupants.includes(humanId)) return state;

  removeWorkerTransition(human, state.buildings);
  assignMissingWorkers(listPlayerHumans(state), state.buildings);
  return state;
}

/** Idle settlers who can be picked for a job building (sorted by job skill). */
export function listAssignableWorkersForBuilding(
  state: WorldState,
  buildingId: number,
  limit = 12,
): Entity[] {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || !building.completed || building.faction === 'rival') return [];

  const job = BUILDING_JOB_TYPES[building.type];
  if (!job) return [];

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return [];

  return state.entities
    .filter((entity) => isEligibleIdleWorker(entity, state))
    .sort((a, b) => readSkill(b, job) - readSkill(a, job))
    .slice(0, limit);
}

export function canAssignWorkerToBuilding(state: WorldState, buildingId: number): boolean {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.faction === 'rival') return false;

  if (!building.completed) {
    const cap = BUILDING_CONFIGS[building.type].maxOccupants;
    return building.occupants.length < cap && state.entities.some(
      (entity) =>
        isPlayerHuman(entity)
        && entity.alive
        && !entity.isJuvenile
        && !entity.pregnant
        && !hasWorkAssignment(entity)
        && !isImprisoned(entity)
        && !building.occupants.includes(entity.id)
        && !isOnConstructionCrew(state, entity.id, building.id),
    );
  }

  if (isResidenceBuildingType(building.type)) return false;

  const job = BUILDING_JOB_TYPES[building.type];
  if (!job) return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return false;

  const humans = listPlayerHumans(state);
  if (humans.some((human) => isEligibleIdleWorker(human, state))) return true;

  return findOverstaffedDonorBuilding(completedJobBuildings(state.buildings), humans, building.id) !== undefined;
}
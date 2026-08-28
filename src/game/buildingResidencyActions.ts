import type { Entity, WorldState } from './gameTypes';
import { addFloatingText, addNotification } from './simEffects';
import { assignMissingWorkers } from './workforce';
import { isPlayerHuman } from './playerHuman';
import {
  assignMissingResidences,
  collectOwnHousehold,
  HUMAN_MOVE_OUT_MIN_AGE,
  isAdultChildAtHome,
  isResidenceBuilding,
  syncResidenceOccupants,
  tryMoveOutOfFamilyHome,
} from './residency';

/** Living player humans — command actions reconcile this list only after a housing change. */
function listPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter(isPlayerHuman);
}

/**
 * Residence changes can affect both household placement and ordinary jobs.
 * Keep the existing reconciliation order in one named command-transition step.
 */
function reconcileAssignmentsAfterResidenceChange(state: WorldState): void {
  const humans = listPlayerHumans(state);
  assignMissingResidences(humans, state.buildings, state.entities);
  assignMissingWorkers(humans, state.buildings);
}

/** Mutates state — re-run automatic housing assignment for a residence. */
function applyResidentAssignment(state: WorldState, buildingId: number): WorldState {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.faction === 'rival' || !isResidenceBuilding(building)) return state;

  reconcileAssignmentsAfterResidenceChange(state);
  return state;
}

/** Re-run automatic housing assignment (settlers pick homes by themselves). */
export function assignResidentToBuilding(originalState: WorldState, buildingId: number): WorldState {
  return applyResidentAssignment(structuredClone(originalState), buildingId);
}

/** Move an adult child (18+) and their own household into a free house. */
export function moveOutOfFamilyHome(originalState: WorldState, humanId: number): WorldState {
  const state = structuredClone(originalState);
  const human = state.entities.find((entity) => entity.id === humanId);
  if (!human || !isPlayerHuman(human)) return state;

  const humans = listPlayerHumans(state);
  const residences = state.buildings.filter(isResidenceBuilding);
  if (!tryMoveOutOfFamilyHome(human, humans, residences)) {
    const reason = !isAdultChildAtHome(human, humans)
      ? `Must be ${HUMAN_MOVE_OUT_MIN_AGE}+ and living with parents`
      : 'No empty house available';
    addFloatingText(state, human.x, human.y - 12, reason, '#ef4444');
    return state;
  }

  syncResidenceOccupants(state.entities, state.buildings);
  reconcileAssignmentsAfterResidenceChange(state);

  const household = collectOwnHousehold(human, humans);
  const who = human.name
    ? `${human.name}${human.surname ? ` ${human.surname}` : ''}`
    : 'Settler';
  const extra = household.length > 1 ? ` (+${household.length - 1} family)` : '';
  addFloatingText(state, human.x, human.y - 12, `${who} moved to own home${extra}`, '#3b82f6');
  addNotification(
    state,
    'New household',
    `${who}${extra} moved into their own home.`,
    'success',
  );
  return state;
}

/** Remove a resident, then immediately restore housing and workforce consistency. */
export function removeResidentFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  const human = state.entities.find((entity) => entity.id === humanId);
  if (!building || !human || human.residenceBuildingId !== buildingId) return state;

  human.residenceBuildingId = undefined;
  syncResidenceOccupants(state.entities, state.buildings);
  reconcileAssignmentsAfterResidenceChange(state);
  return state;
}

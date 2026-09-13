import type { Entity, WorldState } from './gameTypes';
import { assignMissingWorkers } from './workforce';
import { isPlayerHuman } from './playerHuman';
import { isResidenceBuilding } from './residencyOccupancy';
import { assignMissingResidences, syncResidenceOccupants } from './residencyReconciliation';

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

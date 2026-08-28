import type { WorldState } from './gameTypes';
import { isResidenceBuilding, isResidenceBuildingType } from './residency';
import { assignIdleWorkerToBuilding as assignStaffingWorkerToBuilding, removeWorkerFromBuilding as removeStaffingWorkerFromBuilding } from './buildingStaffingActions';
import { assignResidentToBuilding, removeResidentFromBuilding } from './buildingResidencyActions';

/**
 * Compatibility routes for the historical generic building commands. New callers
 * should prefer the explicitly named staffing or residency action instead.
 */
export function assignIdleWorkerToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (building?.completed && isResidenceBuildingType(building.type)) {
    return assignResidentToBuilding(originalState, buildingId);
  }
  return assignStaffingWorkerToBuilding(originalState, buildingId, preferredHumanId);
}

/** Compatibility route for the historical generic worker-removal command. */
export function removeWorkerFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (building?.completed && isResidenceBuilding(building)) {
    return removeResidentFromBuilding(originalState, buildingId, humanId);
  }
  return removeStaffingWorkerFromBuilding(originalState, buildingId, humanId);
}

import type { WorldState } from './gameTypes';
import { isResidenceBuildingType } from './residencyOccupancy';
import {
  assignStaffWorkerToBuilding,
  removeStaffWorkerFromBuilding,
} from './buildingStaffingActions';
import {
  assignResidentToBuilding,
  removeResidentFromBuilding,
} from './buildingResidencyActions';

/**
 * Compatibility routes for the historical generic building commands.
 * Staffing mutations are owned by buildingStaffingActions; residency by buildingResidencyActions.
 */
export function assignIdleWorkerToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);

  // Unfinished buildings always take builders, never residents.
  if (building?.completed && isResidenceBuildingType(building.type)) {
    return assignResidentToBuilding(originalState, buildingId);
  }

  return assignStaffWorkerToBuilding(originalState, buildingId, preferredHumanId);
}

/** Compatibility route for the historical generic worker-removal command. */
export function removeWorkerFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);

  if (building?.completed && isResidenceBuildingType(building.type)) {
    return removeResidentFromBuilding(originalState, buildingId, humanId);
  }

  return removeStaffWorkerFromBuilding(originalState, buildingId, humanId);
}
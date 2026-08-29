import type { WorldState } from './gameTypes';
import { isResidenceBuildingType } from './residency';
import { 
  assignIdleWorkerToBuilding as assignStaffingWorkerToBuilding, 
  removeWorkerFromBuilding as removeStaffingWorkerFromBuilding 
} from './buildingStaffingActions';
import { 
  assignResidentToBuilding, 
  removeResidentFromBuilding 
} from './buildingResidencyActions';

/**
 * Compatibility routes for the historical generic building commands. 
 * New callers should prefer the explicitly named staffing or residency action instead.
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
  
  return assignStaffingWorkerToBuilding(originalState, buildingId, preferredHumanId);
}

/** Compatibility route for the historical generic worker-removal command. */
export function removeWorkerFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  
  // Consistency: use isResidenceBuildingType(building.type) to match the assign function
  if (building?.completed && isResidenceBuildingType(building.type)) {
    return removeResidentFromBuilding(originalState, buildingId, humanId);
  }
  
  return removeStaffingWorkerFromBuilding(originalState, buildingId, humanId);
}
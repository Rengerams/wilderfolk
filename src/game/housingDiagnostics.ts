import type { WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { getResidenceCapacity, isLeaderHouseResidence, isResidenceBuilding, TICKS_PER_DAY } from './dayCycle';
import { isPlayerHuman } from './playerHuman';

export interface HousingDiagnosticsSnapshot {
  tick: number;
  calendarDay: number;
  totalBeds: number;
  occupiedBeds: number;
  openBeds: number;
  residences: number;
  underCapacityResidences: number;
  overCapacityResidences: number;
  unassignedPlayerHumans: number;
  orphanedResidenceReferences: number;
  occupantListMismatches: number;
  leaderHouseBeds: number;
  reservedLeaderHouseBeds: number;
  playerHouseBeds: number;
  housingPressure: 'comfortable' | 'tight' | 'critical';
}

/**
 * Read-only housing truth report. It intentionally reads authoritative WorldState
 * but never repairs occupants or assigns residents; reconciliation remains owned
 * by dayCycle/residence assignment.
 */
export function collectHousingDiagnostics(
  state: WorldState,
  calendarDay = Math.floor(Math.max(0, state.tick) / TICKS_PER_DAY),
): HousingDiagnosticsSnapshot {
  const residences = state.buildings.filter((b) => isResidenceBuilding(b) && b.faction !== 'rival');
  const residenceById = new Map(residences.map((b) => [b.id, b]));
  const playerHumans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const totalBeds = residences.reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  const occupiedBeds = residences.reduce((sum, b) => sum + b.occupants.length, 0);
  const overCapacityResidences = residences.filter((b) => b.occupants.length > getResidenceCapacity(b)).length;
  const unassignedPlayerHumans = playerHumans.filter((e) => e.residenceBuildingId == null).length;
  const orphanedResidenceReferences = playerHumans.filter(
    (e) => e.residenceBuildingId != null && !residenceById.has(e.residenceBuildingId),
  ).length;
  const occupantListMismatches = residences.reduce((sum, building) => sum + building.occupants.filter(
    (id) => {
      const human = state.entities.find((e) => e.id === id);
      return !human || !human.alive || human.residenceBuildingId !== building.id;
    },
  ).length, 0);
  const leaderHouseBeds = residences
    .filter((b) => b.type === BuildingType.LeaderHouse)
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  const reservedLeaderHouseBeds = residences
    .filter((b) => isLeaderHouseResidence(b))
    .reduce((sum, b) => sum + b.occupants.length, 0);
  const playerHouseBeds = totalBeds - leaderHouseBeds;
  const openBeds = Math.max(0, totalBeds - occupiedBeds);
  const pressureRatio = totalBeds <= 0 ? 1 : occupiedBeds / totalBeds;

  return {
    tick: state.tick,
    calendarDay,
    totalBeds,
    occupiedBeds,
    openBeds,
    residences: residences.length,
    underCapacityResidences: residences.filter((b) => b.occupants.length < getResidenceCapacity(b)).length,
    overCapacityResidences,
    unassignedPlayerHumans,
    orphanedResidenceReferences,
    occupantListMismatches,
    leaderHouseBeds,
    reservedLeaderHouseBeds,
    playerHouseBeds,
    housingPressure: pressureRatio >= 0.95 ? 'critical' : pressureRatio >= 0.8 ? 'tight' : 'comfortable',
  };
}

export function isHousingDiagnosticsHealthy(snapshot: HousingDiagnosticsSnapshot): boolean {
  return snapshot.overCapacityResidences === 0
    && snapshot.orphanedResidenceReferences === 0
    && snapshot.occupantListMismatches === 0;
}

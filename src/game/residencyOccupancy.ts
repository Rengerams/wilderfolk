import type { Building, Entity } from './gameTypes';
import { BuildingType, BUILDING_CONFIGS } from './gameTypes';

/** Adult children may leave the parental home at this age when a house is free. */
export const HUMAN_MOVE_OUT_MIN_AGE = 18;

export function isResidenceBuilding(b: Building): boolean {
  return b.completed && isResidenceBuildingType(b.type);
}

export function isResidenceBuildingType(type: BuildingType): boolean {
  return type === BuildingType.House || type === BuildingType.Mansion || type === BuildingType.LeaderHouse;
}

export function isLeaderHouseResidence(b: Building): boolean {
  return b.type === BuildingType.LeaderHouse;
}

/** Base occupants + bonus from house/mansion upgrades (+2 slots per level above 1). */
export function getResidenceCapacity(residence: Building): number {
  const base = BUILDING_CONFIGS[residence.type].maxOccupants;
  if (!isResidenceBuildingType(residence.type)) return base;
  const level = residence.level || 1;
  return base + (level - 1) * 2;
}

export function getResidenceUpgradeSlotGain(type: BuildingType): number {
  return isResidenceBuildingType(type) ? 2 : 0;
}

/** Building id 0 is valid — never use bare !id for assignment checks. */
export function hasWorkAssignment(human: Entity): boolean {
  return human.homeBuildingId != null;
}

export function hasResidenceAssignment(human: Entity): boolean {
  return human.residenceBuildingId != null;
}

export function isImprisoned(human: Entity): boolean {
  return human.prisonBuildingId != null;
}

export function shareResidence(a: Entity, b: Entity): boolean {
  return hasResidenceAssignment(a) && hasResidenceAssignment(b) && a.residenceBuildingId === b.residenceBuildingId;
}

export function isNearResidence(human: Entity, buildings: Building[] | ReadonlyMap<number, Building>, maxDist = 55): boolean {
  if (!hasResidenceAssignment(human)) return false;
  const id = human.residenceBuildingId!;
  const residence = 'get' in buildings ? (buildings as ReadonlyMap<number, Building>).get(id) : (buildings as Building[]).find((b) => b.id === id);
  if (!residence || !isResidenceBuilding(residence)) return false;
  const cx = residence.x + residence.width / 2;
  const cy = residence.y + residence.height / 2;
  return Math.hypot(human.x - cx, human.y - cy) <= maxDist;
}

export type ResidenceOccupancy = Map<number, number>;

export function buildResidenceOccupancy(humans: readonly Entity[]): ResidenceOccupancy {
  const occupancy: ResidenceOccupancy = new Map();
  for (const h of humans) {
    if (!h.alive || h.faction) continue;
    const id = h.residenceBuildingId;
    if (id == null) continue;
    occupancy.set(id, (occupancy.get(id) ?? 0) + 1);
  }
  return occupancy;
}

export function occupancyMove(occupancy: ResidenceOccupancy, fromId: number | undefined, toId: number | undefined): void {
  if (fromId === toId) return;
  if (fromId != null) {
    const next = (occupancy.get(fromId) ?? 0) - 1;
    if (next <= 0) occupancy.delete(fromId);
    else occupancy.set(fromId, next);
  }
  if (toId != null) occupancy.set(toId, (occupancy.get(toId) ?? 0) + 1);
}

export function countResidentsInBuilding(humans: Entity[], buildingId: number, occupancy?: ResidenceOccupancy): number {
  if (occupancy) return occupancy.get(buildingId) ?? 0;
  return humans.filter((h) => h.alive && !h.faction && h.residenceBuildingId === buildingId).length;
}

export function residenceHasCapacity(residence: Building, humans: Entity[]): boolean {
  return countResidentsInBuilding(humans, residence.id) < getResidenceCapacity(residence);
}

export function residenceRoomFor(human: Entity, residence: Building, humans: Entity[], occupancy?: ResidenceOccupancy): boolean {
  let count = countResidentsInBuilding(humans, residence.id, occupancy);
  if (human.residenceBuildingId === residence.id) count--;
  return count < getResidenceCapacity(residence);
}

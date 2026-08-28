import { describe, expect, it } from 'vitest';
import {
  buildResidenceOccupancy,
  getResidenceCapacity,
  isLeaderHouseResidence,
  residenceRoomFor,
  syncResidenceOccupants,
} from '../src/game/dayCycle';
import {
  buildResidenceOccupancy as extractedBuildResidenceOccupancy,
  getResidenceCapacity as extractedGetResidenceCapacity,
  isLeaderHouseResidence as extractedIsLeaderHouseResidence,
  residenceRoomFor as extractedResidenceRoomFor,
  syncResidenceOccupants as extractedSyncResidenceOccupants,
} from '../src/game/residency';
import { BuildingType, EntityType, type Building, type Entity } from '../src/game/gameTypes';

const house = (id: number, level = 1): Building => ({
  id,
  type: BuildingType.House,
  level,
  completed: true,
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  occupants: [],
} as Building);

const human = (id: number, residenceBuildingId?: number): Entity => ({
  id,
  type: EntityType.Human,
  alive: true,
  faction: undefined,
  residenceBuildingId,
} as Entity);

describe('residency compatibility facade', () => {
  it('keeps public dayCycle residency APIs connected to the extracted owner', () => {
    expect(getResidenceCapacity).toBe(extractedGetResidenceCapacity);
    expect(buildResidenceOccupancy).toBe(extractedBuildResidenceOccupancy);
    expect(residenceRoomFor).toBe(extractedResidenceRoomFor);
    expect(isLeaderHouseResidence).toBe(extractedIsLeaderHouseResidence);
    expect(syncResidenceOccupants).toBe(extractedSyncResidenceOccupants);
  });

  it('preserves upgraded capacity, occupancy, and authoritative occupant synchronization', () => {
    const residence = house(7, 2);
    const first = human(1, residence.id);
    const second = human(2, residence.id);
    const unassigned = human(3);
    const humans = [first, second, unassigned];

    const occupancy = buildResidenceOccupancy(humans);
    expect(getResidenceCapacity(residence)).toBeGreaterThan(occupancy.get(residence.id) ?? 0);
    expect(residenceRoomFor(unassigned, residence, humans, occupancy)).toBe(true);

    syncResidenceOccupants(humans, [residence]);
    expect(residence.occupants).toEqual([first.id, second.id]);
  });
});

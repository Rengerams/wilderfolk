import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, MapSize, type Building, type Entity } from '../src/game/gameTypes';
import {
  assignIdleWorkerToBuilding,
  assignResidentToBuilding,
  moveOutOfFamilyHome,
  removeResidentFromBuilding,
} from '../src/game/buildingActions';
import {
  assignResidentToBuilding as extractedAssignResidentToBuilding,
  moveOutOfFamilyHome as extractedMoveOutOfFamilyHome,
  removeResidentFromBuilding as extractedRemoveResidentFromBuilding,
} from '../src/game/buildingResidencyActions';

function house(id: number): Building {
  return {
    id,
    type: BuildingType.House,
    x: 200,
    y: 200,
    width: 40,
    height: 40,
    completed: true,
    faction: 'player',
    occupants: [],
    level: 1,
    health: 100,
    maxHealth: 100,
  } as Building;
}

function settler(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    faction: undefined,
    age: 28,
    isJuvenile: false,
    x: 200,
    y: 200,
    relationshipStatus: 'single',
    residenceBuildingId: undefined,
    homeBuildingId: undefined,
  } as Entity;
}

describe('building residency action compatibility', () => {
  it('keeps direct residency commands forwarded from the legacy building-actions entry point', () => {
    expect(assignResidentToBuilding).toBe(extractedAssignResidentToBuilding);
    expect(moveOutOfFamilyHome).toBe(extractedMoveOutOfFamilyHome);
    expect(removeResidentFromBuilding).toBe(extractedRemoveResidentFromBuilding);
  });

  it('assigns an unassigned settler through both the direct residence command and legacy generic route', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const residence = house(100);
    const resident = settler(1);
    state.buildings = [residence];
    state.entities = [resident];

    const direct = assignResidentToBuilding(state, residence.id);
    const legacy = assignIdleWorkerToBuilding(state, residence.id);

    for (const next of [direct, legacy]) {
      const assigned = next.entities.find((entity) => entity.id === resident.id);
      const assignedHouse = next.buildings.find((building) => building.id === residence.id);
      expect(assigned?.residenceBuildingId).toBe(residence.id);
      expect(assignedHouse?.occupants).toContain(resident.id);
    }
  });
});

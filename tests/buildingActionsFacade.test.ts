import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, MapSize, type Building } from '../src/game/gameTypes';
import {
  assignIdleWorkerToBuilding,
  estimateWorkshopGold,
  removeWorkerFromBuilding,
} from '../src/game/buildingActions';
import {
  assignIdleWorkerToBuilding as routedAssignIdleWorkerToBuilding,
  removeWorkerFromBuilding as routedRemoveWorkerFromBuilding,
} from '../src/game/buildingActionRouting';
import { estimateWorkshopGold as extractedEstimateWorkshopGold } from '../src/game/workshopEconomy';
import { getWorkshopRecipe } from '../src/game/workshops';

function workshop(id: number): Building {
  return {
    id,
    type: BuildingType.Workshop,
    x: 200,
    y: 200,
    width: 80,
    height: 60,
    completed: true,
    faction: 'player',
    occupants: [],
    level: 1,
    health: 100,
    maxHealth: 100,
  } as Building;
}

describe('buildingActions compatibility façade', () => {
  it('forwards its remaining generic command routes and workshop estimate to focused owners', () => {
    expect(assignIdleWorkerToBuilding).toBe(routedAssignIdleWorkerToBuilding);
    expect(removeWorkerFromBuilding).toBe(routedRemoveWorkerFromBuilding);
    expect(estimateWorkshopGold).toBe(extractedEstimateWorkshopGold);
  });

  it('retains the base recipe estimate for an unstaffed workshop without mutating state', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const building = workshop(100);
    state.buildings = [building];
    const before = structuredClone(state);

    expect(estimateWorkshopGold(state, building)).toBe(getWorkshopRecipe(building.workshopRecipeId).baseGold);
    expect(state).toEqual(before);
  });
});

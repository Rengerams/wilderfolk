import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType, EntityType, MapSize, type Building, type Entity } from '../src/game/gameTypes';
import {
  demolishBuilding,
  getBuildingUpgradeCost,
  repairBuilding,
  upgradeBuilding,
} from '../src/game/buildingActions';
import {
  demolishBuilding as extractedDemolishBuilding,
  getBuildingUpgradeCost as extractedGetBuildingUpgradeCost,
  repairBuilding as extractedRepairBuilding,
  upgradeBuilding as extractedUpgradeBuilding,
} from '../src/game/buildingMaintenanceActions';

function farm(id: number, health = 100): Building {
  return {
    id,
    type: BuildingType.Farm,
    x: 200,
    y: 200,
    width: 80,
    height: 60,
    completed: true,
    faction: 'player',
    occupants: [],
    level: 1,
    health,
    maxHealth: 100,
  } as Building;
}

function worker(id: number, buildingId: number): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    faction: undefined,
    x: 200,
    y: 200,
    homeBuildingId: buildingId,
    residenceBuildingId: buildingId,
    prisonBuildingId: buildingId,
    prisonerUntilTick: 72,
    prisonSentenceCrime: 'theft',
  } as Entity;
}

describe('building maintenance action compatibility', () => {
  it('keeps direct maintenance APIs forwarded from the legacy building-actions entry point', () => {
    expect(repairBuilding).toBe(extractedRepairBuilding);
    expect(getBuildingUpgradeCost).toBe(extractedGetBuildingUpgradeCost);
    expect(upgradeBuilding).toBe(extractedUpgradeBuilding);
    expect(demolishBuilding).toBe(extractedDemolishBuilding);
  });

  it('repairs only when the established fixed costs are available', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const building = farm(100, 40);
    state.buildings = [building];
    state.resources.wood = 10;
    state.resources.stone = 5;

    const repaired = repairBuilding(state, building.id);
    const repairedBuilding = repaired.buildings.find((candidate) => candidate.id === building.id);
    expect(repaired.resources.wood).toBe(0);
    expect(repaired.resources.stone).toBe(0);
    expect(repairedBuilding?.health).toBe(repairedBuilding?.maxHealth);

    const unaffordable = repairBuilding({ ...state, resources: { ...state.resources, wood: 9 } }, building.id);
    expect(unaffordable.buildings.find((candidate) => candidate.id === building.id)?.health).toBe(40);
  });

  it('cleans workforce, residence, prison, and completed-building references before demolition', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const building = farm(100);
    const assignedWorker = worker(1, building.id);
    building.occupants = [assignedWorker.id];
    state.buildings = [building];
    state.entities = [assignedWorker];
    state.totalBuildingsCompleted = 1;
    const before = { ...state.resources };

    const demolished = demolishBuilding(state, building.id);
    const cleanedWorker = demolished.entities.find((entity) => entity.id === assignedWorker.id);
    const config = BUILDING_CONFIGS[building.type];

    expect(demolished.buildings).toEqual([]);
    expect(cleanedWorker?.homeBuildingId).toBeUndefined();
    expect(cleanedWorker?.residenceBuildingId).toBeUndefined();
    expect(cleanedWorker?.prisonBuildingId).toBeUndefined();
    expect(cleanedWorker?.prisonerUntilTick).toBeUndefined();
    expect(cleanedWorker?.prisonSentenceCrime).toBeUndefined();
    expect(demolished.totalBuildingsCompleted).toBe(0);
    expect(demolished.resources.wood).toBe(before.wood + Math.floor(config.cost.wood * 0.5));
  });
});

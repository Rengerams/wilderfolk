import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { assignMissingWorkers } from '../src/game/workforce';
import { setBuildingStaffingMode } from '../src/game/buildingConfigurationActions';
import { human, building } from '../src/test/factories';
import { isWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';

function makeWorld(): WorldState {
  return {
    entities: [human(1)],
    buildings: [building(7, BuildingType.Church, { staffingMode: 'manual' })],
    tick: 0,
    resources: { wood: 100, stone: 100, food: 100, gold: 100, iron: 0 },
    floatingTexts: [],
    notifications: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

describe('automatic workplace staffing', () => {
  it('starts all job-capable buildings in auto, and does not set modes on non-jobs', () => {
    for (const type of [
      BuildingType.Church, BuildingType.Barracks, BuildingType.Prison,
      BuildingType.School, BuildingType.Farm, BuildingType.Tavern,
    ]) {
      const built = createBuilding(type, 20, 20, 1);
      expect(built.staffingMode).toBe('auto');
    }
    expect(createBuilding(BuildingType.House, 20, 20, 2).staffingMode).toBeUndefined();
  });

  it('normalizes legacy manual flags and assigns available workers', () => {
    const world = makeWorld();
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(world.buildings[0].occupants).toEqual([1]);
    expect(world.buildings[0].staffingMode).toBe('auto');
    expect(world.entities[0].workerBuildingId).toBe(7);
    // Automatic staffing is the simulation's scheduled responsibility, not a button or notification.
    expect(world.notifications).toHaveLength(0);
  });

  it('rejects attempts to restore manual staffing after auto assignment', () => {
    const world = makeWorld();
    assignMissingWorkers(world.entities, world.buildings, world);
    const switched = setBuildingStaffingMode(world, 7, 'manual');
    expect(switched).toBe(world);
    expect(switched.buildings[0].staffingMode).toBe('auto');
    expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'setBuildingStaffingMode', buildingId: 7, mode: 'manual' })).toBe(false);
  });
});

describe('batch repair command transport', () => {
  it('accepts distinct valid building IDs', () => {
    expect(isWorkerCommand({
      proto: WORKER_CMD_PROTO, op: 'repairBuildings', buildingIds: [2, 4, 6],
    })).toBe(true);
  });

  it('rejects empty, duplicate, malformed, negative or noninteger IDs', () => {
    for (const buildingIds of [[], [1, 1], [-1], [0], [1.5], ['1'], [NaN]]) {
      expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'repairBuildings', buildingIds })).toBe(false);
    }
  });
});

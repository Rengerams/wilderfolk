import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { autoStaffAllWorkers } from '../src/game/buildingStaffingActions';
import { setBuildingStaffingMode } from '../src/game/buildingConfigurationActions';
import { isManualStaffingBuilding } from '../src/game/workforce';
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

describe('workplace staffing choice', () => {
  it('starts all job-capable buildings in auto, and does not set modes on non-jobs', () => {
    for (const type of [
      BuildingType.Church, BuildingType.Barracks, BuildingType.Prison,
      BuildingType.School, BuildingType.Farm, BuildingType.Tavern,
    ]) {
      const built = createBuilding(type, 20, 20, 1);
      expect(built.staffingMode).toBe('auto');
      expect(isManualStaffingBuilding(built)).toBe(false);
    }
    expect(createBuilding(BuildingType.House, 20, 20, 2).staffingMode).toBeUndefined();
  });

  it('respects manual vacancies and produces no repetitive auto-staff warning', () => {
    const world = makeWorld();
    const next = autoStaffAllWorkers(world);
    expect(next.buildings[0].occupants).toEqual([]);
    expect(next.buildings[0].staffingMode).toBe('manual');
    expect(next.entities[0].homeBuildingId).toBeUndefined();
    expect(next.notifications).toEqual([]);
    expect(world.buildings[0].staffingMode).toBe('manual');
  });

  it('leaves manual opt-out until the player explicitly returns to auto', () => {
    const world = makeWorld();
    const stillManual = autoStaffAllWorkers(world);
    expect(stillManual.buildings[0].staffingMode).toBe('manual');
    const switched = setBuildingStaffingMode(stillManual, 7, 'auto');
    expect(switched.buildings[0].staffingMode).toBe('auto');
    expect(isManualStaffingBuilding(switched.buildings[0])).toBe(false);
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

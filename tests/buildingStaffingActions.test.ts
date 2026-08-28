import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType, MapSize, type Building, type Entity } from '../src/game/gameTypes';
import {
  assignBuilderToBuilding,
  autoStaffAllWorkers,
  canAssignWorkerToBuilding,
  fillBuildingWorkers,
  listAssignableWorkersForBuilding,
} from '../src/game/buildingActions';
import {
  assignBuilderToBuilding as extractedAssignBuilderToBuilding,
  autoStaffAllWorkers as extractedAutoStaffAllWorkers,
  canAssignWorkerToBuilding as extractedCanAssignWorkerToBuilding,
  fillBuildingWorkers as extractedFillBuildingWorkers,
  listAssignableWorkersForBuilding as extractedListAssignableWorkersForBuilding,
} from '../src/game/buildingStaffingActions';

function farm(id: number): Building {
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
    health: 100,
    maxHealth: 100,
  } as Building;
}

function constructionSite(id: number, occupantId: number): Building {
  return {
    id,
    type: BuildingType.House,
    x: 400,
    y: 200,
    width: 40,
    height: 40,
    completed: false,
    faction: 'player',
    occupants: [occupantId],
    level: 1,
    health: 1,
    maxHealth: 100,
  } as Building;
}

function idleWorker(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    faction: 'player',
    x: 100,
    y: 100,
    alive: true,
    isJuvenile: false,
    pregnant: false,
    homeBuildingId: undefined,
    job: JobType.Settler,
    skills: {},
  } as Entity;
}

describe('building staffing action compatibility', () => {
  it('keeps direct staffing APIs forwarded from the legacy building-actions entry point', () => {
    expect(assignBuilderToBuilding).toBe(extractedAssignBuilderToBuilding);
    expect(autoStaffAllWorkers).toBe(extractedAutoStaffAllWorkers);
    expect(canAssignWorkerToBuilding).toBe(extractedCanAssignWorkerToBuilding);
    expect(fillBuildingWorkers).toBe(extractedFillBuildingWorkers);
    expect(listAssignableWorkersForBuilding).toBe(extractedListAssignableWorkersForBuilding);
  });

  it('keeps construction-crew settlers out of normal-job previews and availability checks', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const worker = idleWorker(1);
    const jobBuilding = farm(100);
    state.entities = [worker];
    state.buildings = [jobBuilding, constructionSite(101, worker.id)];

    expect(listAssignableWorkersForBuilding(state, jobBuilding.id)).toEqual([]);
    expect(canAssignWorkerToBuilding(state, jobBuilding.id)).toBe(false);
  });
});

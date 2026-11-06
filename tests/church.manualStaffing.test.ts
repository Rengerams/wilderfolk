/**
 * Church staffing: automatic vacancy filling and job continuity, plus the legacy
 * church-save cleanup contract. No individual worker assignment is available.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JOB_LABELS, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { assignMissingWorkers, rebalanceJobWorkers } from '../src/game/workforce';
import { assignIdleWorkerToBuilding } from '../src/game/buildingActionRouting';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { building, human } from '../src/test/factories';

function makeWorld(entities: Entity[], buildings: Building[]): WorldState {
  return {
    entities,
    buildings,
    tick: 0,
    notifications: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

describe('Church automatic staffing and continuity', () => {
  it('auto-fills an empty Church', () => {
    const idle = [human(1), human(2), human(3)];
    const church = building(4, BuildingType.Church);
    assignMissingWorkers(idle, [church]);
    expect(church.occupants.length).toBeGreaterThan(0);
  });

  it('normalizes a legacy manual flag while filling an empty Church', () => {
    const idle = [human(1), human(2), human(3)];
    const church = building(4, BuildingType.Church, { staffingMode: 'manual' });
    assignMissingWorkers(idle, [church]);
    expect(church.staffingMode).toBe('auto');
    expect(church.occupants.length).toBeGreaterThan(0);
  });

  it('preserves an assigned priest across repeated workforce pulses', () => {
    const priest = human(1, { workerBuildingId: 4, job: JobType.Priest });
    const church = building(4, BuildingType.Church, { occupants: [1], staffingMode: 'manual' });
    assignMissingWorkers([priest], [church]);
    assignMissingWorkers([priest], [church]);
    expect(church.staffingMode).toBe('auto');
    expect(priest.workerBuildingId).toBe(4);
    expect(church.occupants).toContain(1);
  });

  it('does not allow the former individual job-assignment command', () => {
    const priest = human(1);
    const church = building(4, BuildingType.Church);
    const world = makeWorld([priest], [church]);
    const next = assignIdleWorkerToBuilding(world, 4, 1);
    expect(next).toBe(world);
    expect(priest.workerBuildingId).toBeUndefined();
    expect(church.occupants).toEqual([]);
  });

  it('does not strip the sole Farm worker to fill an empty Church', () => {
    const farmWorker = human(1, { workerBuildingId: 2 });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const church = building(4, BuildingType.Church, { staffingMode: 'manual' });
    rebalanceJobWorkers([farmWorker], [farm, church]);
    expect(farmWorker.workerBuildingId).toBe(2);
    expect(church.occupants).toEqual([]);
  });
});

describe('Church legacy save compatibility', () => {
  it('preserves an existing Priest post even without the retired manual-staffing migration marker', () => {
    const world = initGame({ skipTerrain: true });
    const priest = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    expect(priest).toBeDefined();
    if (!priest) return;

    const church = building(world.nextBuildingId++, BuildingType.Church, { occupants: [priest.id], staffingMode: 'manual' });
    world.buildings.push(church);
    priest.workerBuildingId = church.id;
    priest.job = JobType.Priest;
    priest.occupation = JOB_LABELS[JobType.Priest];
    world.appliedSaveMigrations = [];

    const payload = structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
    const restored = loadGameFromParsedOutcome(payload);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    const loadedPriest = restored.world.entities.find((entity) => entity.id === priest.id);
    const loadedChurch = restored.world.buildings.find((site) => site.id === church.id);
    expect(loadedPriest?.workerBuildingId).toBe(church.id);
    expect(loadedPriest?.job).toBe(JobType.Priest);
    expect(loadedChurch?.occupants).toContain(priest.id);
    expect(loadedChurch?.staffingMode).toBe('auto');
  });
});

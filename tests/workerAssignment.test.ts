import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize, BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { canAssignWorkerToBuilding } from '../src/game/buildingStaffingActions';
import { setBuildingStaffingMode } from '../src/game/buildingConfigurationActions';
import { assignWorkerInPlace } from '../src/game/workforce';
import { building as buildingFixture, human } from '../src/test/factories';

/**
 * A colonist of the player's village: `isPlayerHuman` treats an unnamed marker and no faction
 * identically, so no faction string is written.
 */
function makeWorker(id: number, workerBuildingId: number | undefined): Entity {
  return human(id, {
    x: 100,
    y: 100,
    pregnant: false,
    workerBuildingId,
    job: workerBuildingId == null ? JobType.Settler : JobType.Farmer,
    skills: {},
  });
}

/**
 * The workplace under test. The occupancy cap lives on `BuildingConfig` (`BUILDING_CONFIGS`), not
 * on the `Building` fixture.
 */
function makeFarm(id: number): Building {
  return buildingFixture(id, BuildingType.Farm, { x: 200, y: 200, width: 80, height: 60 });
}

describe('B2 worker assignment panel truth', () => {
  it('does not offer a manual selector for a completed Farm', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const farm = makeFarm(100);
    state.buildings.push(farm);
    state.entities.push(makeWorker(1, undefined));
    expect(canAssignWorkerToBuilding(state, 100)).toBe(false);
  });

  it('assignWorkerInPlace prefers the closest available settler over a distant expert', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const farm = makeFarm(100);
    state.buildings.push(farm);
    const near = makeWorker(1, undefined);
    near.faction = undefined;
    near.x = 220;
    near.y = 220;
    const far = makeWorker(2, undefined);
    far.faction = undefined;
    far.x = 1000;
    far.y = 1000;
    far.skills = { farmer: 10 };

    const assigned = assignWorkerInPlace(farm, [near, far], state.buildings);
    expect(assigned).toBe(true);
    expect(near.workerBuildingId).toBe(100);
    expect(far.workerBuildingId).toBeUndefined();
  });

  it('setBuildingStaffingMode rejects manual mode', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const farm = makeFarm(100);
    state.buildings.push(farm);
    const next = setBuildingStaffingMode(state, 100, 'manual');
    expect(next).toBe(state);
    const next2 = setBuildingStaffingMode(state, 100, 'auto');
    expect(next2.buildings.find((b) => b.id === 100)?.staffingMode).toBe('auto');
  });
});
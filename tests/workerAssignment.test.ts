import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize, BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import {
  listAssignableWorkersForBuilding,
  setBuildingStaffingMode,
} from '../src/game/buildingActions';
import { assignWorkerInPlace } from '../src/game/workforce';
import { building as buildingFixture, human } from '../src/test/factories';

/**
 * A colonist of the player's village. The old fixture wrote `faction: 'player'` — a value
 * `Entity['faction']` does not name — behind an `as never`. `isPlayerHuman` classifies an
 * unnamed marker and no faction identically (both player-owned), and every gate the tests
 * below exercise (`isPlayerHuman`, `alive`, `isJuvenile`, `hasWorkAssignment`, `isImprisoned`,
 * `isOnConstructionCrew`) reads the same either way, so the marker is simply dropped.
 */
function makeWorker(id: number, homeBuildingId: number | undefined): Entity {
  return human(id, {
    x: 100,
    y: 100,
    pregnant: false,
    homeBuildingId,
    job: homeBuildingId == null ? JobType.Settler : JobType.Farmer,
    skills: {},
  });
}

/**
 * The workplace under test. `maxOccupants: 3` is gone with the `as never` cast: it is a
 * `BuildingConfig` field, not a `Building` one, and both callers read the cap from
 * `BUILDING_CONFIGS[BuildingType.Farm].maxOccupants` (2), never off the fixture.
 */
function makeFarm(id: number): Building {
  return buildingFixture(id, BuildingType.Farm, { x: 200, y: 200, width: 80, height: 60 });
}

describe('B2 worker assignment panel truth', () => {
  it('listAssignableWorkersForBuilding returns only unemployed adults', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const farm = makeFarm(100);
    state.buildings.push(farm);
    state.entities.push(
      makeWorker(1, 100), // employed farmer
      makeWorker(2, undefined), // unemployed
      makeWorker(3, 100), // employed farmer
    );
    const assignable = listAssignableWorkersForBuilding(state, 100);
    const ids = assignable.map((e) => e.id);
    expect(ids).toContain(2);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(3);
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
    expect(near.homeBuildingId).toBe(100);
    expect(far.homeBuildingId).toBeUndefined();
  });

  it('setBuildingStaffingMode persists auto/manual mode', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const farm = makeFarm(100);
    state.buildings.push(farm);
    const next = setBuildingStaffingMode(state, 100, 'manual');
    expect(next.buildings.find((b) => b.id === 100)?.staffingMode).toBe('manual');
    const next2 = setBuildingStaffingMode(state, 100, 'auto');
    expect(next2.buildings.find((b) => b.id === 100)?.staffingMode).toBe('auto');
  });
});
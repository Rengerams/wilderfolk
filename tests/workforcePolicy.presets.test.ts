/**
 * Workforce Policy Presets — roadmap F3 (Roadmap_V0_6.4.1.MD line 36).
 *
 * The preset is a priority order over which job building receives the next idle worker
 * (`workforcePolicy.PRESET_BUILDING_ORDER`). These cases pin the three promises the roadmap
 * row makes:
 *
 * 1. The assignment order actually changes with the preset (one idle settler, four job
 *    buildings, four different winners — one per preset).
 * 2. Manual assignment stays authoritative: a preset never takes a worker away from a
 *    manual assignment, and `removeWorkerFromBuilding` still works under every preset.
 * 3. `workforcePolicy` has a full transport contract — save/load, the worker tick delta,
 *    the prep rollback payload, the typed command path, and a documented default for a
 *    save written before the field existed.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { assignMissingWorkers, rebalanceJobWorkers } from '../src/game/workforce';
import {
  applyWorkerCommand,
  extractCommandDelta,
  isWorkerCommand,
  WORKER_CMD_PROTO,
} from '../src/game/simWorker/commands';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { GAME_VERSION } from '../src/game/version';
import {
  DEFAULT_WORKFORCE_POLICY,
  getWorkforcePolicy,
  normalizeWorkforcePolicy,
  setWorkforcePolicy,
  WORKFORCE_PRESETS,
  type WorkforcePreset,
} from '../src/game/workforcePolicy';
import { building, human } from '../src/test/factories';

/** A world slice wide enough for the staffing pass (venue schedules + the policy). */
function policySlices(preset: WorkforcePreset) {
  return { tavernSchedule: undefined, hotelSchedule: undefined, workforcePolicy: preset };
}

/**
 * Minimal world for the command paths. `floatingTexts` / `notifications` must exist because the
 * staffing actions announce what they did; `workforcePolicy` is the field under test.
 */
function makeWorld(entities: Entity[], buildings: Building[], preset: WorkforcePreset): WorldState {
  return {
    entities,
    buildings,
    tick: 0,
    workforcePolicy: preset,
    notifications: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

/** Four completed job buildings, one idle settler — the smallest fixture a preset can steer. */
function fourBuildingFixture(): { settler: Entity; farm: Building; lumber: Building; mine: Building; tavern: Building } {
  return {
    settler: human(1),
    farm: building(11, BuildingType.Farm),
    lumber: building(12, BuildingType.LumberMill),
    mine: building(13, BuildingType.Mine),
    tavern: building(14, BuildingType.Tavern),
  };
}

/** Which building received the idle settler, or `undefined` if nobody was assigned. */
function assignedTo(buildings: Building[]): Building | undefined {
  return buildings.find((b) => b.occupants.includes(1));
}

describe('workforce policy — assignment order', () => {
  it('sends the one idle settler to the preset’s highest-priority building', () => {
    // Each preset names a different first-choice workplace for this fixture, so a preset
    // that did not actually reach the ordering would collide with another row here.
    const expected: Record<WorkforcePreset, BuildingType> = {
      survival: BuildingType.Farm,
      growth: BuildingType.LumberMill,
      defense: BuildingType.Mine,
      comfort: BuildingType.Tavern,
    };

    for (const preset of WORKFORCE_PRESETS) {
      const { settler, farm, lumber, mine, tavern } = fourBuildingFixture();
      const buildings = [tavern, lumber, mine, farm];

      assignMissingWorkers([settler], buildings, policySlices(preset));

      const receiver = assignedTo(buildings);
      expect(receiver?.type, `preset "${preset}" must staff its first-choice workplace`).toBe(
        expected[preset],
      );
      expect(settler.homeBuildingId, `preset "${preset}" home assignment`).toBe(receiver?.id);
    }
  });

  it('changes the assignment when only the preset changes', () => {
    // Two job buildings and one idle settler: the preset alone decides the winner, because
    // both fixtures are identical apart from the policy.
    const survivalBuildings = [building(11, BuildingType.Farm), building(12, BuildingType.LumberMill)];
    assignMissingWorkers([human(1)], survivalBuildings, policySlices('survival'));

    const growthBuildings = [building(11, BuildingType.Farm), building(12, BuildingType.LumberMill)];
    assignMissingWorkers([human(1)], growthBuildings, policySlices('growth'));

    expect(assignedTo(survivalBuildings)?.type).toBe(BuildingType.Farm);
    expect(assignedTo(growthBuildings)?.type).toBe(BuildingType.LumberMill);
  });
});

describe('workforce policy — manual assignment stays authoritative', () => {
  it('keeps a manual assignment through an auto-staff pass under every preset', () => {
    for (const preset of WORKFORCE_PRESETS) {
      const tavern = building(14, BuildingType.Tavern);
      const farm = building(11, BuildingType.Farm);
      const lumber = building(12, BuildingType.LumberMill);
      const world = makeWorld([human(1)], [tavern, farm, lumber], preset);

      // Manual: hand this settler to the Tavern, which no preset ranks first.
      const assigned = applyWorkerCommand(world, {
        proto: WORKER_CMD_PROTO,
        op: 'assignWorker',
        buildingId: 14,
        humanId: 1,
      });
      const manualWorker = assigned.entities.find((e) => e.id === 1)!;
      expect(manualWorker.homeBuildingId, `preset "${preset}" manual assign`).toBe(14);
      expect(manualWorker.job).toBe(JobType.Innkeeper);

      assignMissingWorkers(assigned.entities, assigned.buildings, policySlices(preset));

      expect(manualWorker.homeBuildingId, `preset "${preset}" must not move a manual assignment`).toBe(14);
      expect(assigned.buildings.find((b) => b.id === 14)!.occupants).toEqual([1]);
    }
  });

  it('never donates a hand-placed worker during rebalance under any preset', () => {
    for (const preset of WORKFORCE_PRESETS) {
      const farmCrew = [
        human(1, { homeBuildingId: 11, job: JobType.Farmer }),
        human(2, { homeBuildingId: 11, job: JobType.Farmer }),
      ];
      const manual = human(3, { homeBuildingId: 14, job: JobType.Merchant });
      const farm = building(11, BuildingType.Farm, { occupants: [1, 2] });
      // A single hand-placed worker in a manual-staffing Store — a rebalance donor must skip it.
      const store = building(14, BuildingType.Store, { occupants: [3], staffingMode: 'manual' });
      const empty = building(15, BuildingType.LumberMill);

      rebalanceJobWorkers([...farmCrew, manual], [farm, store, empty], preset);

      expect(store.occupants, `preset "${preset}" store`).toEqual([3]);
      expect(manual.homeBuildingId, `preset "${preset}" manual home`).toBe(14);
      // ...and the rebalance still did its real work, or this test would pass vacuously.
      expect(empty.occupants.length, `preset "${preset}" empty target`).toBe(1);
    }
  });

  it('removeWorkerFromBuilding still clears the assignment under every preset', () => {
    for (const preset of WORKFORCE_PRESETS) {
      // A house so the released settler has a residence to fall back on.
      const house = building(1, BuildingType.House);
      const farmBuilding = building(11, BuildingType.Farm, { occupants: [1] });
      const farmWorker = human(1, { homeBuildingId: 11, job: JobType.Farmer });
      const farmWorld = makeWorld([farmWorker], [house, farmBuilding], preset);

      const afterFarmRemoval = applyWorkerCommand(farmWorld, {
        proto: WORKER_CMD_PROTO,
        op: 'removeWorker',
        buildingId: 11,
        humanId: 1,
      });
      const releasedFromFarm = afterFarmRemoval.entities.find((e) => e.id === 1)!;
      // The no-op pass that follows legitimately re-offers the now-idle settler to the same
      // open Farm slot (the farm is auto-staffed under every preset), so the end state is a
      // valid single-worker Farm — never a refusal of the removal itself.
      expect(releasedFromFarm.homeBuildingId, `preset "${preset}" re-fill`).toBe(11);
      expect(afterFarmRemoval.buildings.find((b) => b.id === 11)!.occupants, `preset "${preset}" removal`).toEqual([1]);

      // A manual-staffing workplace proves the removal end state in isolation: the auto pass
      // skips it under every preset, so the settler stays released.
      const church = building(4, BuildingType.Church, { occupants: [2] });
      const priest = human(2, { homeBuildingId: 4, job: JobType.Priest });
      const churchWorld = makeWorld([priest], [house, church], preset);

      const afterChurchRemoval = applyWorkerCommand(churchWorld, {
        proto: WORKER_CMD_PROTO,
        op: 'removeWorker',
        buildingId: 4,
        humanId: 2,
      });
      const releasedPriest = afterChurchRemoval.entities.find((e) => e.id === 2)!;

      expect(releasedPriest.homeBuildingId, `preset "${preset}" church removal`).toBeUndefined();
      expect(releasedPriest.job, `preset "${preset}" job`).toBe(JobType.Settler);
      expect(afterChurchRemoval.buildings.find((b) => b.id === 4)!.occupants, `preset "${preset}" church occupants`).toEqual([]);
      expect(getWorkforcePolicy(afterChurchRemoval), `preset "${preset}" is not a removal decision`).toBe(preset);
    }
  });
});

describe('workforce policy — save, delta, prep and command contract', () => {
  it('round-trips through save/load', () => {
    const world = initGame({ villageName: 'Presetville' });
    world.workforcePolicy = 'comfort';

    const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
    const parsed = parseSaveJson(raw);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    expect(loaded.world.workforcePolicy).toBe('comfort');
    expect(getWorkforcePolicy(loaded.world)).toBe('comfort');
  });

  it('loads an old save without the field at the documented default', () => {
    const world = initGame({ villageName: 'Oldsave' });
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    expect('workforcePolicy' in save).toBe(true);
    delete (save as Record<string, unknown>).workforcePolicy;

    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    expect(DEFAULT_WORKFORCE_POLICY).toBe('survival');
    expect(loaded.world.workforcePolicy).toBe(DEFAULT_WORKFORCE_POLICY);
    expect(parsed.parsed._version).toBe(GAME_VERSION);
  });

  it('travels the worker command path and the tick delta', () => {
    let world = initGame({ seed: 7 });
    const display = structuredClone(world);

    expect(getWorkforcePolicy(world)).toBe(DEFAULT_WORKFORCE_POLICY);

    const command = { proto: WORKER_CMD_PROTO, op: 'setWorkforcePolicy', preset: 'defense' } as const;
    expect(isWorkerCommand(command)).toBe(true);
    world = applyWorkerCommand(world, command);
    expect(world.workforcePolicy).toBe('defense');

    // The worker reassigns the world; the display world receives the command's delta.
    applySimTickDelta(display, structuredClone(extractCommandDelta(world)), { cloneMode: 'transfer' });
    expect(getWorkforcePolicy(display)).toBe('defense');

    // ...and the same field rides the per-tick delta too.
    const tickDelta = extractSimTickDelta(world, world.entities.filter((e) => e.alive), { headless: true });
    expect(tickDelta.workforcePolicy).toBe('defense');
  });

  it('rolls the policy back with the prep payload after a failed tick', () => {
    const world = initGame({ seed: 11 });
    world.workforcePolicy = 'growth';
    const prep = extractSimPrep(world);

    world.workforcePolicy = 'comfort';
    applySimPrep(world, prep);

    expect(world.workforcePolicy).toBe('growth');
    expect(extractSimPrep(world)).toEqual(prep);
  });

  it('rejects an unknown preset and normalizes untrusted values to the default', () => {
    expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'setWorkforcePolicy', preset: 'bogus' })).toBe(false);
    expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'setWorkforcePolicy', preset: 42 })).toBe(false);
    expect(normalizeWorkforcePolicy('bogus')).toBe(DEFAULT_WORKFORCE_POLICY);
    expect(normalizeWorkforcePolicy(undefined)).toBe(DEFAULT_WORKFORCE_POLICY);
    for (const preset of WORKFORCE_PRESETS) {
      expect(normalizeWorkforcePolicy(preset)).toBe(preset);
    }

    // An invalid preset leaves the world untouched (identity, so no delta is produced).
    const world = initGame({ seed: 3 });
    const unchanged = setWorkforcePolicy(world, 'bogus' as WorkforcePreset);
    expect(unchanged).toBe(world);
  });
});

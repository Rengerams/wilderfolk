/**
 * Workforce Policy Presets: a preset is a priority order over which job building receives the next
 * idle worker; these cases pin assignment order, persistent employment and the transport contract.
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
  jobBuildingPriorityForPolicy,
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
      expect(settler.workerBuildingId, `preset "${preset}" home assignment`).toBe(receiver?.id);
    }
  });

  it('prioritises a Fishing Spot over non-food industry in the survival preset', () => {
    expect(jobBuildingPriorityForPolicy('survival', BuildingType.FishingSpot))
      .toBeLessThan(jobBuildingPriorityForPolicy('survival', BuildingType.LumberMill));
    for (const preset of WORKFORCE_PRESETS) {
      // Fishing is a genuine staffed food workplace, not an unranked fallback.
      expect(jobBuildingPriorityForPolicy(preset, BuildingType.FishingSpot))
        .toBeLessThan(Number.MAX_SAFE_INTEGER);
    }

    const fish = building(21, BuildingType.FishingSpot);
    const lumber = building(22, BuildingType.LumberMill);
    const settler = human(1);
    assignMissingWorkers([settler], [lumber, fish], policySlices('survival'));
    expect(settler.workerBuildingId).toBe(fish.id);
    expect(fish.occupants).toContain(settler.id);
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

describe('workforce policy — persistent automatic employment', () => {
  it('preserves an established job through repeated staffing passes under every preset', () => {
    for (const preset of WORKFORCE_PRESETS) {
      const tavern = building(14, BuildingType.Tavern, { occupants: [1] });
      const farm = building(11, BuildingType.Farm);
      const lumber = building(12, BuildingType.LumberMill);
      const worker = human(1, { workerBuildingId: 14, job: JobType.Innkeeper });
      assignMissingWorkers([worker], [tavern, farm, lumber], policySlices(preset));
      assignMissingWorkers([worker], [tavern, farm, lumber], policySlices(preset));
      expect(worker.workerBuildingId, `preset "${preset}" job retained`).toBe(14);
      expect(tavern.occupants).toContain(1);
    }
  });

  it('normalizes legacy manual flags without evicting an employed settler', () => {
    for (const preset of WORKFORCE_PRESETS) {
      const worker = human(3, { workerBuildingId: 14, job: JobType.Merchant });
      const store = building(14, BuildingType.Store, { occupants: [3], staffingMode: 'manual' });
      assignMissingWorkers([worker], [store], policySlices(preset));
      expect(store.staffingMode).toBe('auto');
      expect(worker.workerBuildingId).toBe(14);
    }
  });

  it('does not strip the sole worker from an essential donor', () => {
    for (const preset of WORKFORCE_PRESETS) {
      const soleWorker = human(1, { workerBuildingId: 11, job: JobType.Miner });
      const quarry = building(11, BuildingType.Quarry, { occupants: [1] });
      const empty = building(15, BuildingType.LumberMill);
      rebalanceJobWorkers([soleWorker], [quarry, empty], preset);
      expect(soleWorker.workerBuildingId).toBe(11);
      expect(quarry.occupants).toEqual([1]);
    }
  });
});

describe('workforce policy — save, delta, prep and command contract', () => {
  it('round-trips through save/load', () => {
    const world = initGame({ skipTerrain: true, villageName: 'Presetville' });
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
    const world = initGame({ skipTerrain: true, villageName: 'Oldsave' });
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
    let world = initGame({ skipTerrain: true, seed: 7 });
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
    const tickDelta = extractSimTickDelta(world, world.entities.filter((e) => e.alive), {});
    expect(tickDelta.workforcePolicy).toBe('defense');
  });

  it('rolls the policy back with the prep payload after a failed tick', () => {
    const world = initGame({ skipTerrain: true, seed: 11 });
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
    const world = initGame({ skipTerrain: true, seed: 3 });
    const unchanged = setWorkforcePolicy(world, 'bogus' as WorkforcePreset);
    expect(unchanged).toBe(world);
  });
});

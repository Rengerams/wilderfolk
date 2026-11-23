/** Sector buttons steer the canonical workforce owner, not a second staffing engine. */
import { describe, expect, it } from 'vitest';
import { BuildingType, JobType } from '../src/game/gameTypes';
import { HUMAN_ADULT_MIN_AGE } from '../src/game/daycycleconstants';
import { SCHOOL_MIN_AGE } from '../src/game/gameConstants';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { schoolCapacity } from '../src/game/education';
import { building, human } from '../src/test/factories';
import {
  rebalanceJobWorkers,
  staffConstructionCrews,
  assignMissingWorkers,
  countWorkersAtBuilding,
} from '../src/game/workforce';
import {
  getWorkforceFocus,
  normalizeWorkforceFocus,
  setWorkforceFocus,
  workforceSectorForBuilding,
  WORKFORCE_FOCUS_SECTORS,
} from '../src/game/workforcePolicy';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { applyWorkerCommand, extractCommandDelta, isWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';

describe('workforce sector focus: real staffing', () => {
  it('lets the Church hire a second priest from a safe food surplus when the Church button is on', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const church = building(11, BuildingType.Church, { occupants: [3] });
    const workers = [human(1, { workerBuildingId: farm.id }), human(2, { workerBuildingId: farm.id }), human(3, { workerBuildingId: church.id })];

    rebalanceJobWorkers(workers, [farm, church], 'survival', 100, false, ['church']);

    expect(countWorkersAtBuilding(workers, church.id)).toBe(2);
    expect(countWorkersAtBuilding(workers, farm.id)).toBe(1);
    expect(church.occupants).toHaveLength(2);
    expect(workers.find((person) => person.workerBuildingId === church.id && person.id !== 3)?.job)
      .toBe(JobType.Priest);
  });

  it('can fill all four church jobs from separate safe surpluses without draining a final producer', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const lumber = building(12, BuildingType.LumberMill, { occupants: [3, 4, 5] });
    const church = building(11, BuildingType.Church, { occupants: [6] });
    const workers = [
      ...[1, 2].map((id) => human(id, { workerBuildingId: farm.id })),
      ...[3, 4, 5].map((id) => human(id, { workerBuildingId: lumber.id })),
      human(6, { workerBuildingId: church.id }),
    ];

    rebalanceJobWorkers(workers, [farm, lumber, church], 'survival', 100, false, ['church']);

    expect(countWorkersAtBuilding(workers, church.id)).toBe(4);
    expect(countWorkersAtBuilding(workers, farm.id)).toBeGreaterThanOrEqual(1);
    expect(countWorkersAtBuilding(workers, lumber.id)).toBeGreaterThanOrEqual(1);
  });

  it('does not drain food workers in a food emergency just to fill the Church', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const church = building(11, BuildingType.Church, { occupants: [3] });
    const workers = [human(1, { workerBuildingId: farm.id }), human(2, { workerBuildingId: farm.id }), human(3, { workerBuildingId: church.id })];

    rebalanceJobWorkers(workers, [farm, church], 'survival', 100, true, ['church']);

    expect(countWorkersAtBuilding(workers, church.id)).toBe(1);
    expect(countWorkersAtBuilding(workers, farm.id)).toBe(2);
  });

  it('gives a Mine an extra miner when the mining button is on, protecting one farmer', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const mine = building(11, BuildingType.Mine, { occupants: [3] });
    const workers = [human(1, { workerBuildingId: farm.id }), human(2, { workerBuildingId: farm.id }), human(3, { workerBuildingId: mine.id })];

    rebalanceJobWorkers(workers, [farm, mine], 'survival', 100, false, ['mining']);

    expect(countWorkersAtBuilding(workers, mine.id)).toBe(2);
    expect(countWorkersAtBuilding(workers, farm.id)).toBe(1);
  });

  it('allocates a second teacher as soon as ten pupils are enrolled, without requiring a toggle', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const school = building(11, BuildingType.School, { occupants: [3] });
    const pupils = Array.from({ length: 10 }, (_, i) =>
      human(100 + i, { age: SCHOOL_MIN_AGE, isJuvenile: true, schoolBuildingId: school.id }),
    );
    const humans = [human(1, { workerBuildingId: farm.id }), human(2, { workerBuildingId: farm.id }), human(3, { workerBuildingId: school.id }), ...pupils];

    rebalanceJobWorkers(humans, [farm, school], 'survival', 100);

    expect(countWorkersAtBuilding(humans, school.id)).toBe(2);
    expect(schoolCapacity(school)).toBe(20);
    expect(countWorkersAtBuilding(humans, farm.id)).toBe(1);
  });

  it('reclaims Church surplus for an empty food site during an emergency, with or without Food focus', () => {
    for (const focus of [['church'], ['food', 'church']] as const) {
      const farm = building(10, BuildingType.Farm);
      const church = building(11, BuildingType.Church, { occupants: [1, 2, 3, 4] });
      const workers = [1, 2, 3, 4].map((id) => human(id, { workerBuildingId: church.id }));

      rebalanceJobWorkers(workers, [farm, church], 'survival', 100, true, focus);

      expect(countWorkersAtBuilding(workers, farm.id)).toBe(2);
      expect(countWorkersAtBuilding(workers, church.id)).toBe(2);
      expect(farm.occupants).toHaveLength(2);
    }
  });

  it('keeps two equally prioritized Churches stable over repeated staffing passes', () => {
    const first = building(10, BuildingType.Church, { occupants: [1, 2] });
    const second = building(11, BuildingType.Church, { occupants: [3, 4] });
    const workers = [
      human(1, { workerBuildingId: first.id }),
      human(2, { workerBuildingId: first.id }),
      human(3, { workerBuildingId: second.id }),
      human(4, { workerBuildingId: second.id }),
    ];

    rebalanceJobWorkers(workers, [first, second], 'survival', 100, false, ['church']);
    expect(first.occupants).toEqual([1, 2]);
    expect(second.occupants).toEqual([3, 4]);

    rebalanceJobWorkers(workers, [first, second], 'survival', 100 + 3 * TICKS_PER_DAY, false, ['church']);
    expect(first.occupants).toEqual([1, 2]);
    expect(second.occupants).toEqual([3, 4]);
  });

  it('allows genuine same-sector surplus: an empty school lends its extra teacher', () => {
    const quiet = building(10, BuildingType.School, { occupants: [1, 2] });
    const full = building(11, BuildingType.School, { occupants: [3] });
    const pupils = Array.from({ length: 10 }, (_, i) =>
      human(100 + i, { age: SCHOOL_MIN_AGE, isJuvenile: true, schoolBuildingId: full.id }),
    );
    const people = [
      human(1, { workerBuildingId: quiet.id }),
      human(2, { workerBuildingId: quiet.id }),
      human(3, { workerBuildingId: full.id }),
      ...pupils,
    ];

    rebalanceJobWorkers(people, [quiet, full], 'survival', 100, false, ['education']);

    expect(countWorkersAtBuilding(people, quiet.id)).toBe(1);
    expect(countWorkersAtBuilding(people, full.id)).toBe(2);
  });

  it('does not borrow an extra teacher for nine pupils', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const school = building(11, BuildingType.School, { occupants: [3] });
    const pupils = Array.from({ length: 9 }, (_, i) =>
      human(100 + i, { age: HUMAN_ADULT_MIN_AGE - 1, isJuvenile: true, schoolBuildingId: school.id }),
    );
    const humans = [human(1, { workerBuildingId: farm.id }), human(2, { workerBuildingId: farm.id }), human(3, { workerBuildingId: school.id }), ...pupils];

    rebalanceJobWorkers(humans, [farm, school], 'survival', 100);

    expect(countWorkersAtBuilding(humans, school.id)).toBe(1);
    expect(countWorkersAtBuilding(humans, farm.id)).toBe(2);
  });

  it('construction cannot take an extra focused priest to seed an empty building project', () => {
    const church = building(10, BuildingType.Church, { occupants: [1, 2] });
    const project = building(11, BuildingType.Workshop, { completed: false, occupants: [] });
    const humans = [human(1, { workerBuildingId: church.id }), human(2, { workerBuildingId: church.id })];

    staffConstructionCrews(humans, [church, project], 'survival', 100, ['church']);

    expect(church.occupants).toEqual([1, 2]);
    expect(project.occupants).toEqual([]);
  });
});

describe('sector priority setting and persistence', () => {
  it('validates and normalises independent sector toggles', () => {
    expect(WORKFORCE_FOCUS_SECTORS).toContain('church');
    expect(workforceSectorForBuilding(BuildingType.Church)).toBe('church');
    expect(normalizeWorkforceFocus(['church', 'unknown', 'mining', 'church'])).toEqual(['mining', 'church']);
    expect(normalizeWorkforceFocus(undefined)).toEqual([]);
    let world = { workforceFocus: [] as Array<'church' | 'mining'> };
    world = setWorkforceFocus(world, 'church', true);
    expect(getWorkforceFocus(world)).toEqual(['church']);
    expect(setWorkforceFocus(world, 'church', true)).toBe(world);
    world = setWorkforceFocus(world, 'mining', true);
    expect(getWorkforceFocus(world)).toEqual(['mining', 'church']);
    world = setWorkforceFocus(world, 'church', false);
    expect(getWorkforceFocus(world)).toEqual(['mining']);
  });

  it('round-trips the Church toggle through commands, save, delta and rollback', () => {
    const command = { proto: WORKER_CMD_PROTO, op: 'setWorkforceFocus', sector: 'church', enabled: true } as const;
    expect(isWorkerCommand(command)).toBe(true);
    expect(isWorkerCommand({ ...command, sector: 'bogus' })).toBe(false);
    expect(isWorkerCommand({ ...command, enabled: 'true' })).toBe(false);

    const initial = initGame({ skipTerrain: true, seed: 123 });
    const display = structuredClone(initial);
    const updated = applyWorkerCommand(initial, command);
    expect(getWorkforceFocus(updated)).toEqual(['church']);

    applySimTickDelta(display, structuredClone(extractCommandDelta(updated)), { cloneMode: 'transfer' });
    expect(getWorkforceFocus(display)).toEqual(['church']);

    const fullDelta = extractSimTickDelta(updated, updated.entities.filter((e) => e.alive), {});
    expect(fullDelta.workforceFocus).toEqual(['church']);

    const json = JSON.stringify(buildSaveData(updated, createInitialView(updated.width, updated.height)));
    const parsed = parseSaveJson(json);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded?.world.workforceFocus).toEqual(['church']);

    const prep = extractSimPrep(updated);
    updated.workforceFocus = [];
    applySimPrep(updated, prep);
    expect(getWorkforceFocus(updated)).toEqual(['church']);
  });

  it('defaults a legacy save without focus buttons to all focus toggles off', () => {
    const world = initGame({ skipTerrain: true, seed: 124 });
    world.workforceFocus = ['church'];
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    delete (save as Record<string, unknown>).workforceFocus;
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(getWorkforceFocus(loaded?.world ?? {})).toEqual([]);
  });

  it('fills one priority Church from an idle adult before construction', () => {
    const church = building(10, BuildingType.Church);
    const project = building(11, BuildingType.Workshop, { completed: false, occupants: [] });
    const people = [human(1)];
    const world = initGame({ skipTerrain: true, seed: 125 });
    world.entities = people;
    world.buildings = [church, project];
    world.workforcePolicy = 'survival';
    world.workforceFocus = ['church'];
    assignMissingWorkers(people, world.buildings, world);
    expect(people[0].workerBuildingId).toBe(church.id);
    expect(project.occupants).toEqual([]);
  });
});

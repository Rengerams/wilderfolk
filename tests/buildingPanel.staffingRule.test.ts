/**
 * Rendered behaviour for the two workforce rules the building inspector must not restate: which
 * workplaces staff by hand, and how many guard posts a Prison offers beside its cells.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SelectedBuildingPanel from '../src/components/SelectedBuildingPanel';
import { BuildingType, JobType } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import {
  assignStaffWorkerToBuilding,
  canAssignWorkerToBuilding,
  listAssignableWorkersForBuilding,
} from '../src/game/buildingStaffingActions';
import { getBuildingConfig } from '../src/game/buildingConfig';
import { isManualStaffingBuilding, staffingCapFor } from '../src/game/workforce';
import { building, human } from '../src/test/factories';

function makeWorld(entities: Entity[], buildings: Building[]): WorldState {
  return {
    entities,
    buildings,
    tick: 0,
    worldMap: null,
    workSchedule: { startHour: 7, endHour: 16 },
    resources: { wood: 0, stone: 0, food: 1000, gold: 0, iron: 0 },
    floatingTexts: [],
    notifications: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

/** The panel's props as the App shell wires them for the selected building. */
function renderPanel(target: Building, state: WorldState): string {
  return renderToStaticMarkup(
    createElement(SelectedBuildingPanel, {
      building: target,
      state,
      onAssign: () => {},
      onAutoStaffAll: () => {},
      onAssignWorker: () => {},
      assignableWorkers: listAssignableWorkersForBuilding(state, target.id),
      onRemove: () => {},
      onRepair: () => {},
      onUpgrade: () => {},
      onDemolish: () => {},
      canAssignWorker: canAssignWorkerToBuilding(state, target.id),
    }),
  );
}

const AUTO_STAFFING_CLAIM = 'Workers are assigned here automatically';

describe('the inspector claims automatic staffing only where the workforce owner auto-staffs', () => {
  it('drops the claim for a completed School', () => {
    const school = building(5, BuildingType.School, { staffingMode: 'manual' });
    expect(isManualStaffingBuilding(school)).toBe(true);
    expect(renderPanel(school, makeWorld([], [school]))).toContain('Enable Auto-fill for all workplaces');
    expect(renderPanel(school, makeWorld([], [school]))).not.toContain(AUTO_STAFFING_CLAIM);
  });

  it('keeps the claim for a completed Farm', () => {
    const farm = building(6, BuildingType.Farm);
    expect(isManualStaffingBuilding(farm)).toBe(false);
    expect(renderPanel(farm, makeWorld([], [farm]))).toContain(AUTO_STAFFING_CLAIM);
  });
});

describe("the inspector measures a Prison by the owner's guard posts", () => {
  it('counts guards, not guards and prisoners, against the posts', () => {
    const guards = [1, 2, 3].map((id) => human(id, { workerBuildingId: 9 }));
    const inmates = [4, 5, 6, 7].map((id) =>
      human(id, { prisonBuildingId: 9, prisonerUntilTick: 500 }),
    );
    const prison = building(9, BuildingType.Prison, { occupants: [1, 2, 3, 4, 5, 6, 7] });
    const state = makeWorld([...guards, ...inmates], [prison]);

    const { cap, staffed } = staffingCapFor(prison, state.entities);
    expect(cap).toBeLessThan(prison.occupants.length);
    const html = renderPanel(prison, state);
    expect(html).toContain(`Assigned workers: ${staffed} / ${cap}`);
    expect(html).not.toContain(`Assigned workers: ${prison.occupants.length} / `);
  });

  it('does not offer the empty-picker notice once every post is filled', () => {
    const guards = [1, 2, 3, 4].map((id) => human(id, { workerBuildingId: 9 }));
    const prison = building(9, BuildingType.Prison, { occupants: [1, 2, 3, 4] });
    const state = makeWorld(guards, [prison]);

    const { cap, staffed } = staffingCapFor(prison, state.entities);
    expect(staffed).toBe(cap);
    expect(prison.occupants.length).toBeLessThan(
      getBuildingConfig(BuildingType.Prison).maxOccupants,
    );
    expect(renderPanel(prison, state)).not.toContain('No idle settlers');
  });
  it('lists prison guards as workers without duplicating prisoners in the duty roster', () => {
    const guard = human(1, { name: 'GuardUnique', workerBuildingId: 9, job: JobType.PrisonGuard });
    const inmate = human(2, { name: 'InmateUnique', prisonBuildingId: 9, prisonerUntilTick: 500 });
    const prison = building(9, BuildingType.Prison, { occupants: [1, 2] });
    const html = renderPanel(prison, makeWorld([guard, inmate], [prison]));

    expect(html).toContain('👷 GuardUnique');
    expect(html).not.toContain('👷 InmateUnique');
    expect(html).toContain('⛓️ InmateUnique');
  });
});

describe('reserved posts remain occupied during imprisonment', () => {
  it('blocks manual assignments when jailed workers still hold every post', () => {
    const farm = building(35, BuildingType.Farm, { occupants: [] });
    const cap = getBuildingConfig(BuildingType.Farm).maxOccupants;
    const prisoners = Array.from({ length: cap }, (_, index) =>
      human(100 + index, { workerBuildingId: farm.id, prisonBuildingId: 99, prisonerUntilTick: 500 }));
    const idle = human(999);
    const state = makeWorld([...prisoners, idle], [farm]);

    expect(staffingCapFor(farm, state.entities)).toEqual({ cap, staffed: cap });
    const next = assignStaffWorkerToBuilding(state, farm.id, idle.id);
    expect(next.entities.find((entity) => entity.id === idle.id)?.workerBuildingId).toBeUndefined();
    expect(next.entities.filter((entity) => entity.workerBuildingId === farm.id)).toHaveLength(cap);
  });
});

describe('the manual worker picker reports the settlers it leaves out', () => {
  it("counts the rest of the owner's list beside the sliced picker", () => {
    const idle: Entity[] = [];
    for (let id = 1; id <= 13; id++) idle.push(human(id));
    const school = building(5, BuildingType.School, { staffingMode: 'manual' });
    const state = makeWorld(idle, [school]);

    const picker = listAssignableWorkersForBuilding(state, school.id);
    expect(picker.length).toBeGreaterThan(0);
    expect(picker.length).toBeLessThan(idle.length);
    expect(renderPanel(school, state)).toContain(`+${idle.length - picker.length} more settler`);
  });
});

describe('building worker roster shows work duty, not private activities', () => {
  it('distinguishes working and walking to work on the same barracks roster', () => {
    const barracks = building(20, BuildingType.Barracks, { occupants: [1, 2] });
    const atPost = humanBuildingTarget(barracks, 1, false);
    const present = human(1, { workerBuildingId: barracks.id, job: JobType.Soldier, x: atPost.x, y: atPost.y });
    const commuter = human(2, { workerBuildingId: barracks.id, job: JobType.Soldier, x: 3000, y: 3000 });
    const state = makeWorld([present, commuter], [barracks]);
    state.tick = 10 * TICKS_PER_HOUR;
    const html = renderPanel(barracks, state);
    expect(html).toContain('Working');
    expect(html).toContain('Walking to work');
    expect(html).not.toContain('Soldiers are manual only');
    expect(html).toContain('even off shift');
    expect(html).not.toContain('during work shifts');
  });

  it('shows off duty even when an assigned soldier is sleeping at home', () => {
    const barracks = building(20, BuildingType.Barracks, { occupants: [1] });
    const house = building(21, BuildingType.House, { x: 500, y: 500 });
    const sleeper = human(1, {
      workerBuildingId: barracks.id,
      residenceBuildingId: house.id,
      job: JobType.Soldier,
      x: house.x + house.width / 2,
      y: house.y + house.height / 2,
    });
    const state = makeWorld([sleeper], [barracks, house]);
    state.tick = 23 * TICKS_PER_HOUR;
    const html = renderPanel(barracks, state);
    expect(html).toContain('Off duty');
    expect(html).not.toContain(' · Sleeping');
  });
});

describe('assigned workers vs actual presence', () => {
  it('does not present barracks staffing as soldiers currently standing at the barracks', () => {
    const barracks = building(10, BuildingType.Barracks, {
      x: 400, y: 400, occupants: [1, 2],
    });
    const home = building(11, BuildingType.House, { x: 0, y: 0, occupants: [1, 2] });
    const soldiers = [
      human(1, { workerBuildingId: 10, residenceBuildingId: 11, x: 0, y: 0 }),
      human(2, { workerBuildingId: 10, residenceBuildingId: 11, x: 0, y: 0 }),
    ];
    const html = renderPanel(barracks, makeWorld(soldiers, [home, barracks]));
    expect(html).toContain('Assigned workers: 2 / 4');
    expect(html).toContain('not necessarily here right now');
    expect(html).toContain('Off duty');
  });
});

/**
 * Rendered behaviour for the two workforce rules the building inspector must not restate: which
 * workplaces staff by hand, and how many guard posts a Prison offers beside its cells.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SelectedBuildingPanel from '../src/components/SelectedBuildingPanel';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import {
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
    const guards = [1, 2, 3].map((id) => human(id, { homeBuildingId: 9 }));
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
    const guards = [1, 2, 3, 4].map((id) => human(id, { homeBuildingId: 9 }));
    const prison = building(9, BuildingType.Prison, { occupants: [1, 2, 3, 4] });
    const state = makeWorld(guards, [prison]);

    const { cap, staffed } = staffingCapFor(prison, state.entities);
    expect(staffed).toBe(cap);
    expect(prison.occupants.length).toBeLessThan(
      getBuildingConfig(BuildingType.Prison).maxOccupants,
    );
    expect(renderPanel(prison, state)).not.toContain('No idle settlers');
  });
});

describe('assigned workers vs actual presence', () => {
  it('does not present barracks staffing as soldiers currently standing at the barracks', () => {
    const barracks = building(10, BuildingType.Barracks, {
      x: 400, y: 400, occupants: [1, 2],
    });
    const home = building(11, BuildingType.House, { x: 0, y: 0, occupants: [1, 2] });
    const soldiers = [
      human(1, { homeBuildingId: 10, residenceBuildingId: 11, x: 0, y: 0 }),
      human(2, { homeBuildingId: 10, residenceBuildingId: 11, x: 0, y: 0 }),
    ];
    const html = renderPanel(barracks, makeWorld(soldiers, [home, barracks]));
    expect(html).toContain('Assigned workers: 2 / 4');
    expect(html).toContain('not necessarily here right now');
    expect(html).toContain('Away from post');
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

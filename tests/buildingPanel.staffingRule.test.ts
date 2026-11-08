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
} from '../src/game/buildingStaffingActions';
import { getBuildingConfig } from '../src/game/buildingConfig';
import { staffingCapFor } from '../src/game/workforce';
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
      onRepair: () => {},
      onUpgrade: () => {},
      onDemolish: () => {},
      canAssignWorker: canAssignWorkerToBuilding(state, target.id),
    }),
  );
}

const AUTO_STAFFING_CLAIM = 'Workers are assigned here automatically';

describe('automatic employment in the building inspector', () => {
  it('ignores a legacy manual mode and shows automatic staffing', () => {
    const school = building(5, BuildingType.School, { staffingMode: 'manual' });
    const html = renderPanel(school, makeWorld([], [school]));
    expect(html).toContain(AUTO_STAFFING_CLAIM);
    expect(html).not.toContain('Choose worker:');
    expect(html).not.toContain('Manual</button>');
  });

  it('keeps the automatic staffing explanation for a completed Farm', () => {
    const farm = building(6, BuildingType.Farm);
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
    expect(html).toContain(`Guard capacity: ${staffed} of ${cap} filled`);
    expect(html).toContain(`${cap - staffed} open`);
    expect(html).toContain('Prison cells: 4 of 4 occupied · 0 free');
    expect(html).not.toContain(`Guard capacity: ${prison.occupants.length} of `);
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

describe('individual job selection is unavailable', () => {
  it('retains the staffing roster but does not offer manual selection', () => {
    const school = building(5, BuildingType.School, { staffingMode: 'manual' });
    const state = makeWorld([human(1)], [school]);
    const html = renderPanel(school, state);
    expect(html).toContain('Employment is automatic');
    expect(html).not.toContain('Choose worker:');
  });
});

describe('building worker roster shows work duty, not private activities', () => {
  it('distinguishes working and walking to work on the same barracks roster', () => {
    const barracks = building(20, BuildingType.Barracks, { occupants: [1, 2] });
    const atPost = humanBuildingTarget(barracks, 1);
    const present = human(1, { workerBuildingId: barracks.id, job: JobType.Soldier, x: atPost.x, y: atPost.y });
    const commuter = human(2, { workerBuildingId: barracks.id, job: JobType.Soldier, x: 3000, y: 3000, vx: -1, vy: 0 });
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

describe('construction crews are filled automatically', () => {
  it('offers no manual fill control on an unfinished site', () => {
    const site = building(30, BuildingType.House, { completed: false, constructionProgress: 0 });
    const state = makeWorld([human(1)], [site]);

    // The owner would accept this settler, so the old command button would have rendered.
    expect(canAssignWorkerToBuilding(state, site.id)).toBe(true);
    const html = renderPanel(site, state);
    expect(html).not.toContain('Fill builders');
    expect(html).toContain('Builders are assigned automatically');
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
    expect(html).toContain('Worker capacity: 2 of 4 filled');
    expect(html).toContain('2 open');
    expect(html).toContain('not necessarily here right now');
    expect(html).toContain('Off duty');
  });
});

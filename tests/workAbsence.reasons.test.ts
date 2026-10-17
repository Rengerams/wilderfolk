/**
 * One case per reason class `workAbsence` distinguishes: the settler's reason for being away from
 * their post must be read from the state the simulation wrote, not re-derived by a view.
 *
 * Every fixture here builds the *stored* state a step is in — an assigned post, a residence, a
 * prison id, a festival — and asserts the owner's reason code for it.
 */
import { describe, expect, it } from 'vitest';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BuildingType, EntityType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { prefersHomeTonightFor } from '../src/game/humanSchedule';
import { getWorkSchedule } from '../src/game/workSchedule';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { collectDashboard, explainSettler } from '../src/game/dashboardData';
import { getHumanActivityProjection } from '../src/game/humanStatus';
import {
  getSettlerWorkReason,
  getUnstaffedPostNote,
  getWorkplaceRosterReasons,
  workplaceDutyLabel,
} from '../src/game/workAbsence';

/** Absolute calendar day 0 is a Monday, so a tick on day 0 at this hour is inside a work day. */
function workdayTick(hour: number): number {
  return hour * TICKS_PER_HOUR;
}

function world(tick: number, overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick,
    width: 400,
    height: 300,
    year: 1,
    dayInYear: 0,
    season: Season.Spring,
    weather: WeatherType.Clear,
    entities: [],
    buildings: [],
    eventLog: [],
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    populationHistory: [],
    foodHistory: [],
    tradeRoutes: [],
    resources: { wood: 0, stone: 0, food: 100, gold: 0, iron: 0 },
    storageMax: { wood: 0, stone: 0, food: 500, gold: 0, iron: 0 },
    humanPopulation: 1,
    workSchedule: { startHour: 7, endHour: 16 },
    festival: null,
    electionCeremony: null,
    ...overrides,
  } as unknown as WorldState;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 100,
    y: 100,
    width: 40,
    height: 40,
    occupants: [],
    completed: true,
    constructionProgress: 1,
    health: 100,
    maxHealth: 100,
    level: 1,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as unknown as Building;
}

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    isJuvenile: false,
    ...overrides,
  } as unknown as Entity;
}

/** A settler on a completed Farm's roster, posted far from the building unless placed. */
function postedFarmer(farm: Building, overrides: Partial<Entity> = {}): Entity {
  return settler(1, {
    homeBuildingId: farm.id,
    job: JobType.Farmer,
    x: 3_000,
    y: 3_000,
    ...overrides,
  });
}

describe('the reason a settler is not at their post', () => {
  it('says off shift, with the hour the next shift starts', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const worker = postedFarmer(farm);
    const state = world(workdayTick(17), { entities: [worker], buildings: [farm] });

    const reason = getSettlerWorkReason(state, worker);

    expect(reason.code).toBe('off-shift');
    expect(reason.label).toBe('Off shift until 07:00');
  });

  it('says walking to work while the shift is on and the post is not reached', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const worker = postedFarmer(farm);
    const state = world(workdayTick(10), { entities: [worker], buildings: [farm] });

    expect(getSettlerWorkReason(state, worker)).toEqual({
      code: 'walking-to-work',
      label: 'Walking to work — Farm',
    });
  });

  it('says working once the settler stands at the post the movement owner chose', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const stand = humanBuildingTarget(farm, 1, false);
    const worker = postedFarmer(farm, { x: stand.x, y: stand.y });
    const state = world(workdayTick(10), { entities: [worker], buildings: [farm] });

    expect(getSettlerWorkReason(state, worker).code).toBe('working');
  });

  it('says sleeping for a night hour spent at the assigned residence', () => {
    const house = building(2, BuildingType.House);
    const worker = settler(1, {
      residenceBuildingId: house.id,
      x: house.x + house.width / 2,
      y: house.y + house.height / 2,
    });
    const state = world(23 * TICKS_PER_HOUR, { entities: [worker], buildings: [house] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'sleeping', label: 'Sleeping' });
  });

  it('says eating on a meal-check hour a hungry settler can feed at', () => {
    const worker = settler(1, { energy: 10 });
    const state = world(workdayTick(8), { entities: [worker] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'eating', label: 'Eating' });
  });

  it('says ill, in the hospital owner’s own word, for a settler below the care threshold', () => {
    const worker = settler(1, { energy: 30 });
    const state = world(workdayTick(11), { entities: [worker] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'ill', label: 'Ill — exhausted' });
  });

  it('says expecting for a pregnant settler', () => {
    const worker = settler(1, { energy: 90, pregnant: true, pregnancyProgress: 100 });
    const state = world(workdayTick(11), { entities: [worker] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'expecting', label: 'Expecting — resting' });
  });

  it('says no post assigned for an adult with no workplace and no construction crew', () => {
    const worker = settler(1);
    const state = world(workdayTick(10), { entities: [worker] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'no-post', label: 'No post assigned' });
  });

  it('says the post has no roster when the assignment is not on the building’s roster', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [] });
    const worker = postedFarmer(farm);
    const state = world(workdayTick(10), { entities: [worker], buildings: [farm] });

    expect(getSettlerWorkReason(state, worker)).toEqual({
      code: 'post-unstaffed',
      label: 'Post has no roster — Farm',
    });
  });

  it('says in prison for an imprisoned settler', () => {
    const worker = settler(1, { prisonBuildingId: 9, prisonerUntilTick: 10 * TICKS_PER_DAY });
    const state = world(workdayTick(10), { entities: [worker] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'in-prison', label: 'In prison' });
  });

  it('says at the festival once the festival window holds a settler with no shift', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const worker = postedFarmer(farm);
    const state = world(workdayTick(17), {
      entities: [worker],
      buildings: [farm],
      festival: { active: true, name: 'Harvest Fair', daysLeft: 1 },
    });

    expect(getSettlerWorkReason(state, worker)).toEqual({
      code: 'at-festival',
      label: 'At the festival',
    });
  });

  it('says at the election for a ceremony attendee', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const worker = postedFarmer(farm);
    const state = world(workdayTick(10), {
      entities: [worker],
      buildings: [farm],
      electionCeremony: { startedTick: 0 } as unknown as WorldState['electionCeremony'],
    });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'at-election', label: 'At the election' });
  });

  it('says hunting for a settler who holds a committed prey target', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const worker = postedFarmer(farm, { huntTargetId: 2 });
    const deer = settler(2, { type: EntityType.Deer });
    const state = world(workdayTick(17), { entities: [worker, deer], buildings: [farm] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'hunting', label: 'Hunting' });
  });

  it('says socialising on an evening the home owner did not send them home', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const worker = postedFarmer(farm);
    const schedule = getWorkSchedule(world(0));
    const tick = Array.from({ length: 100 }, (_, day) => day * TICKS_PER_DAY + 19 * TICKS_PER_HOUR)
      .find((candidate) => !prefersHomeTonightFor(schedule, worker.id, candidate, 19));
    if (tick === undefined) throw new Error('expected a deterministic evening-out tick');
    const state = world(tick, { entities: [worker], buildings: [farm] });

    expect(getSettlerWorkReason(state, worker)).toEqual({
      code: 'socialising',
      label: 'Socialising — evening outing',
    });
  });

  it('says at home on a morning the home owner keeps them in, at their own residence', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const house = building(2, BuildingType.House);
    const worker = postedFarmer(farm, {
      residenceBuildingId: house.id,
      x: house.x + house.width / 2,
      y: house.y + house.height / 2,
    });
    const schedule = getWorkSchedule(world(0));
    const tick = Array.from({ length: 100 }, (_, day) => day * TICKS_PER_DAY + 6 * TICKS_PER_HOUR)
      .find((candidate) => prefersHomeTonightFor(schedule, worker.id, candidate, 6));
    if (tick === undefined) throw new Error('expected a deterministic at-home tick');
    const state = world(tick, { entities: [worker], buildings: [farm, house] });

    expect(getSettlerWorkReason(state, worker)).toEqual({ code: 'at-home', label: 'At home' });
  });

  it('says off duty today for a prison guard resting between roster shifts', () => {
    const prison = building(3, BuildingType.Prison, { occupants: [1] });
    const worker = settler(1, { homeBuildingId: prison.id, job: JobType.PrisonGuard });
    // A guard the roster gives no shift today is free, not merely between shifts.
    const state = world(workdayTick(10), { entities: [worker], buildings: [prison] });

    const reason = getSettlerWorkReason(state, worker);

    expect(['off-shift', 'walking-to-work']).toContain(reason.code);
  });
});

describe('the reason reaches every surface the player reads', () => {
  it('rides the settler activity projection', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const worker = postedFarmer(farm);
    const state = world(workdayTick(17), { entities: [worker], buildings: [farm] });

    expect(getHumanActivityProjection(state, worker).workReason).toEqual(
      getSettlerWorkReason(state, worker),
    );
  });

  it('names every settler on a building’s roster, with their own reason', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1, 2] });
    const offShift = postedFarmer(farm);
    const stand = humanBuildingTarget(farm, 2, false);
    const working = postedFarmer(farm, { id: 2, x: stand.x, y: stand.y });
    const state = world(workdayTick(10), { entities: [offShift, working], buildings: [farm] });

    const roster = getWorkplaceRosterReasons(state, farm);

    expect(roster.map((row) => [row.settlerId, row.reason.code])).toEqual([
      [1, 'walking-to-work'],
      [2, 'working'],
    ]);
  });

  it('explains an empty hand-staffed post, and stays quiet about an auto-staffed one', () => {
    expect(getUnstaffedPostNote(building(1, BuildingType.Farm, { staffingMode: 'manual' })))
      .toBe('Workplace staffed manually — assign workers here yourself.');
    expect(getUnstaffedPostNote(building(1, BuildingType.Farm))).toBeNull();
    expect(getUnstaffedPostNote(building(1, BuildingType.Farm, { staffingMode: 'manual', occupants: [1] })))
      .toBeNull();
  });

  it('carries the reason on the dashboard row and in the settlement’s idle concern', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const offShift = postedFarmer(farm);
    const jobless = settler(2, { x: 50, y: 50 });
    const state = world(workdayTick(17), { entities: [offShift, jobless], buildings: [farm] });
    state.humanPopulation = 2;

    const dashboard = collectDashboard(state);
    expect(dashboard.settlers.find((s) => s.id === 1)?.workReason.code).toBe('off-shift');

    const idle = dashboard.concerns.find((c) => c.id === 'idle');
    expect(idle?.detail).toContain('1 more hold a post but are away');
    expect(idle?.detail).toContain('Off shift until 07:00');
  });

  it('tells a posted settler why no work was logged, instead of only that none was', () => {
    const farm = building(1, BuildingType.Farm, { occupants: [1] });
    const offShift = postedFarmer(farm);
    const state = world(workdayTick(17), { entities: [offShift], buildings: [farm] });

    const line = explainSettler(state, offShift.id).find((candidate) => candidate.label === 'Why idle');

    expect(line?.value).toBe('Off shift until 07:00 — no work logged today.');
  });
});

describe('short workplace-duty labels versus full personal activity', () => {
  it('preserves walking to work instead of treating transit as time off', () => {
    expect(workplaceDutyLabel({ code: 'walking-to-work', label: 'Walking to work — Barracks' }))
      .toBe('Walking to work');
    expect(workplaceDutyLabel({ code: 'working', label: 'Working at Barracks' }))
      .toBe('Working');
  });

  it('displays off duty for any personal activity that is not working or commuting', () => {
    const away: Array<ReturnType<typeof getSettlerWorkReason>> = [
      { code: 'sleeping', label: 'Sleeping' },
      { code: 'at-home', label: 'At home' },
      { code: 'socialising', label: 'Socialising — evening outing' },
      { code: 'off-shift', label: 'Off shift until 07:00' },
      { code: 'expecting', label: 'Expecting — resting' },
      { code: 'ill', label: 'Ill — exhausted' },
    ];
    expect(away.map(workplaceDutyLabel)).toEqual(away.map(() => 'Off duty'));
    // This view-only mapping does not change the detailed personal statuses.
    expect(away[0].label).toBe('Sleeping');
  });
});

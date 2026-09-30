/**
 * Medium-severity simulation-audit regressions (BUG_REPORTS/2026-09-13-simulation-logic-audit.md):
 *
 *   M18 — the leader's household must contain only *dependent* children, so grown
 *         children are not dragged into the manor (and re-logged) every colony day.
 *   M35 — a zero-candidate election reveal must step the office down and schedule a
 *         successor election instead of leaving the colony with no path to a head.
 *   M37 — removing a settler from a job must not strip them out of their residence's
 *         occupants list (SIMULATION_AUTHORITY.md §5 residence ↔ occupants).
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, LEADER_OCCUPATION } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import {
  VACANCY_ELECTION_DELAY_YEARS,
  tickElectionCeremony,
  tickLeaderVacancy,
} from '../src/game/villageLeadership';
// `DAYS_PER_YEAR` is owned by the clock (`dayCycle` → `dayCycleClock` → `gameConstants.Time`);
// `villageLeadership` no longer re-declares it (audit cross-cutting: second calendar definition).
import { DAYS_PER_YEAR } from '../src/game/dayCycle';
import { removeWorkerTransition } from '../src/game/workforce';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

function makeWorld(
  entities: Entity[],
  buildings: Building[],
  villageLeaderId: number | null = null,
  overrides: Partial<WorldState> = {},
): WorldState {
  return {
    entities,
    buildings,
    villageLeaderId,
    year: 5,
    dayInYear: 10,
    tick: 500,
    lastElectionYear: 4,
    pendingElectionYear: null,
    electionCeremony: null,
    eventLog: [],
    ...overrides,
  } as unknown as WorldState;
}

const vacancyYear = (): number => 5 + 10 / DAYS_PER_YEAR + VACANCY_ELECTION_DELAY_YEARS;

describe('M18 leader household composition', () => {
  it('leaves grown children out of the manor and logs the move-in only once', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      partnerId: 2,
      childrenIds: [3, 4, 6],
      residenceBuildingId: 10,
      age: 45,
    });
    const spouse = human(2, { partnerId: 1, residenceBuildingId: 10, age: 43 });
    const minorChild = human(3, {
      motherId: 1,
      fatherId: 2,
      isJuvenile: true,
      age: 8,
      residenceBuildingId: 11,
    });
    const marriedChild = human(4, {
      motherId: 1,
      fatherId: 2,
      age: 24,
      partnerId: 5,
      residenceBuildingId: 11,
    });
    const marriedInLaw = human(5, { partnerId: 4, age: 25, residenceBuildingId: 11 });
    const singleAdultChild = human(6, {
      motherId: 1,
      fatherId: 2,
      age: 22,
      residenceBuildingId: 10,
    });
    const manor = building(10, BuildingType.LeaderHouse, { occupants: [1, 2, 6] });
    const house = building(11, BuildingType.House, { occupants: [3, 4, 5] });
    const state = makeWorld(
      [leader, spouse, minorChild, marriedChild, marriedInLaw, singleAdultChild],
      [manor, house],
      1,
    );

    syncLeaderHouseResidency(state);
    syncLeaderHouseResidency(state); // daily reconciliation runs again the next colony day

    expect(minorChild.residenceBuildingId).toBe(10);
    expect(marriedChild.residenceBuildingId).not.toBe(10);
    expect(singleAdultChild.residenceBuildingId).not.toBe(10);
    expect(manor.occupants).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(manor.occupants).not.toContain(4);
    expect(manor.occupants).not.toContain(6);
    expect(
      state.eventLog.filter((e) => e.message.includes("moved into the Leader's House")),
    ).toHaveLength(1);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });
});

describe('M35 zero-candidate election reveal', () => {
  it('steps the incumbent down and schedules the successor election', () => {
    // The only adult is the imprisoned incumbent, so the reveal has no candidate.
    const leader = human(7, {
      occupation: LEADER_OCCUPATION,
      residenceBuildingId: 10,
      prisonBuildingId: 42,
      age: 50,
    });
    const manor = building(10, BuildingType.LeaderHouse, { occupants: [7] });
    const prison = building(42, BuildingType.Prison, { occupants: [7] });
    const state = makeWorld([leader], [manor, prison], 7, {
      electionCeremony: {
        phase: 'reveal',
        phaseTicksLeft: 1,
        gatherX: 0,
        gatherY: 0,
        reason: 'term',
        pendingLeaderId: 7,
        pendingLeaderName: 'Asha Reed',
        pendingChanged: false,
      },
    });

    tickElectionCeremony(state, 5);

    expect(state.villageLeaderId).toBeNull();
    expect(leader.occupation).toBe('settler');
    expect(state.pendingElectionYear).toBeCloseTo(vacancyYear(), 10);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });

  it('schedules the vacancy election when no settler can stand yet', () => {
    const deadLeader = human(1, { alive: false, occupation: LEADER_OCCUPATION });
    const juvenile = human(2, { isJuvenile: true, age: 6 });
    const state = makeWorld([deadLeader, juvenile], [], 1);

    tickLeaderVacancy(state);

    expect(state.villageLeaderId).toBeNull();
    expect(state.pendingElectionYear).toBeCloseTo(vacancyYear(), 10);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });
});

describe('M37 removeWorkerTransition residence occupancy', () => {
  it('clears workplaces and crews but leaves the residence occupants list intact', () => {
    const settler = human(1, {
      homeBuildingId: 2,
      residenceBuildingId: 10,
      job: JobType.Farmer,
    });
    const builder = human(2);
    const house = building(10, BuildingType.House, { occupants: [1] });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const site = building(3, BuildingType.House, { completed: false, occupants: [2] });
    const state = makeWorld([settler, builder], [house, farm, site]);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);

    removeWorkerTransition(settler, state.buildings);
    removeWorkerTransition(builder, state.buildings);

    expect(house.occupants).toEqual([1]);
    expect(farm.occupants).toEqual([]);
    expect(site.occupants).toEqual([]);
    expect(settler.homeBuildingId).toBeUndefined();
    expect(builder.homeBuildingId).toBeUndefined();
    expect(settler.residenceBuildingId).toBe(10);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });
});

/**
 * A leadership vacancy is not terminal: once the campaign falls due the colony elects a successor,
 * so a run cannot end permanently headless while an eligible settler exists.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  VACANCY_ELECTION_DELAY_YEARS,
  getVillageLeader,
  tickElectionCeremony,
  tickLeaderVacancy,
  tryStartVacancyElectionCeremony,
} from '../src/game/villageLeadership';
import { DAYS_PER_YEAR } from '../src/game/dayCycleClock';

import { building, human } from '../src/test/factories';
import { BuildingType, LEADER_OCCUPATION, type Entity, type Building, type WorldState } from '../src/game/gameTypes';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';

describe('a leadership vacancy resolves to a successor', () => {
  it('elects a new head after the leader dies', () => {
    const state = initGame({ seed: 4242 });
    const leader = getVillageLeader(state);
    expect(leader, 'the run must open with a head').not.toBeNull();
    const deadId = leader!.id;
    leader!.alive = false;

    // The daily layer arms the vacancy when the head stops acting.
    tickLeaderVacancy(state);
    expect(state.villageLeaderId).toBeNull();
    expect(state.pendingElectionYear, 'the vacancy must arm a successor date').not.toBeNull();

    // Fast-forward the calendar to (just past) the due date.
    const due = state.pendingElectionYear!;
    state.year = Math.floor(due);
    state.dayInYear = Math.ceil((due - state.year) * DAYS_PER_YEAR) + 1;

    // The daily layer starts the ceremony once the campaign is due.
    expect(tryStartVacancyElectionCeremony(state, state.year, state.dayInYear)).toBe(true);

    // The realtime layer advances the ceremony through reveal, where the successor is elected.
    // Use the actual remaining phase ticks, so longer ceremonies still complete.
    const ceremonyTickBudget = 500;
    for (let i = 0; i < ceremonyTickBudget && state.electionCeremony; i++) {
      tickElectionCeremony(state, state.year);
    }

    expect(state.electionCeremony).toBeNull();
    const successor = getVillageLeader(state);
    expect(successor, 'the vacancy must elect a successor').not.toBeNull();
    expect(successor!.id).not.toBe(deadId);
    expect(state.pendingElectionYear, 'the vacancy campaign must be settled').toBeNull();
  });
});

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

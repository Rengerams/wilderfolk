/**
 * A leadership vacancy is not terminal: once the campaign falls due the colony elects a
 * successor, so a run cannot end permanently headless while an eligible settler exists.
 *
 * Drives the real daily/realtime owners in the order the layers call them, fast-forwarding
 * the calendar instead of ticking a full vacancy campaign of simulation.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  getVillageLeader,
  tickElectionCeremony,
  tickLeaderVacancy,
  tryStartVacancyElectionCeremony,
} from '../src/game/villageLeadership';
import { DAYS_PER_YEAR } from '../src/game/dayCycleClock';

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
    for (let i = 0; i < 100 && state.electionCeremony; i++) {
      tickElectionCeremony(state, state.year);
    }

    expect(state.electionCeremony).toBeNull();
    const successor = getVillageLeader(state);
    expect(successor, 'the vacancy must elect a successor').not.toBeNull();
    expect(successor!.id).not.toBe(deadId);
    expect(state.pendingElectionYear, 'the vacancy campaign must be settled').toBeNull();
  });
});

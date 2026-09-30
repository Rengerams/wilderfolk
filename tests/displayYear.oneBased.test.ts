import { describe, expect, it } from 'vitest';
import { displayYear } from '../src/game/dayCycleClock';
import { ELECTION_INTERVAL_YEARS, getElectionCeremonyStatus } from '../src/game/villageLeadership';
import type { WorldState } from '../src/game/gameTypes';

/**
 * `WorldState.year` counts closed calendar years from 0, but every player-facing surface reads the
 * first year as "Year 1". `displayYear` is the one conversion; these tests pin the boundary case the
 * owner reported and the interval/absolute-year split it must not blur.
 */
describe('displayYear formats a stored year for the player', () => {
  it('reads the stored first year as Year 1', () => {
    expect(displayYear(0)).toBe(1);
  });

  it('leaves the term interval alone while shifting the stored election year', () => {
    expect(displayYear(ELECTION_INTERVAL_YEARS)).toBe(ELECTION_INTERVAL_YEARS + 1);
    expect([1, 5, 100].map(displayYear)).toEqual([2, 6, 101]);
  });

  it('announces a first-year vacancy as Year 1, not Year 0', () => {
    const state = {
      entities: [],
      villageLeaderId: null,
      pendingElectionYear: 0.25 + 1 / 3,
      electionCeremony: null,
      year: 0,
      dayInYear: 90,
      tick: 90 * 72,
    } as unknown as WorldState;

    expect(getElectionCeremonyStatus(state)).toContain('(Year 1)');
  });
});

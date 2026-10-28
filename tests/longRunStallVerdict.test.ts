import { afterEach, describe, expect, it } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { resetRelationshipDiagnostics } from '../src/game/relationshipDiagnostics';
import { resetSimRng } from '../src/game/simRng';
import { STALL_SETTLING_DAYS, assessColonyStall, type ColonyHealthReport } from '../scripts/colonyHealth';

/**
 * Construct a minimal health report for isolated verdict tests.
 *
 * These values do not affect the actual simulation.
 */
function reportOf(overrides: {
  day?: number;
  housing?: Partial<ColonyHealthReport['housing']>;
  workforce?: Partial<ColonyHealthReport['workforce']>;
  food?: Partial<ColonyHealthReport['food']>;
}): ColonyHealthReport {
  return {
    day: overrides.day ?? 720,

    food: {
      stored: 50,
      storageMax: 5000,
      spoilageRatePerDay: 0.008,
      producedToday: 8,
      consumedToday: 69,
      netToday: -61,
      ledgerDay: 720,
      ...overrides.food,
    },

    housing: {
      homelessPlayerHumans: 23,
      occupiedBeds: 48,
      totalBeds: 48,
      ...overrides.housing,
    },

    workforce: {
      working: 13,
      idle: 44,
      workerSlots: 21,
      filledWorkerSlots: 13,
      ...overrides.workforce,
    },
  } as unknown as ColonyHealthReport;
}

/**
 * Minimal world fixture with all five resource types.
 *
 * Gold and iron are genuine resources in Wilderfolk.
 * Defaults preserve existing two-argument test calls.
 */
function fakeWorld(
  wood: number,
  stone: number,
  iron = 0,
  gold = 0,
): WorldState {
  return {
    resources: {
      food: 0,
      wood,
      stone,
      iron,
      gold,
    },

    storageMax: {
      food: 2600,
      wood: 1700,
      stone: 1000,
      iron: 1000,
      gold: 1000,
    },
  } as unknown as WorldState;
}

afterEach(() => {
  resetRelationshipDiagnostics();
  resetSimRng();
});

describe('long-run non-vacuity verdict', () => {
  it('fails a stalled colony that raises nothing while its beds stay full', () => {
    const stalledReport = reportOf({
      food: {
        stored: 0,
      },
    });

    const verdict = assessColonyStall({
      world: fakeWorld(4, 4, 0, 0),
      snapshots: [stalledReport],
      final: stalledReport,
      newBuildingsAtEnd: 0,
    });

    expect(verdict.stalled).toBe(true);

    expect(verdict.reasons).toContain('housing-full');
    expect(verdict.reasons).toContain('food-exhausted');
    expect(verdict.reasons).toContain('wood-pinned');

    expect(verdict.evidence.join(' ')).toContain('23 homeless');
    expect(verdict.evidence.join(' ')).toContain('larder at 0');
  });

  it('clears the housing and resource rules once the colony raises a building', () => {
    const verdict = assessColonyStall({
      world: fakeWorld(4, 4, 0, 0),
      snapshots: [reportOf({})],
      final: reportOf({}),
      newBuildingsAtEnd: 1,
    });

    expect(verdict.reasons).not.toContain('housing-full');
    expect(verdict.reasons).not.toContain('wood-pinned');
  });

  it('does not judge a run shorter than the settling period', () => {
    const short = reportOf({
      day: STALL_SETTLING_DAYS - 1,
    });

    const verdict = assessColonyStall({
      world: fakeWorld(0, 0, 0, 0),
      snapshots: [short],
      final: short,
      newBuildingsAtEnd: 0,
    });

    expect(verdict).toEqual({
      stalled: false,
      reasons: [],
      evidence: [],
    });
  });

  it('does not fire on a single observation of a working colony', () => {
    const working = reportOf({
      day: 60,

      food: {
        stored: 2112,
        producedToday: 107,
        consumedToday: 46,
        netToday: 61,
      },

      workforce: {
        working: 13,
        idle: 29,
        workerSlots: 21,
        filledWorkerSlots: 13,
      },

      housing: {
        homelessPlayerHumans: 0,
        occupiedBeds: 48,
        totalBeds: 48,
      },
    });

    const verdict = assessColonyStall({
      world: fakeWorld(1700, 90, 0, 0),
      snapshots: [working],
      final: working,
      newBuildingsAtEnd: 0,
    });

    expect(verdict.stalled).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });
});

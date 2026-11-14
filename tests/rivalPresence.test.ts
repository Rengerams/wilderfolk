import { describe, expect, it } from 'vitest';
import type { RivalSettlement } from '../src/game/gameTypes';
import { getRivalPresenceSummary } from '../src/game/rivalPresence';

const state = { eventLog: [], pendingDiplomacyEvents: [] };

function rival(overrides: Partial<RivalSettlement> = {}): RivalSettlement {
  return {
    id: 'rival_test',
    name: 'Testcamp',
    campX: 100,
    campY: 100,
    population: 5,
    relationship: 'neutral',
    foundedYear: 0,
    daysUntilAction: 30,
    raidCooldownDays: 0,
    peaceTreatyDays: 0,
    profile: {
      temperament: 'pragmatic',
      priority: 'food',
      ledger: { food: 30, wood: 20, gold: 10, morale: 55, recovery: 100 },
      contactCount: 0,
      lastAction: 'gather',
      lastActionDay: 1,
    },
    ...overrides,
  };
}

describe('rival presence summary', () => {
  it('names a gathering camp instead of reporting it as quiet', () => {
    const summary = getRivalPresenceSummary(state, rival());
    expect(summary.mode).toBe('gathering');
    expect(summary.modeLabel).toBe('Gathering supplies');
  });

  it('keeps a peace treaty over whatever the camp last did', () => {
    const summary = getRivalPresenceSummary(state, rival({ peaceTreatyDays: 5 }));
    expect(summary.mode).toBe('under_treaty');
    expect(summary.modeLabel).toBe('Under a peace treaty');
  });
});

import { describe, expect, it } from 'vitest';
import type { RivalSettlement, WorldState } from '../src/game/gameTypes';
import { projectFrontierPanel } from '../src/game/frontierPanelView';

const noAlerts = { pendingRaidCount: 0, pendingOutgoingRaidCount: 0, pendingDiplomacyCount: 0 };

function world(): WorldState {
  return {
    tick: 0,
    width: 1200,
    height: 900,
    entities: [],
    buildings: [],
    visitorGroups: [],
    rivalSettlements: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    pendingDiplomacyEvents: [],
    raidBattleReports: [],
    eventLog: [],
    unlockedTechs: [],
    villageName: 'Sample',
    villageReputation: 10,
    resources: { wood: 100, stone: 100, food: 100, gold: 100, iron: 0 },
  } as unknown as WorldState;
}

function rival(): RivalSettlement {
  return {
    id: 'test_rival',
    name: 'Testcamp',
    campX: 900,
    campY: 700,
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
  };
}

describe('Frontier read-only projection', () => {
  it('keeps the empty panel empty without modifying its world', () => {
    const state = world();
    const before = JSON.stringify(state);
    const view = projectFrontierPanel(state, noAlerts);
    expect(view.isEmpty).toBe(true);
    expect(view.rivals).toEqual([]);
    expect(view.militia.militiaStrength).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('builds all rival UI fields from one normalized profile without changing the saved profile', () => {
    const state = world();
    state.rivalSettlements.push(rival());
    const before = JSON.stringify(state);
    const view = projectFrontierPanel(state, noAlerts);
    const displayed = view.rivals[0];
    expect(view.isEmpty).toBe(false);
    expect(displayed.populationLabel).toBe('5 souls at the camp');
    expect(displayed.statusLabel).toBe('Gathering supplies');
    expect(displayed.ledgerLabel).toContain('30 food');
    expect(displayed.raidFoodCost).toBeGreaterThan(0);
    expect(displayed.historyLabel).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });
});

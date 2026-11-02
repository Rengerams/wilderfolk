import { beforeEach, describe, expect, it } from 'vitest';
import {
  getHousingRelocationSnapshot,
  recordHousingRelocation,
  resetHousingRelocationMonitor,
  setHousingRelocationMonitorEnabled,
  stampHousingRelocationClock,
} from '../src/game/housingRelocationMonitor';

function household(...ids: number[]): { id: number; name?: string }[] {
  return ids.map((id) => ({ id, name: `Settler ${id}` }));
}

describe('the relocation monitor', () => {
  beforeEach(() => {
    setHousingRelocationMonitorEnabled(false);
    resetHousingRelocationMonitor();
  });

  it('records nothing until the dev switch is on', () => {
    recordHousingRelocation({ phase: 'capacity', reason: 'family', members: household(1, 2), to: 10 });

    expect(getHousingRelocationSnapshot().totalMoves).toBe(0);
  });

  it('summarises moves, households, repeats, unhoused moves and phases', () => {
    setHousingRelocationMonitorEnabled(true);
    stampHousingRelocationClock(42, 2, 7);
    recordHousingRelocation({ phase: 'capacity', reason: 'family', members: household(1, 2), from: 10, to: 11 });
    recordHousingRelocation({ phase: 'capacity', reason: 'family', members: household(1, 2), from: 11, to: 12 });
    recordHousingRelocation({ phase: 'surplus', reason: 'family', members: household(9), to: undefined });

    const snapshot = getHousingRelocationSnapshot();

    expect(snapshot.totalMoves).toBe(3);
    expect(snapshot.distinctHouseholds).toBe(2);
    expect(snapshot.repeatMoves).toBe(1);
    expect(snapshot.homelessMoves).toBe(1);
    expect(snapshot.byPhase).toEqual([{ phase: 'capacity', moves: 2 }, { phase: 'surplus', moves: 1 }]);
    expect(snapshot.byReason).toEqual([{ reason: 'family', moves: 3 }]);
    expect(snapshot.recent[0]).toMatchObject({ tick: 42, year: 2, dayInYear: 7, homeless: false });
  });

  it('keeps a bounded recent window but counts every move', () => {
    setHousingRelocationMonitorEnabled(true);
    for (let id = 0; id < 100; id += 1) {
      recordHousingRelocation({ phase: 'homeless', reason: 'assignment', members: household(id), to: 10 });
    }

    const snapshot = getHousingRelocationSnapshot();

    expect(snapshot.totalMoves).toBe(100);
    expect(snapshot.recent).toHaveLength(64);
    expect(snapshot.recent.at(-1)?.members).toEqual([99]);
  });
});

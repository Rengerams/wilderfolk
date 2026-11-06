/** The Virtual Player must use the economy owner's actual material caps, never stale save snapshots. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { building } from '../src/test/factories';
import { needsAdditionalStore } from '../src/game/virtualPlayer';

function colony(wood: number, stone: number, iron: number, gold = 0): WorldState {
  return {
    buildings: [],
    resources: { wood, stone, iron, gold, food: 0 },
    // Deliberately stale: only economy.computeStorageMax owns these limits.
    storageMax: { wood: 99_999, stone: 99_999, iron: 99_999, gold: 99_999, food: 99_999 },
  } as unknown as WorldState;
}

describe('Virtual Player material storage pressure', () => {
  it('starts at the actual 85% material threshold, not the saved capacity snapshot', () => {
    const state = colony(679, 254, 254);
    expect(needsAdditionalStore(state)).toBe(false);
    state.resources.stone = 255; // 85% of the 300 stone base cap.
    expect(needsAdditionalStore(state)).toBe(true);
  });

  it('rechecks caps after a completed Store without waiting for daily storageMax updates', () => {
    const state = colony(679, 255, 254);
    expect(needsAdditionalStore(state)).toBe(true);

    state.buildings.push(building(1, BuildingType.Store));
    expect(needsAdditionalStore(state)).toBe(false);
    state.resources.stone = 425; // 85% of the 500 stone cap with one Store.
    expect(needsAdditionalStore(state)).toBe(true);
  });

  it('does not treat unfinished or rival Stores as player capacity', () => {
    const state = colony(0, 255, 0);
    state.buildings.push(building(1, BuildingType.Store, { completed: false }));
    state.buildings.push(building(2, BuildingType.Store, { faction: 'rival' }));
    expect(needsAdditionalStore(state)).toBe(true);
  });

  it('never considers gold demand to be a reason to build a Store', () => {
    expect(needsAdditionalStore(colony(0, 0, 0, 20_000))).toBe(false);
  });
});

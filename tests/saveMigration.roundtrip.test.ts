/**
 * Regression: the autumn-migration state must survive save/load.
 * A save made mid-migration used to drop activeMigration + the herd memory
 * (whitelist miss) — the tagged deer then lingered forever as permanent extra
 * deer and next year's herd forgot the hunt. The save schema now carries
 * activeMigration / migrationNextHerdSize / migrationTag.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { HERD_BASE_SIZE, MIGRATION_WINDOW_DAYS } from '../src/game/migration';

function roundTrip(world: Parameters<typeof buildSaveData>[0]) {
  const raw = JSON.stringify(buildSaveData(world, createInitialView()));
  const parsed = parseSaveJson(raw);
  expect(parsed.valid).toBe(true);
  if (!parsed.valid || !parsed.parsed) throw new Error('save invalid');
  const loaded = loadGameFromParsed(parsed.parsed);
  expect(loaded).not.toBeNull();
  return loaded!.world;
}

describe('migration survives save/load', () => {
  it('mid-migration save keeps the active herd window and the herd memory', () => {
    const state = initGame({ villageName: 'M', size: 'small' });
    state.activeMigration = { herdYear: 3, endDay: getAbsDay(state) + MIGRATION_WINDOW_DAYS, spawned: HERD_BASE_SIZE };
    state.migrationNextHerdSize = 6;
    // A tagged herd deer still in the world
    const deer = state.entities.find((e) => e.type === EntityType.Deer);
    if (deer) deer.migrationTag = 3;

    const loaded = roundTrip(state);

    expect(loaded.activeMigration?.herdYear).toBe(3);
    expect(loaded.activeMigration?.spawned).toBe(HERD_BASE_SIZE);
    expect(loaded.migrationNextHerdSize).toBe(6);
    const loadedDeer = loaded.entities.find((e) => e.type === EntityType.Deer);
    if (deer && loadedDeer) expect(loadedDeer.migrationTag).toBe(3);
  });
});

function getAbsDay(state: ReturnType<typeof initGame>): number {
  return Math.floor(state.tick / 72);
}

/**
 * Autumn deer migration: the herd arrives on a deterministic late-autumn day, behaves like normal
 * deer, leaves after a week, and next year's size follows how many were taken.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import {
  HERD_BASE_SIZE,
  HERD_MIN_SIZE,
  HERD_MAX_SIZE,
  MIGRATION_WINDOW_DAYS,
  migrationArrivalDay,
  tickMigration,
} from '../src/game/migration';
import { DAYS_PER_YEAR, TICKS_PER_DAY, getAbsoluteCalendarDay } from '../src/game/dayCycle';
import { TerrainType } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';

type Game = ReturnType<typeof initGame>;

function makeGame(): Game {
  return initGame({ villageName: 'M', size: 'medium', seed: 42 });
}

/** Rewind the world clock to a given absolute day. */
function setDay(state: Game, day: number): void {
  state.tick = day * TICKS_PER_DAY;
}

function herdDeer(state: Game, year: number) {
  const seen = new Set<number>();
  return state.entities.filter((e) => {
    if (e.type !== EntityType.Deer || e.migrationTag !== year || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

describe('autumn deer migration', () => {
  it('arrival day is late autumn (fall, before winter) and deterministic per seed', () => {
    for (const seed of [1, 42, 999, 1234]) {
      const day = migrationArrivalDay(seed);
      expect(day).toBeGreaterThanOrEqual(240);
      expect(day).toBeLessThan(270); // fall is 180–269
      expect(migrationArrivalDay(seed)).toBe(day); // deterministic
    }
  });

  it('the herd arrives on its day with the base size and leaves after a week', () => {
    const state = makeGame();
    const seed = state.worldMap!.seed;
    const arrival = migrationArrivalDay(seed);
    // Year 1: no memory → base herd
    setDay(state, 180); // before arrival
    tickMigration(state, state.entities);
    expect(state.activeMigration).toBeUndefined();

    setDay(state, arrival);
    tickMigration(state, state.entities);
    expect(state.activeMigration?.spawned).toBe(HERD_BASE_SIZE);
    expect(herdDeer(state, 0).length).toBe(HERD_BASE_SIZE);

    // Still active mid-window
    setDay(state, arrival + 3);
    tickMigration(state, state.entities);
    expect(state.activeMigration).toBeDefined();

    // Departs at window end
    setDay(state, arrival + MIGRATION_WINDOW_DAYS);
    tickMigration(state, state.entities);
    expect(state.activeMigration).toBeUndefined();
    expect(herdDeer(state, 0).length).toBe(0);
  });

  it('hunting the herd shrinks next year\'s herd', () => {
    const state = makeGame();
    const seed = state.worldMap!.seed;
    const arrival = migrationArrivalDay(seed);
    setDay(state, arrival);
    tickMigration(state, state.entities);

    // "Hunt" 6 of the 10 herd deer
    let killed = 0;
    for (const d of herdDeer(state, 0)) {
      if (killed < 6) {
        d.alive = false;
        killed++;
      }
    }
    setDay(state, arrival + MIGRATION_WINDOW_DAYS);
    tickMigration(state, state.entities);

    expect(state.migrationNextHerdSize).toBe(HERD_BASE_SIZE - 6);
    // Next year's arrival uses the smaller herd
    setDay(state, arrival + DAYS_PER_YEAR);
    tickMigration(state, state.entities);
    expect(state.activeMigration?.spawned).toBe(HERD_BASE_SIZE - 6);
  });

  it('letting the herd pass unharmed keeps next year\'s herd intact', () => {
    const state = makeGame();
    const seed = state.worldMap!.seed;
    const arrival = migrationArrivalDay(seed);
    setDay(state, arrival);
    tickMigration(state, state.entities);
    setDay(state, arrival + MIGRATION_WINDOW_DAYS);
    tickMigration(state, state.entities);
    expect(state.migrationNextHerdSize).toBeUndefined(); // memory untouched
    setDay(state, arrival + DAYS_PER_YEAR);
    tickMigration(state, state.entities);
    expect(state.activeMigration?.spawned).toBe(HERD_BASE_SIZE);
  });

  it('herd size clamps between min and max', () => {
    const state = makeGame();
    const seed = state.worldMap!.seed;
    const arrival = migrationArrivalDay(seed);
    setDay(state, arrival);
    tickMigration(state, state.entities);
    // Kill everything
    for (const d of herdDeer(state, 0)) d.alive = false;
    setDay(state, arrival + MIGRATION_WINDOW_DAYS);
    tickMigration(state, state.entities);
    expect(state.migrationNextHerdSize).toBe(HERD_MIN_SIZE);
    expect(state.migrationNextHerdSize).toBeLessThanOrEqual(HERD_MAX_SIZE);
  });

  it('no migration outside the fall arrival day', () => {
    const state = makeGame();
    const seed = state.worldMap!.seed;
    const arrival = migrationArrivalDay(seed);
    for (const day of [60, 150, 271, 350]) {
      setDay(state, day);
      tickMigration(state, state.entities);
      expect(state.activeMigration, `day ${day}`).toBeUndefined();
    }
    void arrival;
  });

  it('clock helper sanity: getAbsoluteCalendarDay matches setDay', () => {
    const state = makeGame();
    setDay(state, 260);
    expect(getAbsoluteCalendarDay(state.tick)).toBe(260);
  });

  it('remembers the deer it actually placed, not the requested herd size', () => {
    const state = makeGame();
    // Every tile is deep water, so neither the edge strip nor the ring fallback can place a deer.
    state.worldMap = testWorldMap({
      tilesX: 128, tilesY: 96, seed: 42, tileType: () => TerrainType.DeepWater,
    });
    const arrival = migrationArrivalDay(state.worldMap.seed);
    setDay(state, arrival);
    tickMigration(state, state.entities);

    expect(state.activeMigration?.spawned, 'the requested herd was recorded').toBe(0);
    expect(herdDeer(state, 0).length).toBe(0);

    // No deer existed, so no deer were lost: the memory must not shrink toward the minimum.
    setDay(state, arrival + MIGRATION_WINDOW_DAYS);
    tickMigration(state, state.entities);
    expect(state.migrationNextHerdSize).toBeUndefined();
  });
});

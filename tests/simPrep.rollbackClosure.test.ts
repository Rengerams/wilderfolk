import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { TICKS_PER_DAY, DAYS_PER_YEAR, getCalendarDay } from '../src/game/dayCycleClock';
import type { WorldState } from '../src/game/gameTypes';

/**
 * `gameWorker.ts` wraps `gameTick` in `try { gameTick(world) } catch { applySimPrep(world, extractSimPrep(world)) }`
 * so that a failed tick is rolled back and then re-executed on the main thread
 * after `fallbackFromWorker`. That contract only holds while every field
 * `gameTick` advances is present in `SimPrepKeys` — a missing field is advanced
 * twice for the same tick.
 *
 * Regression: `populationHistory`, `yearlyStats` and `lifetimeStats` were absent
 * from the prep payload. `gameTick` pushes a year-rollover entry
 * (`gameTick.ts` "if (yearRollover)") and samples `populationHistory` every
 * `STATS_SAMPLE_INTERVAL_TICKS`; both survived the rollback, so the re-executed
 * tick produced a duplicate year entry and double-counted
 * `lifetimeStats.totalMarriages` / `totalBuildingsUpgraded`
 * (`stats.ts updateLifetimeStats` uses `+=` for those two).
 */
describe('worker prep rollback closure', () => {
  /**
   * The year boundary is `getCalendarDay` wrapping `DAYS_PER_YEAR` (360), not
   * `dayInYear` reaching `TICKS_PER_DAY`: `gameTick` requires
   * `dayInYear === 0 && getCalendarDay(tick - 1) > 0`, which is only true at the
   * start of absolute day 360 (tick 25920).
   */
  function worldAtYearBoundary(): WorldState {
    const world = initGame();
    world.tick = TICKS_PER_DAY * DAYS_PER_YEAR - 1;
    world.dayInYear = TICKS_PER_DAY - 1;
    return world;
  }

  it('deep-clones the rolling stats arrays so they cannot alias live state', () => {
    const world = worldAtYearBoundary();
    world.populationHistory.push({
      tick: 1,
      year: 0,
      grass: 0,
      rabbits: 0,
      deer: 0,
      wolves: 0,
      foxes: 0,
      humans: 0,
      werewolves: 0,
      wildkin: 0,
      buildings: 0,
    });

    const prep = extractSimPrep(world);

    expect(prep.populationHistory).toEqual(world.populationHistory);
    expect(prep.populationHistory).not.toBe(world.populationHistory);
    // In-place mutation of the live arrays must not reach into the backup.
    world.populationHistory[0].humans = 99;
    world.yearlyStats.push({ ...world.yearlyStats[0], year: 123 });
    world.lifetimeStats.totalMarriages += 5;

    expect(prep.populationHistory[0].humans).toBe(0);
    expect(prep.yearlyStats.some((entry) => entry.year === 123)).toBe(false);
    expect(prep.lifetimeStats.totalMarriages).not.toBe(world.lifetimeStats.totalMarriages);
  });

  it('restores populationHistory, yearlyStats and lifetimeStats after a real year-rollover tick', () => {
    const world = worldAtYearBoundary();
    // Seeded deliberately: TICKS_PER_DAY (72) is not a multiple of
    // STATS_SAMPLE_INTERVAL_TICKS (10), so this rollover tick does not sample on
    // its own — the sentinel proves the pre-tick sample is restored rather than
    // left behind, which is the reported symptom.
    world.populationHistory.push({
      tick: world.tick,
      year: world.year,
      grass: 0,
      rabbits: 0,
      deer: 0,
      wolves: 0,
      foxes: 0,
      humans: 7,
      werewolves: 0,
      wildkin: 0,
      buildings: 0,
    });
    const prep = extractSimPrep(world);
    const beforeMarriages = prep.lifetimeStats.totalMarriages;
    expect(getCalendarDay(world.tick)).toBe(DAYS_PER_YEAR - 1);

    gameTick(world);

    // The tick is a year boundary, so the rollover block genuinely advances the
    // stats — otherwise this test would pass vacuously.
    expect(world.year).toBe(prep.year + 1);
    expect(world.yearlyStats.length).toBe(prep.yearlyStats.length + 1);
    expect(world.lifetimeStats.totalMarriages).toBeGreaterThan(beforeMarriages);

    applySimPrep(world, prep);

    expect(world.tick).toBe(TICKS_PER_DAY * DAYS_PER_YEAR - 1);
    expect(world.year).toBe(prep.year);
    expect(world.populationHistory).toEqual(prep.populationHistory);
    expect(world.populationHistory).toHaveLength(1);
    expect(world.populationHistory[0].humans).toBe(7);
    expect(world.yearlyStats).toEqual(prep.yearlyStats);
    expect(world.lifetimeStats).toEqual(prep.lifetimeStats);
    expect(world.ecoHealthYearsAbove80).toEqual(prep.ecoHealthYearsAbove80);
    expect(world.eventsThisYear).toEqual(prep.eventsThisYear);
  });

  it('round-trips every field the prep payload claims to own', () => {
    const world = initGame();
    const prep = extractSimPrep(world);
    gameTick(world);

    applySimPrep(world, prep);

    // `extractSimPrep` must be inverse across the whole payload, because the worker
    // applies exactly this payload to undo a failed tick.
    expect(extractSimPrep(world)).toEqual(prep);

    // ...and `applySimPrep` must actually write every key it claims, not merely
    // leave the payload unused: a field the applier ignores is exactly the bug.
    for (const key of Object.keys(prep) as (keyof typeof prep)[]) {
      const claimed = prep[key];
      const poisoned = Array.isArray(claimed)
        ? []
        : claimed !== null && typeof claimed === 'object'
          // Only the top level needs poisoning; nested values are compared below.
          ? {}
          : Symbol('poison');

      (world as unknown as Record<string, unknown>)[key] = poisoned;
      applySimPrep(world, prep);

      expect(world[key], `applySimPrep must restore "${key}"`).toEqual(claimed);
    }
  });
});
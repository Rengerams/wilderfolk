/**
 * Death statistics report real numbers.
 *
 * `recordYearlyStats` counted deaths by filtering `!e.alive` out of `state.entities`, but
 * `gameTick` has already rebuilt that array from the living entities by the time the year
 * closes — so `YearlyStats.deaths.humans/animals` and `lifetimeStats.totalHumansDied` (the
 * "Humans Died" row in the Statistics panel) were permanently **0**. The old code also
 * subtracted the previous year's *per-year* count from that cumulative-looking total, a unit
 * mismatch that was masked by both sides being zero.
 *
 * Deaths are now tallied per tick by `gameTick`, from the entities that were alive at the start
 * of the tick and are not alive at the end of it: exact, and independent of when the array is
 * rebuilt. The tally accumulates for the year and is read by `recordYearlyStats`.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { recordYearlyStats, updateLifetimeStats } from '../src/game/stats';

const FIXTURE_SEED = 20240913;

const isAnimal = (entity: Entity): boolean =>
  entity.type !== EntityType.Human && entity.type !== EntityType.Tree && entity.type !== EntityType.Grass;

describe('the per-tick death tally matches what actually died', () => {
  it('counts the entities that were alive at the start of the tick and are not alive now', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    // Land on a colony-day boundary so both the systems and daily layers run.
    state.tick = TICKS_PER_DAY - 1;
    const watched = state.entities.slice();

    // Deterministic wildlife death: the systems layer drains energy and kills at or below 0.
    const rabbit = watched.find((entity) => entity.type === EntityType.Rabbit);
    expect(rabbit).toBeDefined();
    rabbit!.energy = -10;

    gameTick(state);

    const diedHumans = watched.filter((entity) => entity.type === EntityType.Human && !entity.alive).length;
    const diedAnimals = watched.filter((entity) => isAnimal(entity) && !entity.alive).length;

    expect(diedAnimals).toBeGreaterThan(0);
    expect(state.deathsThisYear?.humans ?? 0).toBe(diedHumans);
    expect(state.deathsThisYear?.animals ?? 0).toBe(diedAnimals);
  });
});

describe('the yearly record and the lifetime total read the tally', () => {
  it('reports the accumulated deaths instead of zero', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.deathsThisYear = { humans: 7, animals: 12 };
    state.tick = TICKS_PER_DAY * 5;

    const yearly = recordYearlyStats(state, state.year);
    expect(yearly.deaths).toEqual({ humans: 7, animals: 12 });

    state.yearlyStats.push(yearly);
    const lifetime = updateLifetimeStats(state, state.lifetimeStats);
    expect(lifetime.totalHumansDied).toBe(7);
  });

  it('sums the yearly records so the lifetime total survives a reload', () => {
    const state: WorldState = initGame({ seed: FIXTURE_SEED });
    state.yearlyStats = [
      { ...recordYearlyStats(state, 0), year: 0, deaths: { humans: 3, animals: 1 } },
      { ...recordYearlyStats(state, 1), year: 1, deaths: { humans: 4, animals: 2 } },
    ];

    const lifetime = updateLifetimeStats(state, state.lifetimeStats);

    expect(lifetime.totalHumansDied).toBe(7);
  });
});
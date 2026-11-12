/**
 * `totalResourcesGathered` follows `addResource`'s accepted gain (four keys, no iron), and
 * `mostProductiveYear` is settled at the year boundary.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { addResource } from '../src/game/resourceUtils';
import { recordYearlyStats, updateLifetimeStats } from '../src/game/stats';
import { EntityType } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';

const FIXTURE_SEED = 20_260_929;

describe('lifetime gathering is recorded where storage accepts it', () => {
  it('adds each accepted gain to the matching resource', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    expect(state.lifetimeStats.totalResourcesGathered).toEqual({ wood: 0, stone: 0, food: 0, gold: 0 });

    addResource(state, 'wood', 120);
    addResource(state, 'food', 45);
    addResource(state, 'stone', 7);

    expect(state.lifetimeStats.totalResourcesGathered).toEqual({
      wood: 120,
      stone: 7,
      food: 45,
      gold: 0,
    });
  });

  it('records the amount storage accepted, not the amount offered', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    // Half of the offered wood fits, so the record must move by exactly the accepted half.
    state.resources.wood = state.storageMax.wood - 50;

    expect(addResource(state, 'wood', 200)).toBe(50);
    expect(state.lifetimeStats.totalResourcesGathered.wood).toBe(50);
  });

  it('leaves the record alone when nothing is accepted, and never records iron', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.resources.gold = state.storageMax.gold;

    expect(addResource(state, 'gold', 500)).toBe(0);
    addResource(state, 'wood', 0);
    addResource(state, 'wood', -30);
    addResource(state, 'iron', 25);

    expect(state.lifetimeStats.totalResourcesGathered).toEqual({ wood: 0, stone: 0, food: 0, gold: 0 });
  });
});

describe('the most productive year is settled at the year boundary', () => {
  it('takes the year with the most completions, not the latest one', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.yearlyStats = [
      { ...recordYearlyStats(state, 0), year: 0, buildings: { completed: 12, total: 12, upgraded: 0, upgradedTotal: 0 } },
      { ...recordYearlyStats(state, 1), year: 1, buildings: { completed: 40, total: 52, upgraded: 0, upgradedTotal: 0 } },
      { ...recordYearlyStats(state, 2), year: 2, buildings: { completed: 3, total: 55, upgraded: 0, upgradedTotal: 0 } },
    ];

    const lifetime = updateLifetimeStats(state, state.lifetimeStats);

    expect(lifetime.mostProductiveYear).toEqual({ year: 1, buildings: 40 });
  });

  it('keeps the empty record when no year completed a building', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.yearlyStats = [
      { ...recordYearlyStats(state, 0), year: 0, buildings: { completed: 0, total: 0, upgraded: 0, upgradedTotal: 0 } },
    ];

    const lifetime = updateLifetimeStats(state, state.lifetimeStats);

    expect(lifetime.mostProductiveYear).toEqual({ year: 0, buildings: 0 });
  });
});

describe('lifetime births and deaths stay monotonic past the 50-year window', () => {
  it('carries the newest year forward instead of re-deriving a shrinking window', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    const yearStat = (year: number) => ({
      ...recordYearlyStats(state, year),
      year,
      births: { humans: 2, animals: 0 },
      deaths: { humans: 1, animals: 0 },
    });
    state.yearlyStats = Array.from({ length: 50 }, (_, year) => yearStat(year));

    const before = updateLifetimeStats(state, state.lifetimeStats);
    expect(before.totalHumansBorn).toBe(100);
    expect(before.totalHumansDied).toBe(50);

    // The year rollover pushes the closing year, then `gameTick` drops the oldest of the 50.
    state.yearlyStats.push(yearStat(50));
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    const after = updateLifetimeStats(state, before);

    expect(after.totalHumansBorn).toBe(102);
    expect(after.totalHumansDied).toBe(51);
  });
});

describe('the longest life belongs to a player settler', () => {
  it('never credits a rival human with more years', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    for (const entity of state.entities) {
      if (entity.type === EntityType.Human && isPlayerHuman(entity)) entity.age = 30;
    }
    const player = state.entities.find((entity) => entity.type === EntityType.Human && isPlayerHuman(entity))!;
    player.age = 40;
    player.name = 'Mara';
    player.surname = 'Vale';
    state.entities.push({
      ...player,
      id: state.nextEntityId++,
      age: 99,
      name: 'Rival',
      surname: 'Camp',
      faction: 'rival',
      alive: true,
    });

    const lifetime = updateLifetimeStats(state, state.lifetimeStats);

    expect(lifetime.longestLivingHuman.age).toBe(40);
    expect(lifetime.longestLivingHuman.name).not.toContain('Rival');
  });
});

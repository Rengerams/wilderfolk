import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { EntityType, BuildingType } from '@/game/gameTypes';
import { createEntity, setEntityBirthDate } from '@/game/worldGen';
import { isPlayerHuman } from '@/game/groupEvents';

import {
  createEmptyLifetimeStats,
  recordYearlyStats,
  trackYearEvent,
  updateLifetimeStats,
} from '@/game/stats';

function emptyYearlyPopulation() {
  return {
    humans: 0,
    rabbits: 0,
    deer: 0,
    wolves: 0,
    foxes: 0,
    trees: 0,
  };
}

describe('recordYearlyStats', () => {
  it('computes marriages from marriedCount delta, not total population', () => {
    const state = initGame();
    state.year = 2;
    const baselineMarried = state.entities.filter(
      (e) => e.type === EntityType.Human && isPlayerHuman(e) && e.relationshipStatus === 'married',
    ).length;
    state.yearlyStats = [{
      year: 1,
      population: emptyYearlyPopulation(),
      births: { humans: 0, animals: 0 },
      deaths: { humans: 0, animals: 0 },
      marriages: 0,
      marriedCount: baselineMarried,
      buildings: { completed: 0, total: 0, upgraded: 0 },
      resources: state.resources,
      ecosystem: { health: 100, pollution: 0, biodiversity: 1 },
      events: [],
    }];

    const h1 = createEntity(EntityType.Human, 10, 10, 9001, 200, false, { gender: 'male' });
    const h2 = createEntity(EntityType.Human, 20, 10, 9002, 200, false, { gender: 'female' });
    const h3 = createEntity(EntityType.Human, 30, 10, 9003, 200, false, { gender: 'male' });
    const h4 = createEntity(EntityType.Human, 40, 10, 9004, 200, false, { gender: 'female' });
    h1.relationshipStatus = 'married';
    h2.relationshipStatus = 'married';
    h3.relationshipStatus = 'married';
    h4.relationshipStatus = 'married';
    state.entities.push(h1, h2, h3, h4);

    const stats = recordYearlyStats(state);
    expect(stats.marriages).toBe(2);
    expect(stats.marriedCount).toBe(baselineMarried + 4);
  });

  it('ignores founding wildlife (birthYear -1 sentinel) in year 0 animal births', () => {
    const state = initGame();
    state.year = 0;
    const founding = state.entities.filter((e) => e.type === EntityType.Rabbit);
    expect(founding.length).toBeGreaterThan(0);
    expect(founding.every((e) => e.birthYear === -1)).toBe(true);
    const stats = recordYearlyStats(state);
    expect(stats.births.animals).toBe(0);
  });

  it('counts animal births by birthYear, not age window', () => {
    const state = initGame();
    state.year = 3;
    const youngOld = createEntity(EntityType.Rabbit, 5, 5, 8001, 100);
    setEntityBirthDate(youngOld, 1);
    youngOld.age = 5;
    const bornThisYear = createEntity(EntityType.Rabbit, 15, 5, 8002, 100);
    setEntityBirthDate(bornThisYear, 3);
    bornThisYear.age = 2;
    state.entities.push(youngOld, bornThisYear);

    const stats = recordYearlyStats(state);
    expect(stats.births.animals).toBe(1);
  });

  it('reports yearly building upgrades as a delta', () => {
    const state = initGame();
    state.year = 2;
    state.yearlyStats = [{
      year: 1,
      population: emptyYearlyPopulation(),
      births: { humans: 0, animals: 0 },
      deaths: { humans: 0, animals: 0 },
      marriages: 0,
      marriedCount: 0,
      buildings: { completed: 1, total: 1, upgraded: 2 },
      resources: state.resources,
      ecosystem: { health: 100, pollution: 0, biodiversity: 1 },
      events: [],
    }];
    state.buildings.push({
      id: 1,
      type: BuildingType.House,
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 3,
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    const stats = recordYearlyStats(state);
    expect(stats.buildings.upgraded).toBe(0);
  });

  it('flushes eventsThisYear into yearly stats', () => {
    const state = initGame();
    state.year = 1;
    state.eventsThisYear = ['Harvest Festival', 'Wolf Pack'];
    const stats = recordYearlyStats(state);
    expect(stats.events).toEqual(['Harvest Festival', 'Wolf Pack']);
  });

  it('uses wildlifeCounts for animal population instead of scanning entities', () => {
    const state = initGame();
    state.wildlifeCounts = {
      grass: 99,
      rabbits: 11,
      deer: 7,
      wolves: 3,
      foxes: 2,
      werewolves: 0,
      wildkin: 0,
      trees: 42,
    };
    const stats = recordYearlyStats(state);
    expect(stats.population.rabbits).toBe(11);
    expect(stats.population.deer).toBe(7);
    expect(stats.population.wolves).toBe(3);
    expect(stats.population.foxes).toBe(2);
    expect(stats.population.trees).toBe(42);
  });
});

describe('trackYearEvent', () => {
  it('deduplicates titles within the same year', () => {
    const state = initGame();
    trackYearEvent(state, 'Drought');
    trackYearEvent(state, 'Drought');
    expect(state.eventsThisYear).toEqual(['Drought']);
  });
});

describe('updateLifetimeStats', () => {
  it('sums human births from yearly stats instead of live population', () => {
    const state = initGame();
    state.yearlyStats = [
      {
        year: 1,
        population: emptyYearlyPopulation(),
        births: { humans: 2, animals: 0 },
        deaths: { humans: 0, animals: 0 },
        marriages: 0,
        marriedCount: 0,
        buildings: { completed: 0, total: 0, upgraded: 0 },
        resources: state.resources,
        ecosystem: { health: 100, pollution: 0, biodiversity: 1 },
        events: [],
      },
      {
        year: 2,
        population: emptyYearlyPopulation(),
        births: { humans: 3, animals: 1 },
        deaths: { humans: 0, animals: 0 },
        marriages: 0,
        marriedCount: 0,
        buildings: { completed: 0, total: 0, upgraded: 0 },
        resources: state.resources,
        ecosystem: { health: 100, pollution: 0, biodiversity: 1 },
        events: [],
      },
    ];
    const immigrant = createEntity(EntityType.Human, 0, 0, 9000, 200, false);
    state.entities.push(immigrant);

    const next = updateLifetimeStats(state, createEmptyLifetimeStats());
    expect(next.totalHumansBorn).toBe(5);
  });

  it('accumulates marriages and upgrades from the latest yearly record', () => {
    const state = initGame();
    state.yearlyStats = [{
      year: 1,
      population: emptyYearlyPopulation(),
      births: { humans: 0, animals: 0 },
      deaths: { humans: 0, animals: 0 },
      marriages: 2,
      marriedCount: 4,
      buildings: { completed: 0, total: 0, upgraded: 1 },
      resources: state.resources,
      ecosystem: { health: 100, pollution: 0, biodiversity: 1 },
      events: [],
    }];
    const next = updateLifetimeStats(state, createEmptyLifetimeStats());
    expect(next.totalMarriages).toBe(2);
    expect(next.totalBuildingsUpgraded).toBe(1);
  });
});
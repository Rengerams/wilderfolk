import { describe, expect, it } from 'vitest';
import { BuildingType, BUILDING_CONFIGS } from '@/game/gameTypes';
import { freshState, makeAdultSettler } from '@/test/fixtures/gameFixtures';
import {
  getOpenBeds,
  getPopulationGrowthReport,
  getTotalBeds,
} from '@/game/populationGrowth';

describe('getTotalBeds', () => {
  it('excludes rival faction residences', () => {
    const state = freshState();
    const cfg = BUILDING_CONFIGS[BuildingType.House];
    state.buildings.push({
      id: 50,
      type: BuildingType.House,
      x: 400,
      y: 200,
      width: cfg.width,
      height: cfg.height,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: 'rival',
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    const playerBeds = state.buildings
      .filter((b) => b.completed && b.faction !== 'rival' && (b.type === BuildingType.House || b.type === BuildingType.Mansion))
      .reduce((sum, b) => sum + BUILDING_CONFIGS[b.type].maxOccupants + (b.level - 1) * 2, 0);

    expect(getTotalBeds(state)).toBe(playerBeds);
  });
});

describe('getPopulationGrowthReport', () => {
  it('warns when settlers exceed beds even with adequate food', () => {
    const state = freshState();
    state.resources.food = 500;
    state.buildings = state.buildings.filter((b) => !b.completed || b.type !== BuildingType.House);
    state.entities = Array.from({ length: 7 }, (_, i) => makeAdultSettler(i + 1));

    const report = getPopulationGrowthReport(state);

    expect(getTotalBeds(state)).toBe(0);
    expect(7).toBeGreaterThan(getTotalBeds(state));
    expect(report.tone).toBe('warn');
    expect(report.headline).toBe('Overcrowded — build housing');
    expect(report.detail).toContain('housing is the bottleneck');
  });

  it('mentions paused immigration when the game is frozen', () => {
    const state = freshState();
    state.paused = true;

    const report = getPopulationGrowthReport(state);

    expect(report.reasons.some((r) => r.includes('paused'))).toBe(true);
  });

  it('warns on overcrowding even with high food and reputation', () => {
    const state = freshState();
    state.resources.food = 500;
    state.villageReputation = 80;
    state.buildings = state.buildings.filter((b) => !b.completed || b.type !== BuildingType.House);
    state.entities = Array.from({ length: 5 }, (_, i) => makeAdultSettler(i + 1));

    const report = getPopulationGrowthReport(state);

    expect(getTotalBeds(state)).toBe(0);
    expect(report.tone).toBe('warn');
    expect(report.headline).toBe('Overcrowded — build housing');
  });

  it('does not treat rival housing as player open beds', () => {
    const state = freshState();
    const before = getOpenBeds(state);
    const cfg = BUILDING_CONFIGS[BuildingType.Mansion];
    state.buildings.push({
      id: 60,
      type: BuildingType.Mansion,
      x: 500,
      y: 200,
      width: cfg.width,
      height: cfg.height,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: 'rival',
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    expect(getOpenBeds(state)).toBe(before);
  });
});
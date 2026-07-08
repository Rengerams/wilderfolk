import { describe, expect, it } from 'vitest';
import { BuildingType, BUILDING_CONFIGS } from '@/game/gameTypes';
import { freshState, makeAdultSettler } from '@/test/fixtures/gameFixtures';
import {
  getOpenBeds,
  getOpenBedsFromPop,
  getPopulationGrowthReport,
  getTotalBeds,
  snapshotPopulation,
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

  it('includes food warning in detail when paused and stores are low', () => {
    const state = freshState();
    state.paused = true;
    state.resources.food = 10;

    const report = getPopulationGrowthReport(state);

    expect(report.detail).toContain('frozen while the game is paused');
    expect(report.detail).toContain('Low food (10🍖)');
  });

  it('includes overcrowding in detail when paused and overcrowded', () => {
    const state = freshState();
    state.paused = true;
    state.resources.food = 500;
    state.buildings = state.buildings.filter((b) => !b.completed || b.type !== BuildingType.House);
    state.entities = Array.from({ length: 6 }, (_, i) => makeAdultSettler(i + 1));

    const report = getPopulationGrowthReport(state);

    expect(report.detail).toContain('frozen while the game is paused');
    expect(report.detail).toContain('housing is the bottleneck');
  });

  it('warns on missing food amount as zero stores', () => {
    const state = freshState();
    state.resources = { ...state.resources, food: undefined as never };

    const report = getPopulationGrowthReport(state);

    expect(report.reasons.some((r) => r.includes('Low food (0🍖)'))).toBe(true);
    expect(report.tone).toBe('warn');
  });

  it('uses mansion bed capacity in blocked cap copy, not hardcoded +4', () => {
    const state = freshState();
    state.maxHumanPopulation = 3;
    state.entities = Array.from({ length: 3 }, (_, i) => makeAdultSettler(i + 1));

    const report = getPopulationGrowthReport(state);

    expect(report.reasons.some((r) => r.includes('mansions ~8 beds'))).toBe(true);
    expect(report.reasons.some((r) => r.includes('+4 each'))).toBe(false);
  });

  it('clamps fractional cap slots in detail', () => {
    const state = freshState();
    state.maxHumanPopulation = 8.3;
    state.entities = Array.from({ length: 3 }, (_, i) => makeAdultSettler(i + 1));
    state.paused = false;
    state.resources.food = 500;
    state.villageReputation = 80;

    const report = getPopulationGrowthReport(state);

    expect(report.detail).not.toMatch(/-\d/);
    expect(report.detail).toContain('5');
    expect(report.detail).not.toContain('-0');
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

describe('getOpenBedsFromPop', () => {
  it('ignores inflated pop counts that include non-player humans', () => {
    const state = freshState();
    const livePop = snapshotPopulation(state).pop;
    const inflatedPop = livePop + 5;

    expect(getOpenBedsFromPop(state, inflatedPop)).toBe(getOpenBeds(state));
  });

  it('ignores deflated pop counts that omit live settlers', () => {
    const state = freshState();
    const livePop = snapshotPopulation(state).pop;
    if (livePop === 0) return;

    expect(getOpenBedsFromPop(state, 0)).toBe(getOpenBeds(state));
  });
});

describe('snapshotPopulation cache', () => {
  it('reuses the snapshot within the same tick across helpers', () => {
    const state = freshState();
    state.tick = 42;

    const first = snapshotPopulation(state);
    const second = snapshotPopulation(state);

    expect(second).toBe(first);
    expect(getTotalBeds(state)).toBe(first.beds);
    expect(getOpenBeds(state)).toBe(Math.max(0, first.beds - first.pop));
  });
});
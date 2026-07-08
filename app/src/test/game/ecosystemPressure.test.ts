import { describe, expect, it } from 'vitest';
import { EntityType, Season, WeatherType } from '@/game/gameTypes';
import type { Entity, WorldState } from '@/game/gameTypes';
import { TICKS_PER_DAY } from '@/game/dayCycle';
import {
  GRASS_GROWTH_PER_TICK,
  GRAZE_BITE_ENERGY,
  GRAZER_METABOLISM,
  grazerGrassEnergyDemandPerDay,
} from '@/game/grassEcology';
import { getGrazingPressureReport } from '@/game/ecosystemPressure';
import { createEntity } from '@/game/worldGen';

function minimalWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    width: 200,
    height: 200,
    entities: [],
    season: Season.Spring,
    weather: WeatherType.Clear,
    wildlifeCounts: {
      grass: 0,
      rabbits: 0,
      deer: 0,
      wolves: 0,
      foxes: 0,
      werewolves: 0,
      wildkin: 0,
      trees: 0,
    },
    ...overrides,
  } as WorldState;
}

function grassAt(energy: number, id = 1): Entity {
  const grass = createEntity(EntityType.Grass, 10, 10, id, energy);
  grass.energy = energy;
  return grass;
}

describe('getGrazingPressureReport', () => {
  it('uses wildlifeCounts instead of scanning the full entity array for grazers', () => {
    const deer = createEntity(EntityType.Deer, 0, 0, 1, 250);
    const world = minimalWorld({
      entities: [deer],
      wildlifeCounts: {
        grass: 500,
        rabbits: 0,
        deer: 12,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 3,
        trees: 0,
      },
    });

    const report = getGrazingPressureReport(world);
    expect(report.deerCount).toBe(12);
    expect(report.wildkinCount).toBe(3);
    expect(report.grazingDemandPerDay).toBeGreaterThan(0);
  });

  it('includes Wildkin grazing demand in metabolism-based units', () => {
    const winterPenalty = 0;
    const deerOnly = grazerGrassEnergyDemandPerDay(
      GRAZER_METABOLISM.deer.energyLossPerTick,
      GRAZER_METABOLISM.deer.grassEnergyGain,
      winterPenalty,
    );
    const wildkinOnly = grazerGrassEnergyDemandPerDay(
      GRAZER_METABOLISM.wildkin.energyLossPerTick,
      GRAZER_METABOLISM.wildkin.grassEnergyGain,
      winterPenalty,
    );

    const world = minimalWorld({
      wildlifeCounts: {
        grass: 200,
        rabbits: 0,
        deer: 1,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 1,
        trees: 0,
      },
      entities: [grassAt(60, 1), grassAt(100, 2)],
    });

    const report = getGrazingPressureReport(world);
    expect(report.grazingDemandPerDay).toBe(Math.round(deerOnly + wildkinOnly));
    expect(report.grazingDemandPerDay).toBeGreaterThan(GRAZE_BITE_ENERGY);
  });

  it('only counts grass below max energy toward recovery', () => {
    const world = minimalWorld({
      wildlifeCounts: {
        grass: 2,
        rabbits: 0,
        deer: 0,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 0,
        trees: 0,
      },
      entities: [grassAt(100, 1), grassAt(40, 2)],
    });

    const report = getGrazingPressureReport(world);
    expect(report.growingGrassCount).toBe(1);
    expect(report.grassRecoveryPerDay).toBe(
      Math.round(GRASS_GROWTH_PER_TICK * 1.8 * TICKS_PER_DAY),
    );
  });

  it('does not warn about missing wolves when pasture is abundant', () => {
    const world = minimalWorld({
      wildlifeCounts: {
        grass: 10_000,
        rabbits: 0,
        deer: 4,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 0,
        trees: 0,
      },
      entities: Array.from({ length: 20 }, (_, i) => grassAt(80, i + 1)),
    });

    const report = getGrazingPressureReport(world);
    expect(report.level).toBe('stable');
    expect(report.advice).not.toContain('No wolves yet');
  });

  it('stays stable in winter when pasture patches are abundant', () => {
    const world = minimalWorld({
      season: Season.Winter,
      wildlifeCounts: {
        grass: 400,
        rabbits: 0,
        deer: 6,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 0,
        trees: 0,
      },
      entities: Array.from({ length: 20 }, (_, i) => grassAt(80, i + 1)),
    });

    const report = getGrazingPressureReport(world);
    expect(report.level).toBe('stable');
    expect(report.advice).not.toContain('wolf');
  });

  it('aligns overgrazing advice with the critical deer:grass threshold', () => {
    const caution = minimalWorld({
      wildlifeCounts: {
        grass: 90,
        rabbits: 0,
        deer: 7,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 0,
        trees: 0,
      },
      entities: [grassAt(70, 1)],
    });
    expect(getGrazingPressureReport(caution).advice).not.toContain('Too many deer');

    const critical = minimalWorld({
      wildlifeCounts: {
        grass: 70,
        rabbits: 0,
        deer: 8,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 0,
        trees: 0,
      },
      entities: [grassAt(70, 1)],
    });
    expect(getGrazingPressureReport(critical).advice).toContain('Too many deer');
  });
});
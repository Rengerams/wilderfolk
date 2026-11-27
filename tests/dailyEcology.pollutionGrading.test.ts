/**
 * Pollution grades with settlement size: the population term no longer pins every mid-size colony
 * at the 100 cap, and a Wildlife Preserve damps the score.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { getEcosystemBreakdown } from '../src/game/ecoBreakdown';
import { calculateEcosystemMetrics, tickEcosystemMetrics } from '../src/game/dailyEcology';
import { BuildingType } from '../src/game/gameTypes';
import type { EcosystemCounts } from '../src/game/dailyEcology';
import type { Building, WorldState } from '../src/game/gameTypes';
import { building } from '../src/test/factories';

function counts(humans: number): EcosystemCounts {
  return {
    humans, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0,
    grass: 0, trees: 0,
  };
}

function world(buildings: Building[] = []): WorldState {
  return { unlockedTechs: [], buildings } as unknown as WorldState;
}

const pollutionAt = (humans: number, buildings: Building[] = []): number =>
  calculateEcosystemMetrics(world(buildings), counts(humans), buildings).pollutionLevel;

describe('pollution grading', () => {
  it('grades 300 / 1,000 / 2,500 settlers instead of pinning every colony at 100', () => {
    const small = pollutionAt(300);
    const medium = pollutionAt(1_000);
    const large = pollutionAt(2_500);
    expect(small).toBe(12);
    expect(medium).toBe(40);
    expect(large).toBe(100);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it('lets a Wildlife Preserve damp the whole score', () => {
    const preserves = [
      building(1, BuildingType.WildlifePreserve),
      building(2, BuildingType.WildlifePreserve),
    ];
    expect(pollutionAt(1_000, preserves)).toBeLessThan(pollutionAt(1_000));
  });
});

describe('M6 — the Nature-tab breakdown shares the ecosystem-health owner', () => {
  it('explains the recorded Health with the owner formula, preserves and all six species', () => {
    const state = initGame({ size: 'medium', seed: 20240913 });
    state.buildings = [
      building(1, BuildingType.House, { x: 100, y: 100 }),
      building(2, BuildingType.WildlifePreserve, { x: 200, y: 200 }),
    ];
    state.humanPopulation = 0;
    state.unlockedTechs = [];
    state.wildlifeCounts = {
      grass: 0,
      rabbits: 40,
      deer: 0,
      wolves: 0,
      foxes: 0,
      werewolves: 4,
      wildkin: 4,
      trees: 0,
    };

    const counts = { ...state.wildlifeCounts, humans: 0, visitorHumans: 0, rivalHumans: 0 };
    tickEcosystemMetrics(state, counts, state.buildings);

    const breakdown = getEcosystemBreakdown(state);
    const metrics = calculateEcosystemMetrics(state, counts, state.buildings);
    const preserveLine = breakdown.lines.find((line) => line.label === 'Wildlife preserves');
    const lineTotal = breakdown.lines.reduce((total, line) => total + line.delta, 0);

    // Owner: 100 base − 4 footprint + 4 preserve − 2 wildlife (48/80 ratio) = 98.
    expect(state.ecosystemHealth).toBe(98);
    expect(metrics.totalWildlife).toBe(48);
    // The breakdown counts moon howlers and wildkin, not just the four prey/predator species.
    expect(breakdown.wildlifeCount).toBe(48);
    // ...and it reports the preserve bonus the build panel advertises.
    expect(preserveLine?.delta).toBe(4);
    // The card's two Health numbers are the same owner value, and the lines sum to it.
    expect(breakdown.health).toBe(state.ecosystemHealth);
    expect(lineTotal).toBe(state.ecosystemHealth);
  });
});

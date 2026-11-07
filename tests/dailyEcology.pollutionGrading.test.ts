/**
 * Pollution grades with settlement size: the population term no longer pins every mid-size colony
 * at the 100 cap, and a Wildlife Preserve damps the score.
 */
import { describe, expect, it } from 'vitest';
import { calculateEcosystemMetrics } from '../src/game/dailyEcology';
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

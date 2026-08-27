import { describe, expect, it } from 'vitest';
import type { PopulationCounts } from '../src/game/entityCounts';
import { calculateBiodiversityIndex } from '../src/game/dailyEcology';

function counts(overrides: Partial<PopulationCounts>): PopulationCounts {
  return {
    humans: 0,
    rabbits: 0,
    deer: 0,
    wolves: 0,
    foxes: 0,
    ...overrides,
  } as PopulationCounts;
}

describe('daily ecology biodiversity index', () => {
  it('remains zero without wildlife and reaches the expected entropy for an even four-species population', () => {
    expect(calculateBiodiversityIndex(counts({}))).toBe(0);
    expect(calculateBiodiversityIndex(counts({ rabbits: 10, deer: 10, wolves: 10, foxes: 10 })))
      .toBeCloseTo(Math.log(4));
  });

  it('continues to reward a more balanced wildlife distribution', () => {
    const concentrated = calculateBiodiversityIndex(counts({ rabbits: 40 }));
    const distributed = calculateBiodiversityIndex(counts({ rabbits: 20, deer: 20 }));

    expect(distributed).toBeGreaterThan(concentrated);
  });
});

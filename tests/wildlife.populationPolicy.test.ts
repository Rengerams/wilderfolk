import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { computeWildlifeCounts } from '../src/game/entityCounts';
import { initGame, replenishDepletedWildlife } from '../src/game/worldGen';
import {
  WILDLIFE_POPULATION_POLICY,
  wildlifeBreedingCeiling,
  wildlifeMayHuntRabbit,
} from '../src/game/wildlifePopulationPolicy';

describe('wildlife population policy', () => {
  it('keeps every replenishment target within the same breeding ceiling shown by the UI', () => {
    for (const [type, policy] of Object.entries(WILDLIFE_POPULATION_POLICY)) {
      expect(policy.replenishMinimum).toBeGreaterThan(0);
      expect(policy.replenishTarget).toBeGreaterThanOrEqual(policy.replenishMinimum);
      expect(policy.replenishTarget).toBeLessThanOrEqual(policy.breedingCeiling);
      expect(wildlifeBreedingCeiling(type as EntityType)).toBe(policy.breedingCeiling);
    }
    // Wildkin retains the pre-existing fallback ceiling.
    expect(wildlifeBreedingCeiling(EntityType.Wildkin)).toBe(35);
  });

  it('protects scarce rabbits from wild predators until the herd recovers', () => {
    const floor = WILDLIFE_POPULATION_POLICY[EntityType.Rabbit].replenishMinimum;
    expect(wildlifeMayHuntRabbit(0)).toBe(false);
    expect(wildlifeMayHuntRabbit(floor)).toBe(false);
    expect(wildlifeMayHuntRabbit(floor + 1)).toBe(true);
  });

  it('gives a wolf more than a day of basal energy per rabbit instead of driving repeat kills', () => {
    const wolf = SPECIES_CONFIG[EntityType.Wolf];
    expect(wolf.energyGain.rabbit).toBeGreaterThan(wolf.energyLossPerTick * TICKS_PER_DAY);
  });

  it('repopulates an extinct rabbit herd in the existing wildlife-spawn owner', () => {
    const state = initGame({ seed: 20261122 });
    for (const entity of state.entities) {
      if (entity.type === EntityType.Rabbit) entity.alive = false;
    }
    state.wildlifeCounts = computeWildlifeCounts(state.entities);
    expect(state.wildlifeCounts.rabbits).toBe(0);
    expect(replenishDepletedWildlife(state)).toBe(true);
    expect(state.wildlifeCounts.rabbits).toBeGreaterThan(0);
    expect(state.wildlifeCounts.rabbits).toBeLessThanOrEqual(16);
    expect(state.wildlifeCounts.wolves).toBeLessThanOrEqual(
      WILDLIFE_POPULATION_POLICY[EntityType.Wolf].replenishTarget,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { WILDLIFE_POPULATION_POLICY, getWildlifeCarryingCapacity } from '../src/game/speciesConfig';
import { computeWildlifeCounts } from '../src/game/entityCounts';
import { initGame, replenishDepletedWildlife } from '../src/game/worldGen';

describe('wildlife population balance', () => {
  it('never sets replenishment targets above the breeding ceilings', () => {
    for (const rule of Object.values(WILDLIFE_POPULATION_POLICY)) {
      expect(rule.replenishTo).toBeLessThanOrEqual(rule.breedingCap);
      expect(rule.replenishBelow).toBeLessThan(rule.replenishTo);
    }
  });

  it('cannot breed predators without prey and scales their capacities with prey', () => {
    const empty = { rabbits: 0, deer: 0, foxes: 0 };
    expect(getWildlifeCarryingCapacity(EntityType.Fox, empty)).toBe(0);
    expect(getWildlifeCarryingCapacity(EntityType.Wolf, empty)).toBe(0);
    expect(getWildlifeCarryingCapacity(EntityType.Fox, { ...empty, rabbits: 54 })).toBe(6);
    expect(getWildlifeCarryingCapacity(EntityType.Wolf, { rabbits: 55, deer: 20, foxes: 6 })).toBe(4);
    expect(getWildlifeCarryingCapacity(EntityType.Rabbit, empty))
      .toBe(WILDLIFE_POPULATION_POLICY[EntityType.Rabbit].breedingCap);
  });

  it('restocks depleted grazers without inventing predators before prey exists', () => {
    const state = initGame({ size: MapSize.Small, seed: 12345, skipTerrain: true });
    for (const animal of state.entities) {
      if ([EntityType.Rabbit, EntityType.Deer, EntityType.Fox, EntityType.Wolf].includes(animal.type)) {
        animal.alive = false;
      }
    }
    state.wildlifeCounts = computeWildlifeCounts(state.entities);

    expect(state.wildlifeCounts.rabbits).toBe(0);
    expect(state.wildlifeCounts.deer).toBe(0);
    expect(state.wildlifeCounts.wolves).toBe(0);
    expect(state.wildlifeCounts.foxes).toBe(0);

    replenishDepletedWildlife(state);

    expect(state.wildlifeCounts.rabbits).toBeGreaterThan(0);
    expect(state.wildlifeCounts.deer).toBeGreaterThan(0);
    expect(state.wildlifeCounts.wolves).toBe(0);
    expect(state.wildlifeCounts.foxes).toBe(0);
    expect(state.wildlifeCounts.rabbits).toBeLessThanOrEqual(
      WILDLIFE_POPULATION_POLICY[EntityType.Rabbit].breedingCap,
    );
  });
});

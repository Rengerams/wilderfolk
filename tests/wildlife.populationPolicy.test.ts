import { describe, expect, it } from 'vitest';
import { EntityType, emptyEntityByType } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { createEntity } from '../src/game/entityFactory';
import { tickWildlife } from '../src/game/tickLayerSystems';
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

  it.each([
    { cause: 'old age', excessRabbits: 0, canHunt: false },
    { cause: 'starvation', excessRabbits: 0, canHunt: false },
    { cause: 'old age', excessRabbits: 1, canHunt: true },
  ])('counts $cause before deciding if a wolf may hunt the last 35 rabbits (excess=$excessRabbits)', ({ cause, excessRabbits, canHunt }) => {
    const state = initGame({ skipTerrain: true, seed: 20261122 });
    state.tick = 500;
    const rabbits = Array.from({ length: 36 + excessRabbits }, (_, index) =>
      createEntity(EntityType.Rabbit, index === 1 ? 560 : 1000, index === 1 ? 500 : 700, 1000 + index, 120));
    const dying = rabbits[0];
    if (cause === 'old age') dying.age = dying.maxAge;
    else dying.energy = 0.1;
    const wolf = createEntity(EntityType.Wolf, 500, 500, 2000, 160);
    wolf.reproductionCooldown = 100;
    state.entities = [...rabbits, wolf];
    state.nextEntityId = 2001;
    const byType = emptyEntityByType();
    for (const entity of state.entities) byType[entity.type].push(entity);
    const ctx: TickContext = {
      width: state.width,
      height: state.height,
      hourOfDay: 8,
      season: state.season,
      grassMult: 1,
      reproMult: 0,
      winterPenalty: 0,
      canHeat: true,
      byType,
      aliveEntities: state.entities,
      newEntities: [],
      updatedBuildings: state.buildings,
      roadBuildings: [],
      playerHumans: [],
      entityById: new Map(state.entities.map((entity) => [entity.id, entity])),
      buildingById: new Map(),
      predators: [wolf],
    };
    tickWildlife(state, ctx);
    expect(dying.alive).toBe(false);
    expect(wolf.huntTargetId === rabbits[1].id).toBe(canHunt);
    expect(rabbits[1].alive).toBe(true);
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

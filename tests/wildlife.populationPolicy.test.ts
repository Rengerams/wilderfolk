import { describe, expect, it } from 'vitest';
import { EntityType, TerrainType, emptyEntityByType } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { createEntity } from '../src/game/entityFactory';
import {
  OFFSCREEN_WILDLIFE_THROTTLE,
  WILDLIFE_LAYER_INTERVAL,
  isOffscreenWildlifeActive,
} from '../src/game/simFocus';
import { tickWildlife } from '../src/game/tickLayerSystems';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { computeWildlifeCounts } from '../src/game/entityCounts';
import { initGame, isPassableWildlifePosition, replenishDepletedWildlife } from '../src/game/worldGen';
import {
  WILDLIFE_POPULATION_POLICY,
  wildlifeBreedingCeiling,
  wildlifeMayHuntRabbit,
  getWildlifeCarryingCapacity,
} from '../src/game/wildlifePopulationPolicy';

import { testWorldMap } from '../src/test/worldMapFixtures';
import { getPathGrid, isWalkStepAllowed, nearestWalkableWorldPoint } from '../src/game/pathfinding';

describe('wildlife water traversal', () => {
  it.each([TerrainType.ShallowWater, TerrainType.DeepWater, TerrainType.River])(
    'rejects water terrain %s for wildlife spawning and segment traversal', (water) => {
      const state = initGame({ skipTerrain: true, seed: 20261122 });
      const map = testWorldMap({ tilesX: 20, tilesY: 20,
        tileType: (x) => x === 10 ? water : TerrainType.Grassland });
      state.worldMap = map;
      state.width = state.height = 200;
      expect(isPassableWildlifePosition(state, 105, 105)).toBe(false);
      expect(isPassableWildlifePosition(state, 95, 105)).toBe(true);
      const grid = getPathGrid(map, []);
      const waterBlocked = (x: number, y: number) =>
        !isPassableWildlifePosition(state, (x + 0.5) * 10, (y + 0.5) * 10, 0);
      const recovered = nearestWalkableWorldPoint(map, [], 105, 105, waterBlocked);
      expect(recovered).not.toBeNull();
      expect(isPassableWildlifePosition(state, recovered!.x, recovered!.y, 0)).toBe(true);
      expect(isWalkStepAllowed(95, 105, 115, 105, grid, waterBlocked)).toBe(false);
      expect(isWalkStepAllowed(95, 105, 95, 115, grid, waterBlocked)).toBe(true);
    },
  );
});

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

  it('constrains wolf/fox numbers to the prey base, including a zero-prey valley', () => {
    const empty = { rabbits: 0, deer: 0, foxes: 0 };
    expect(getWildlifeCarryingCapacity(EntityType.Wolf, empty)).toBe(0);
    expect(getWildlifeCarryingCapacity(EntityType.Fox, empty)).toBe(0);
    const refuge = WILDLIFE_POPULATION_POLICY[EntityType.Rabbit].replenishMinimum;
    expect(getWildlifeCarryingCapacity(EntityType.Fox, { ...empty, rabbits: refuge })).toBe(0);
    expect(getWildlifeCarryingCapacity(EntityType.Wolf, { ...empty, rabbits: refuge })).toBe(0);
    expect(getWildlifeCarryingCapacity(EntityType.Fox, { ...empty, rabbits: 54 })).toBe(6);
    expect(getWildlifeCarryingCapacity(EntityType.Wolf, { rabbits: 55, deer: 20, foxes: 6 })).toBe(4);
    expect(getWildlifeCarryingCapacity(EntityType.Wolf, { rabbits: 1000, deer: 1000, foxes: 10 }))
      .toBe(WILDLIFE_POPULATION_POLICY[EntityType.Wolf].breedingCeiling);
    expect(getWildlifeCarryingCapacity(EntityType.Wildkin, empty)).toBe(35);
  });

  it('initializes predator groups within the same population policy', () => {
    const state = initGame({ skipTerrain: true, seed: 20261122 });
    for (const [type, key] of [
      [EntityType.Fox, 'foxes'],
      [EntityType.Wolf, 'wolves'],
    ] as const) {
      expect(state.wildlifeCounts[key]).toBeLessThanOrEqual(
        WILDLIFE_POPULATION_POLICY[type].replenishTarget,
      );
    }
  });

  it('never restocks a predator into an empty-prey valley', () => {
    const state = initGame({ skipTerrain: true, seed: 20261122 });
    for (const animal of state.entities) {
      if (animal.type === EntityType.Rabbit || animal.type === EntityType.Deer
          || animal.type === EntityType.Wolf || animal.type === EntityType.Fox) {
        animal.alive = false;
      }
    }
    state.wildlifeCounts = computeWildlifeCounts(state.entities);
    expect(state.wildlifeCounts.rabbits).toBe(0);
    expect(state.wildlifeCounts.wolves).toBe(0);
    replenishDepletedWildlife(state);
    expect(state.wildlifeCounts.rabbits).toBeGreaterThan(0);
    expect(state.wildlifeCounts.deer).toBeGreaterThan(0);
    // Refill uses prey counts at pulse start, not the newborn rabbit/deer restock.
    expect(state.wildlifeCounts.wolves).toBe(0);
    expect(state.wildlifeCounts.foxes).toBe(0);
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

describe('M31 — the off-screen wildlife throttle counts layer pulses', () => {
  it('lets every entity id act exactly once per throttle window', () => {
    for (let id = 0; id < OFFSCREEN_WILDLIFE_THROTTLE; id++) {
      let passes = 0;
      const basePulse = Math.floor(id / OFFSCREEN_WILDLIFE_THROTTLE) * OFFSCREEN_WILDLIFE_THROTTLE + 1;
      for (let pulse = basePulse; pulse < basePulse + OFFSCREEN_WILDLIFE_THROTTLE; pulse++) {
        if (isOffscreenWildlifeActive(pulse * WILDLIFE_LAYER_INTERVAL, id)) passes++;
      }
      expect(passes).toBe(1);
    }
  });

  it('is reachable for ids that the raw-tick formula never matched', () => {
    // tickWildlife only runs on multiples of WILDLIFE_LAYER_INTERVAL.
    for (const id of [1, 2, 3, 5, 6, 7]) {
      let reachable = false;
      for (let tick = 0; tick <= WILDLIFE_LAYER_INTERVAL * OFFSCREEN_WILDLIFE_THROTTLE * 2; tick += WILDLIFE_LAYER_INTERVAL) {
        if (isOffscreenWildlifeActive(tick, id)) reachable = true;
      }
      expect(reachable).toBe(true);
    }
  });
});

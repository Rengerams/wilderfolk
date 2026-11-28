import { rebakeTerrainGrids, setTileOverride } from '../src/game/terrain/terrainGrid';
import { gameTick } from '../src/game/gameTick';
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, MapSize, TerrainType, emptyEntityByType } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { createEntity } from '../src/game/entityFactory';
import {
  OFFSCREEN_WILDLIFE_THROTTLE,
  WILDLIFE_LAYER_INTERVAL,
  isOffscreenWildlifeActive,
} from '../src/game/simFocus';
import { tickWildlife } from '../src/game/tickLayerSystems';
import { TICKS_PER_DAY, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { computeWildlifeCounts } from '../src/game/entityCounts';
import { createBuilding, initGame, isPassableWildlifePosition, replenishDepletedWildlife } from '../src/game/worldGen';
import {
  WILDLIFE_POPULATION_POLICY,
  wildlifeBreedingCeiling,
  wildlifeMayHuntRabbit,
  getWildlifeCarryingCapacity,
  getCompletedWildlifePreserves,
  isWildlifeProtected,
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

  it('uses the existing capped recovery pulse inside a completed protected grove', () => {
    const state = initGame({ skipTerrain: true, seed: 20261122 });
    const preserve = createBuilding(BuildingType.WildlifePreserve, state.width / 2, state.height / 2, state.nextBuildingId++);
    preserve.completed = true;
    state.buildings.push(preserve);
    for (const entity of state.entities) if (entity.type === EntityType.Rabbit) entity.alive = false;
    state.wildlifeCounts = computeWildlifeCounts(state.entities);
    replenishDepletedWildlife(state);
    const rabbits = state.entities.filter(entity => entity.alive && entity.type === EntityType.Rabbit);
    expect(rabbits.length).toBeGreaterThan(0);
    expect(rabbits.length).toBeLessThanOrEqual(16);
    const preserves = getCompletedWildlifePreserves(state.buildings);
    expect(rabbits.every(rabbit => isWildlifeProtected(rabbit, preserves))).toBe(true);
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

describe('wildlife recovery and logging cadence', () => {
  function countType(state: ReturnType<typeof initGame>, type: EntityType): number {
    return state.entities.filter((e) => e.alive && e.type === type).length;
  }

  it('L81 — the wildlife replenish log throttle only advances when a message is logged', () => {
    const world = initGame({ seed: 11, size: MapSize.Medium });
    const depleted = {
      ...world.wildlifeCounts,
      grass: 10, rabbits: 0, deer: 0, foxes: 0, wolves: 0,
    };
    world.wildlifeCounts = { ...depleted };
    world.lastWildlifeReplenishLogDay = -999;

    const logsBefore = world.eventLog.length;
    expect(replenishDepletedWildlife(world)).toBe(true);
    expect(world.eventLog.length).toBeGreaterThan(logsBefore);
    const loggedDay = world.lastWildlifeReplenishLogDay;

    // The next day the frontier is depleted again, but the 40-day gap has not passed: no
    // message is due, so the throttle must stay where the last message left it.
    world.wildlifeCounts = { ...depleted };
    world.dayInYear += 1;
    const logsBeforeSecond = world.eventLog.length;
    replenishDepletedWildlife(world);
    expect(world.eventLog.length).toBe(logsBeforeSecond);
    expect(world.lastWildlifeReplenishLogDay).toBe(loggedDay);
  });

  it('L82 — prey do not repopulate when the grass refill actually placed nothing', () => {
    const world = initGame({ seed: 33, size: MapSize.Medium });
    // A 40px world puts every grass patch centre out of bounds (`spawnGrassPatch` bounds-checks
    // `state.width/height`), while the tile grid below still lets wildlife spawn.
    world.width = 40;
    world.height = 40;
    // A passable tile grid still lets wildlife spawn: Teraforge keeps no per-tile grid, so
    // "grassland everywhere" is one override per tile.
    if (world.worldMap) {
      const map = world.worldMap;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          setTileOverride(map, tx, ty, {
            type: TerrainType.Grassland, elevation: 30, moisture: 50, variation: 0,
          });
        }
      }
      rebakeTerrainGrids(map, { startTx: 0, endTx: map.width - 1, startTy: 0, endTy: map.height - 1 });
    }
    world.entities = world.entities.filter((e) => e.type !== EntityType.Grass);
    world.wildlifeCounts = {
      ...world.wildlifeCounts,
      grass: 0, rabbits: 10, deer: 10, foxes: 14, wolves: 6,
    };

    const rabbitsBefore = countType(world, EntityType.Rabbit);
    expect(replenishDepletedWildlife(world)).toBe(true);
    expect(countType(world, EntityType.Rabbit)).toBe(rabbitsBefore);
  });

  it('L83 — replenishDepletedWildlife reports false only when nothing needed refilling', () => {
    const world = initGame({ seed: 55, size: MapSize.Medium });
    world.wildlifeCounts = {
      ...world.wildlifeCounts,
      grass: 200, rabbits: 60, deer: 25, foxes: 20, wolves: 10,
    };
    const logsBefore = world.eventLog.length;
    expect(replenishDepletedWildlife(world)).toBe(false);
    expect(world.eventLog.length).toBe(logsBefore);

    world.wildlifeCounts = {
      ...world.wildlifeCounts,
      grass: 10, rabbits: 0, deer: 0, foxes: 0, wolves: 0,
    };
    expect(replenishDepletedWildlife(world)).toBe(true);
  });

  it('replenishes extinct wildlife on the three-day world-events phase', () => {
    const world = initGame({ seed: 128, size: MapSize.Medium });
    world.entities = world.entities.filter((entity) => ![
      EntityType.Rabbit, EntityType.Deer, EntityType.Fox, EntityType.Wolf,
    ].some((type) => entity.type === type));
    world.wildlifeCounts = { ...world.wildlifeCounts, rabbits: 0, deer: 0, foxes: 0, wolves: 0 };
    world.tick = tickAtDailyPhase(3, 'worldEvents') - 1;
    let next = gameTick(world);
    expect(next.tick).toBe(tickAtDailyPhase(3, 'worldEvents'));
    expect(countType(next, EntityType.Rabbit)).toBeGreaterThan(0);
    expect(countType(next, EntityType.Deer)).toBeGreaterThan(0);
    // An empty prey base must not cause instant fox/wolf restocking. Grazers recover first.
    expect(countType(next, EntityType.Fox)).toBe(0);
    expect(countType(next, EntityType.Wolf)).toBe(0);

    // Every third-day refill can rebuild the prey base. Predators return only after
    // the shared carrying-capacity policy can sustain them.
    for (const day of [6, 9, 12]) {
      next.tick = tickAtDailyPhase(day, 'worldEvents') - 1;
      next = gameTick(next);
      expect(next.tick).toBe(tickAtDailyPhase(day, 'worldEvents'));
    }
    expect(countType(next, EntityType.Rabbit)).toBeGreaterThan(35);
    expect(countType(next, EntityType.Fox)).toBeGreaterThan(0);
    expect(countType(next, EntityType.Wolf)).toBeGreaterThan(0);
  });
});

/**
 * Owner rulings in one file: research delivers the rate its constant declares, the forge declares its
 * real two-day cadence, and every mobile species paces and ranges at the enlarged map's scale.
 */
import { describe, expect, it } from 'vitest';
import {
  EntityType,
  MapSize,
  MAP_SIZE_DIMENSIONS,
  createInitialResearchNodes,
  type Building,
  type WorldState,
} from '../src/game/gameTypes';
import { BuildingType } from '../src/game/buildings';
import { PER_TICK_RATE_SCALE, PRODUCTION_INTERVAL, TICKS_PER_DAY } from '../src/game/dayCycle';
import { WILDLIFE_LAYER_INTERVAL } from '../src/game/simFocus';
import { updateResearch } from '../src/game/research';
import {
  FORGE_ORDERS,
  FORGE_PACE_INTERVAL_TICKS,
  FORGE_PROGRESS_PER_TWO_DAY_TICK,
  tickVillageForge,
} from '../src/game/forge';
import { MAP_SCALE, SPECIES_CONFIG } from '../src/game/speciesConfig';

function researchWorld(): WorldState {
  return {
    researchNodes: createInitialResearchNodes(),
    unlockedTechs: ['agriculture_1'],
    activeResearch: 'agriculture_1',
    researchProgress: 0,
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    entities: [],
  } as unknown as WorldState;
}

describe('research delivers the rate it declares', () => {
  it('adds a full per-tick rate once per systems step, not a quarter of it', () => {
    const state = researchWorld();
    updateResearch(state);
    expect(state.researchProgress).toBeCloseTo(PER_TICK_RATE_SCALE * WILDLIFE_LAYER_INTERVAL, 10);
    expect(state.researchProgress).toBeGreaterThan(PER_TICK_RATE_SCALE);
  });

  it('carries a 100-point node in the days the declared rate implies', () => {
    const state = researchWorld();
    for (let tick = 1; tick <= TICKS_PER_DAY; tick++) {
      if (tick % WILDLIFE_LAYER_INTERVAL !== 0) continue;
      updateResearch(state);
    }
    expect(state.researchProgress).toBeCloseTo(24, 10);
    expect(100 / state.researchProgress).toBeCloseTo(4.1667, 3);
  });
});

function forgeWorld(tick: number): WorldState {
  const smith = {
    id: 1,
    type: BuildingType.Blacksmith,
    completed: true,
    occupants: [7],
  } as unknown as Building;
  return {
    tick,
    villageForge: { activeOrder: 'iron_spears', progress: 0, completed: {} },
    buildings: [smith],
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
  } as unknown as WorldState;
}

describe('the forge declares its two-day pace', () => {
  it('names the cadence and delivers the declared pace once per two-day workshop tick', () => {
    expect(FORGE_PACE_INTERVAL_TICKS).toBe(PRODUCTION_INTERVAL.workshop);
    expect(FORGE_PACE_INTERVAL_TICKS / TICKS_PER_DAY).toBe(2);
    for (const order of FORGE_ORDERS) {
      expect(order.progressPerTick).toBe(FORGE_PROGRESS_PER_TWO_DAY_TICK[order.id]);
    }

    const onCadence = forgeWorld(FORGE_PACE_INTERVAL_TICKS);
    tickVillageForge(onCadence, onCadence.buildings);
    expect(onCadence.villageForge?.progress).toBe(FORGE_PROGRESS_PER_TWO_DAY_TICK.iron_spears);

    const offCadence = forgeWorld(FORGE_PACE_INTERVAL_TICKS / 2);
    tickVillageForge(offCadence, offCadence.buildings);
    expect(offCadence.villageForge?.progress).toBe(0);
  });
});

const MOBILE_BASE = {
  [EntityType.Rabbit]: { speed: 3.5, fleeRange: 40, huntRange: 0, wanderRadius: 60 },
  [EntityType.Deer]: { speed: 3.0, fleeRange: 50, huntRange: 0, wanderRadius: 210 },
  [EntityType.Wolf]: { speed: 4, fleeRange: 0, huntRange: 350, wanderRadius: 220 },
  [EntityType.Fox]: { speed: 3.0, fleeRange: 90, huntRange: 100, wanderRadius: 100 },
  [EntityType.Werewolf]: { speed: 3.4, fleeRange: 0, huntRange: 150, wanderRadius: 150 },
  [EntityType.Wildkin]: { speed: 3.2, fleeRange: 100, huntRange: 0, wanderRadius: 90 },
} as const;

describe('wildlife scales with the map', () => {
  it('paces and ranges every mobile species at the map factor', () => {
    expect(MAP_SCALE).toBeCloseTo(MAP_SIZE_DIMENSIONS[MapSize.Medium].width / 1200, 10);
    for (const [type, base] of Object.entries(MOBILE_BASE)) {
      const config = SPECIES_CONFIG[type as EntityType];
      expect(config.speed, `${type} speed`).toBeCloseTo(base.speed * MAP_SCALE, 10);
      expect(config.fleeRange, `${type} fleeRange`).toBeCloseTo(base.fleeRange * MAP_SCALE, 10);
      expect(config.huntRange, `${type} huntRange`).toBeCloseTo(base.huntRange * MAP_SCALE, 10);
      expect(config.wanderRadius, `${type} wanderRadius`).toBeCloseTo(base.wanderRadius * MAP_SCALE, 10);
    }
  });

  it('leaves the immobile species at a standstill', () => {
    expect(SPECIES_CONFIG[EntityType.Grass].speed).toBe(0);
    expect(SPECIES_CONFIG[EntityType.Tree].speed).toBe(0);
  });
});

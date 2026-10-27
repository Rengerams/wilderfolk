/**
 * The Wildkin's place on the wildlife ladder, and the chronicle lines that make it findable.
 *
 * Owner's ruling: the Wildkin is meant to be the apex creature ("well it was ment to be at top of the
 * ladder") and half human, born to a settler mother — so its diet cannot be grass, it cannot be
 * counted as a grazer's grass demand, and a player must be able to learn where it is when it is born
 * and when it dies. See BUG_REPORTS/2026-10-09-wildkin-apex-role-and-chronicle.md.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, Season } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { BuildingType } from '../src/game/buildings';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { getGrazingPressureReport } from '../src/game/ecosystemPressure';
import { getGrazerDailyDemand } from '../src/game/grassEcology';
import { markWildlifeDead } from '../src/game/simulation/simulationEntities';
import {
  describeWildkinPlace,
  isWildkinNearSettlement,
  logWildkinBirth,
  logWildkinDeath,
  tickWildkinChronicle,
  WILDKIN_SETTLEMENT_RANGE_WU,
} from '../src/game/wildkinChronicle';
import { createEntity } from '../src/game/entityFactory';

function world(seed = 7): WorldState {
  const state = initGame({ villageName: 'Testholm', size: 'medium', seed });
  state.tick = 500;
  return state;
}

function house(id: number, x: number, y: number): Building {
  return {
    id,
    type: BuildingType.House,
    x,
    y,
    width: 60,
    height: 48,
    rotation: 0,
    completed: true,
    faction: 'player',
    occupants: [],
  } as unknown as Building;
}

function wildkin(x: number, y: number, id = 500): Entity {
  return createEntity(EntityType.Wildkin, x, y, id, SPECIES_CONFIG[EntityType.Wildkin].spawnEnergy);
}

function ctxFor(state: WorldState, entities: Entity[]): TickContext {
  const byType = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) byType[type] = [];
  for (const entity of entities) byType[entity.type].push(entity);
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 8,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    aliveEntities: entities,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: entities,
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    buildingById: new Map(),
    predators: [],
  } as unknown as TickContext;
}

describe('the Wildkin sits at the top of the ladder', () => {
  it('eats meat, not grass — the same diet shape as the wolf', () => {
    const wildkinConfig = SPECIES_CONFIG[EntityType.Wildkin];
    const wolfConfig = SPECIES_CONFIG[EntityType.Wolf];

    expect(wildkinConfig.energyGain.grass).toBeUndefined();
    expect(wildkinConfig.energyGain.deer).toBeGreaterThan(0);
    expect(wildkinConfig.energyGain.rabbit).toBeGreaterThan(0);

    // Same shape as the wolf's: prey keys, positive values, no forage key.
    expect(Object.keys(wildkinConfig.energyGain).sort()).toEqual(['deer', 'rabbit']);
    expect(wolfConfig.energyGain.grass).toBeUndefined();
  });

  it('does not flee and does hunt, like the wolf and unlike the grazers', () => {
    const wildkinConfig = SPECIES_CONFIG[EntityType.Wildkin];
    expect(wildkinConfig.fleeRange).toBe(0);
    expect(wildkinConfig.huntRange).toBeGreaterThan(0);
    expect(SPECIES_CONFIG[EntityType.Wolf].fleeRange).toBe(0);
    expect(SPECIES_CONFIG[EntityType.Deer].fleeRange).toBeGreaterThan(0);
  });
});

describe('the Wildkin is not a grazer in the ecology totals', () => {
  it('leaves Wildkin out of the daily grass demand', () => {
    const state = world();
    state.season = Season.Summer;
    state.wildlifeCounts.deer = 6;
    state.wildlifeCounts.rabbits = 4;
    state.wildlifeCounts.wildkin = 3;

    const report = getGrazingPressureReport(state);
    const expected =
      Math.round(
        getGrazerDailyDemand('deer', Season.Summer) * 6
        + getGrazerDailyDemand('rabbit', Season.Summer) * 4,
      );

    expect(report.grazingDemandPerDay).toBe(expected);
    // A predator's metabolism is not grass demand, so adding one must not move the number.
    const before = report.grazingDemandPerDay;
    state.wildlifeCounts.wildkin = 30;
    expect(getGrazingPressureReport(state).grazingDemandPerDay).toBe(before);
  });
});

describe('the Wildkin is half human, so the chronicle says where it is', () => {
  // One world for the whole block: `initGame` costs seconds, and every case below only needs the
  // settlement anchor and a clean chronicle, both reset here.
  const anchored = world();
  anchored.buildings = [house(1, 128, 96)];
  let state: WorldState;

  beforeEach(() => {
    state = anchored;
    state.eventLog = [];
    state.entities = [];
    state.wildlifeCounts.wildkin = 0;
  });

  it('describes a place from the map vocabulary, never as bare coordinates', () => {
    const place = describeWildkinPlace(state, wildkin(128, 140));
    expect(place).toMatch(/at the settlement/);
    expect(place).toMatch(/in the /);
    expect(place).not.toMatch(/\d+px/);
  });

  it('logs a birth with a place', () => {
    const born = wildkin(150, 120, 601);
    logWildkinBirth(state, born, 'Janet');

    const entry = state.eventLog.find((event) => event.type === 'birth' && event.message.includes('Wildkin'));
    expect(entry).toBeDefined();
    expect(entry?.message).toContain('Janet');
    expect(entry?.message).toContain('half human');
    expect(entry?.message).toContain(describeWildkinPlace(state, born));
  });

  it('logs a death with a place', () => {
    const dead = wildkin(300, 160, 602);
    state.entities = [dead];
    const ctx = ctxFor(state, [dead]);

    markWildlifeDead(ctx, dead, undefined, state.tick, state);

    const entry = state.eventLog.find((event) => event.type === 'death' && event.message.includes('Wildkin'));
    expect(entry).toBeDefined();
    expect(entry?.message).toContain(describeWildkinPlace(state, dead));
    expect(dead.alive).toBe(false);
  });

  it('logs one sighting when it comes to the settlement, and only one', () => {
    state.entities = [];
    const near = wildkin(128 + WILDKIN_SETTLEMENT_RANGE_WU - 1, 96, 603);
    const settler = createEntity(EntityType.Human, 128, 96, 604, 100);
    state.entities = [near, settler];

    expect(isWildkinNearSettlement(state, near)).toBe(true);

    tickWildkinChronicle(state, {});
    tickWildkinChronicle(state, {});
    tickWildkinChronicle(state, {});

    const sightings = state.eventLog.filter(
      (event) => event.type === 'milestone' && event.message.includes('Wildkin'),
    );
    expect(sightings).toHaveLength(1);
    expect(sightings[0]?.message).toContain('in the ');
  });

  it('stays silent for a Wildkin that keeps to the wilds', () => {
    state.entities = [];
    const far = wildkin(state.width - 4, state.height - 4, 605);
    const settler = createEntity(EntityType.Human, 128, 96, 606, 100);
    state.entities = [far, settler];

    expect(isWildkinNearSettlement(state, far)).toBe(false);
    tickWildkinChronicle(state, {});

    expect(
      state.eventLog.filter((event) => event.type === 'milestone' && event.message.includes('Wildkin')),
    ).toHaveLength(0);
    expect(describeWildkinPlace(state, far)).toMatch(/out in the wilds to the /);
  });
});

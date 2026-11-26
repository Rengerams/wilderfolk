import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, JobType, MapSize, TerrainType, emptyEntityByType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tickHumanHunting } from '../src/game/humanHuntingBehavior';
import { tallyTickDeaths } from '../src/game/stats';
import { setCurrentPathMap, isGroundWalkableAt } from '../src/game/pathfinding';
import { applyHumanWalkStep } from '../src/game/simulation/humanMovement';
import { testWorldMap } from '../src/test/worldMapFixtures';

function contextFor(state: WorldState): TickContext {
  const byType = emptyEntityByType();
  for (const entity of state.entities.filter((candidate) => candidate.alive)) {
    byType[entity.type].push(entity);
  }
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 12,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: false,
    byType,
    aliveEntities: state.entities.filter((candidate) => candidate.alive),
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: state.entities.filter((candidate) => candidate.type === EntityType.Human),
    entityById: new Map(state.entities.map((entity) => [entity.id, entity])),
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
    predators: [],
  };
}

function huntFixture(): { state: WorldState; ctx: TickContext; hunter: Entity; deer: Entity } {
  const state = initGame({ size: MapSize.Medium, skipTerrain: true });
  const hunter = state.entities.find((entity) => entity.type === EntityType.Human && !entity.isJuvenile);
  if (!hunter) throw new Error('fixture has no adult settler');

  hunter.x = 100;
  hunter.y = 100;
  hunter.job = JobType.Hunter;
  hunter.isJuvenile = false;
  hunter.needs = { nutrition: 20, rest: 80, stamina: 40, severeHungerTicks: 0 };
  state.resources.food = 0;

  const deer = createEntity(EntityType.Deer, hunter.x, hunter.y + 2, state.nextEntityId++);
  state.entities.push(deer);
  return { state, ctx: contextFor(state), hunter, deer };
}

describe('free-roaming hunting food flow', () => {
  it('routes a free-roaming hunter around a river instead of chasing into the blocked bank', () => {
    const { state, ctx, hunter, deer } = huntFixture();
    hunter.x = 45;
    hunter.y = 55;
    deer.x = 105;
    deer.y = 55;
    const map = testWorldMap({
      tilesX: 16, tilesY: 14,
      tileType: (x, y) => x === 7 && y >= 3 ? TerrainType.River : TerrainType.Grassland,
    });
    setCurrentPathMap(map, []);
    try {
      for (let tick = 0; tick < 60 && deer.alive; tick++) {
        tickHumanHunting(state, ctx, hunter, SPECIES_CONFIG[EntityType.Human],
          true, false, false, false, ctx.byType, ctx.mobileGrid, ctx.entityById, false);
        applyHumanWalkStep(hunter, 1);
        expect(isGroundWalkableAt(hunter.x, hunter.y)).toBe(true);
      }
      expect(deer.alive).toBe(false);
      expect(hunter.x).toBeGreaterThan(80);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('does not kill close prey through an impassable river tile', () => {
    const { state, ctx, hunter, deer } = huntFixture();
    hunter.x = 69;
    hunter.y = 55;
    deer.x = 81;
    deer.y = 55;
    const map = testWorldMap({
      tilesX: 16, tilesY: 14,
      tileType: (x) => x === 7 ? TerrainType.River : TerrainType.Grassland,
    });
    setCurrentPathMap(map, []);
    try {
      tickHumanHunting(state, ctx, hunter, SPECIES_CONFIG[EntityType.Human],
        true, false, false, false, ctx.byType, ctx.mobileGrid, ctx.entityById, false);
      expect(deer.alive).toBe(true);
      expect(state.resources.food).toBe(0);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('records the food that actually entered storage in the economy ledger', () => {
    const { state, ctx, hunter, deer } = huntFixture();
    const foodBefore = state.resources.food;

    tickHumanHunting(
      state,
      ctx,
      hunter,
      SPECIES_CONFIG[EntityType.Human],
      true,
      false,
      false,
      false,
      ctx.byType,
      ctx.mobileGrid,
      ctx.entityById,
      false,
    );

    expect(deer.alive).toBe(false);
    const added = state.resources.food - foodBefore;
    expect(added).toBeGreaterThan(0);
    expect(state.economyLedger?.produced.hunting).toBe(added);
  });

  it('reports the storage-accepted food in the reward text when the larder is nearly full', () => {
    const { state, ctx, hunter, deer } = huntFixture();
    // Only seven units fit, so the nominal deer yield must not be the promised number.
    state.storageMax.food = state.resources.food + 7;

    tickHumanHunting(
      state,
      ctx,
      hunter,
      SPECIES_CONFIG[EntityType.Human],
      true,
      false,
      false,
      false,
      ctx.byType,
      ctx.mobileGrid,
      ctx.entityById,
      false,
    );

    expect(state.resources.food).toBe(7);
    expect(state.floatingTexts.at(-1)?.text).toBe('Hunted Deer! +7');
  });

  it('counts the free-roam kill in the tick death tally', () => {
    const { state, ctx, hunter } = huntFixture();
    const aliveAtTickStart = state.entities.filter((entity) => entity.alive);

    tickHumanHunting(
      state,
      ctx,
      hunter,
      SPECIES_CONFIG[EntityType.Human],
      true,
      false,
      false,
      false,
      ctx.byType,
      ctx.mobileGrid,
      ctx.entityById,
      false,
    );
    // The tick closes with the same tally owner gameTick uses on its tick-start roster.
    tallyTickDeaths(state, aliveAtTickStart);

    expect(state.deathsThisYear?.animals).toBe(1);
  });
});

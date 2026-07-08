import { describe, expect, it, vi, afterEach } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType, TerrainType } from '@/game/gameTypes';
import { tickWildlife, tickHumans, type TickContext } from '@/game/lifeSimulation';
import { isPlayerHuman } from '@/game/groupEvents';
import { PREGNANCY_TICKS } from '@/game/dayCycle';
import { makeAdultSettler } from '@/test/fixtures/gameFixtures';
import type { SimulationFocus } from '@/game/gameEngine';

function emptyByType(): Record<EntityType, ReturnType<typeof createEntity>[]> {
  return {
    [EntityType.Human]: [],
    [EntityType.Grass]: [],
    [EntityType.Tree]: [],
    [EntityType.Rabbit]: [],
    [EntityType.Deer]: [],
    [EntityType.Wolf]: [],
    [EntityType.Fox]: [],
    [EntityType.Werewolf]: [],
    [EntityType.Wildkin]: [],
  };
}

function wildlifeCtx(
  state: ReturnType<typeof initGame>,
  entities: ReturnType<typeof createEntity>[],
): TickContext {
  const byType = emptyByType();
  for (const e of entities) {
    byType[e.type].push(e);
  }
  const entityById = new Map(entities.map((e) => [e.id, e]));
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 12,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: entities.filter(isPlayerHuman),
    entityById,
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
  };
}

function humanCtx(
  state: ReturnType<typeof initGame>,
  humans: ReturnType<typeof createEntity>[],
  focus?: SimulationFocus,
): TickContext {
  const byType = emptyByType();
  byType[EntityType.Human] = humans;
  const entityById = new Map(humans.map((e) => [e.id, e]));
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 12,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById,
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
    focus,
  };
}

describe('tickWildlife grass spread', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not reproduce grass onto impassable terrain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = initGame();
    if (!state.worldMap) return;

    const blocked = new Set<TerrainType>([
      TerrainType.River,
      TerrainType.RiverBank,
      TerrainType.DeepWater,
      TerrainType.ShallowWater,
      TerrainType.Mountains,
    ]);

    let blockedX = -1;
    let blockedY = -1;
    outer: for (let ty = 0; ty < state.worldMap.height; ty++) {
      for (let tx = 0; tx < state.worldMap.width; tx++) {
        if (blocked.has(state.worldMap.tiles[ty][tx].type)) {
          blockedX = tx * 10 + 5;
          blockedY = ty * 10 + 5;
          break outer;
        }
      }
    }
    expect(blockedX).toBeGreaterThanOrEqual(0);

    const parent = createEntity(EntityType.Grass, blockedX + 40, blockedY + 40, 1, 100);
    parent.energy = 100;
    const ctx = wildlifeCtx(state, [parent]);
    tickWildlife(state, ctx);

    const spawned = ctx.newEntities.filter((e) => e.type === EntityType.Grass);
    expect(spawned.length).toBeGreaterThan(0);
    for (const grass of spawned) {
      const tile = state.worldMap.tiles[Math.floor(grass.y / 10)]?.[Math.floor(grass.x / 10)];
      expect(tile).toBeDefined();
      expect(blocked.has(tile!.type)).toBe(false);
    }
  });
});

describe('tickWildlife werewolf reproduction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not spawn offspring from werewolf pairs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = initGame();
    state.tick = 100;
    const w1 = createEntity(EntityType.Werewolf, 100, 100, 1, 400, false);
    const w2 = createEntity(EntityType.Werewolf, 110, 105, 2, 400, false);
    w1.moonHowlerCursed = true;
    w2.moonHowlerCursed = true;
    w1.reproductionCooldown = 0;
    w2.reproductionCooldown = 0;
    w1.energy = 500;
    w2.energy = 500;
    const ctx = wildlifeCtx(state, [w1, w2]);
    tickWildlife(state, ctx);
    expect(ctx.newEntities.filter((e) => e.type === EntityType.Werewolf)).toHaveLength(0);
  });
});

describe('tickHumans death chronicle', () => {
  it('logs off-screen starvation deaths', () => {
    const state = initGame();
    state.tick = 1;
    state.eventLog = [];
    const settler = makeAdultSettler(50, 'Starve');
    settler.x = 10;
    settler.y = 10;
    settler.energy = 1;
    state.entities = [settler];
    const focus: SimulationFocus = { minX: 900, maxX: 1000, minY: 900, maxY: 1000 };
    tickHumans(state, humanCtx(state, [settler], focus));
    expect(settler.alive).toBe(false);
    expect(state.eventLog.some((e) => e.type === 'death' && e.message.includes('succumbed to exhaustion'))).toBe(true);
  });

  it('logs maternal death from childbirth exhaustion', () => {
    const state = initGame();
    state.eventLog = [];
    const mother = makeAdultSettler(60, 'Birth');
    mother.gender = 'female';
    mother.pregnant = true;
    mother.pregnancyProgress = PREGNANCY_TICKS - 1;
    mother.energy = 40;
    mother.partnerId = undefined;
    mother.relationshipStatus = 'expecting';
    state.entities = [mother];
    tickHumans(state, humanCtx(state, [mother]));
    expect(mother.alive).toBe(false);
    expect(state.eventLog.some((e) => e.type === 'death' && e.message.includes('died in childbirth'))).toBe(true);
  });
});
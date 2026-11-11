import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initGame, createEntity } from '../src/game/worldGen';
import { EntityType, MapSize, Season, emptyEntityByType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import {
  BLUEBERRY_ENERGY_PER_PICK,
  BLUEBERRY_FOOD_PER_PICK,
  BLUEBERRY_MAX_YIELD,
  BLUEBERRY_REGROWTH_DAYS,
  tickBlueberryRegrowth,
  tryTickBlueberryForaging,
} from '../src/game/blueberryForaging';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { advanceHumanNeeds } from '../src/game/simulation/humanPhysiology';

function blueberryTrees(state: WorldState): Entity[] {
  return state.entities.filter((entity) => entity.alive && entity.forageKind === 'blueberry');
}

function contextFor(state: WorldState): TickContext {
  const byType = emptyEntityByType();
  for (const entity of state.entities.filter((candidate) => candidate.alive)) {
    byType[entity.type].push(entity);
  }
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 14,
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
    // `tryTickBlueberryForaging` never reads `predators` (only `entityById`, `byType.tree` and
    // `treeGrid`); the field is required by `TickContext`, so the fixture supplies an empty list.
    predators: [],
  };
}

function nearbyBlueberry(state: WorldState, human: Entity, yieldCount = 2): Entity {
  const tree = createEntity(EntityType.Tree, human.x + 4, human.y + 2, state.nextEntityId++);
  tree.forageKind = 'blueberry';
  tree.blueberryYield = yieldCount;
  tree.blueberryNextRegrowthDay = 0;
  state.entities.push(tree);
  return tree;
}

describe('blueberry foraging', () => {
  it('caps scarce landmark counts when terrain rejects some candidates', () => {
    const medium = initGame({ size: MapSize.Medium, seed: 20261111 });
    const large = initGame({ size: MapSize.Large, seed: 20261111 });
    const huge = initGame({ size: MapSize.Huge, seed: 20261111 });

    // Placement is bounded by terrain and spacing: 2 on Medium, at most 3 on Large/Huge.
    for (const [state, maximum] of [[medium, 2], [large, 3], [huge, 3]] as const) {
      const trees = blueberryTrees(state);
      expect(trees.length).toBeGreaterThan(0);
      expect(trees.length).toBeLessThanOrEqual(maximum);
      expect(trees.every((tree) => tree.blueberryYield === BLUEBERRY_MAX_YIELD)).toBe(true);
    }
  });

  it('picks one nearby ripe portion during free time and adds bounded food plus energy', () => {
    const state = initGame({ size: MapSize.Medium });
    const human = state.entities.find((entity) => entity.type === EntityType.Human)!;
    human.energy = 80;
    human.maxEnergy = 400;
    human.needs = { nutrition: 50, rest: 85, stamina: 20, severeHungerTicks: 0 };
    const tree = nearbyBlueberry(state, human, 2);
    human.blueberryForageTargetId = tree.id;
    const foodBefore = state.resources.food;

    const active = tryTickBlueberryForaging(state, contextFor(state), human, {
      freeTime: true,
      ateMeal: false,
      festivalGathering: false,
      famine: false,
      speed: human.speed,
    });

    expect(active).toBe(true);
    expect(tree.blueberryYield).toBe(1);
    expect(state.resources.food).toBe(foodBefore + BLUEBERRY_FOOD_PER_PICK);
    expect(state.economyLedger?.produced.foraging).toBe(BLUEBERRY_FOOD_PER_PICK);
    expect(human.energy).toBe(80 + BLUEBERRY_ENERGY_PER_PICK);
    expect(human.needs?.stamina).toBeCloseTo(20 + BLUEBERRY_ENERGY_PER_PICK / 400 * 100);
    // An ordinary awake tick spends a little stamina, but must not erase the reward.
    advanceHumanNeeds(human, { tick: state.tick + 1, elapsedTicks: 1, sleeping: false, working: false, moving: false });
    expect(human.energy).toBeLessThan(80 + BLUEBERRY_ENERGY_PER_PICK);
    expect(human.energy).toBeGreaterThan(80);
    expect(human.blueberryForageTargetId).toBeUndefined();
  });

  it('does not forage when a routine, meal, festival, or famine rule has priority', () => {
    const cases = [
      { freeTime: false, ateMeal: false, festivalGathering: false, famine: false },
      { freeTime: true, ateMeal: true, festivalGathering: false, famine: false },
      { freeTime: true, ateMeal: false, festivalGathering: true, famine: false },
      { freeTime: true, ateMeal: false, festivalGathering: false, famine: true },
    ];

    for (const options of cases) {
      const state = initGame({ size: MapSize.Medium });
      const human = state.entities.find((entity) => entity.type === EntityType.Human)!;
      human.energy = 80;
      human.maxEnergy = 400;
      const tree = nearbyBlueberry(state, human);
      human.blueberryForageTargetId = tree.id;
      const foodBefore = state.resources.food;

      expect(tryTickBlueberryForaging(state, contextFor(state), human, { ...options, speed: human.speed })).toBe(false);
      expect(tree.blueberryYield).toBe(2);
      expect(state.resources.food).toBe(foodBefore);
      expect(human.blueberryForageTargetId).toBeUndefined();
    }
  });

  it('regrows one portion on schedule outside winter, never beyond its cap, and pauses in winter', () => {
    const state = initGame({ size: MapSize.Medium });
    const tree = blueberryTrees(state)[0]!;
    tree.blueberryYield = 0;
    tree.blueberryNextRegrowthDay = 0;
    state.season = Season.Winter;
    tickBlueberryRegrowth(state);
    expect(tree.blueberryYield).toBe(0); // no growth in winter

    state.season = Season.Spring;
    tickBlueberryRegrowth(state);
    expect(tree.blueberryYield).toBe(1);
    expect(tree.blueberryNextRegrowthDay).toBe(BLUEBERRY_REGROWTH_DAYS);

    tree.blueberryYield = BLUEBERRY_MAX_YIELD;
    tree.blueberryNextRegrowthDay = 0;
    tickBlueberryRegrowth(state);
    expect(tree.blueberryYield).toBe(BLUEBERRY_MAX_YIELD);
  });

  it('uses the supplied blueberry sprite only for ripe blueberry-tree art', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/game/renderer/trees.ts'), 'utf8');
    const loaderSource = readFileSync(resolve(process.cwd(), 'src/game/spriteLoader.ts'), 'utf8');
    expect(source).toContain("'/sprites/blueberry_tree.png'");
    expect(source).toContain("tree.forageKind === 'blueberry'");
    expect(source).toContain('(tree.blueberryYield ?? 0) > 0');
    expect(loaderSource).toContain("'/sprites/blueberry_tree.png'");
  });
});

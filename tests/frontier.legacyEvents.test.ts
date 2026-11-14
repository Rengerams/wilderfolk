/**
 * Frontier legacy-event contracts from the full-code audit: citizenship establishes identity
 * (W-77), yearly spawns land on legal ground (W-81), poaching retires through the wildlife-death
 * owner (W-82), and one visitor camp at a time is the single gate (W-86).
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { isPassableWildlifePosition } from '../src/game/worldGen';
import { EntityType, TerrainType, BuildingType, emptyEntityByType } from '../src/game/gameTypes';
import type { Building, Entity, VisitorGroup, WorldMap, WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/entityFactory';
import {
  negotiateRefugees,
  spawnVisitorGroup,
  tickVisitorGroups,
  tryFirstWeekVisitor,
  rollYearlyWorldEvent,
} from '../src/game/groupEvents';
import { isFootprintOnBuildableTerrain, overlapsAnyBuilding } from '../src/game/placementUtils';
import { seededRandomForRun, resetSimRng, setSimSeed } from '../src/game/simRng';
import { TICKS_PER_DAY, getAbsoluteCalendarDay } from '../src/game/dayCycle';
import type { TickContext } from '../src/game/simulation/simulationTypes';

function paintMap(state: WorldState, isLand: (tx: number, ty: number, wx: number, wy: number) => boolean): void {
  const map: WorldMap = {
    width: Math.floor(state.width / 10),
    height: Math.floor(state.height / 10),
    seed: 1,
    rivers: [],
    preset: 'continental',
    size: 'medium',
    overrides: new Map(),
  } as unknown as WorldMap;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const land = isLand(tx, ty, tx * 10 + 5, ty * 10 + 5);
      map.overrides!.set(ty * map.width + tx, {
        type: land ? TerrainType.Grassland : TerrainType.DeepWater,
        elevation: land ? 50 : 0,
        moisture: 50,
        variation: 0,
      });
    }
  }
  state.worldMap = map;
}

function contextFor(state: WorldState): TickContext {
  const byType = emptyEntityByType();
  for (const entity of state.entities.filter((candidate) => candidate.alive)) byType[entity.type].push(entity);
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 0,
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
  } as unknown as TickContext;
}

function house(id: number, x: number, y: number): Building {
  return {
    id, type: BuildingType.House, x, y, width: 20, height: 20,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  } as Building;
}

describe('frontier legacy events', () => {
  it('W-77: a welcomed refugee has its genome and born marks at citizenship', () => {
    // Born marks are a seeded chance roll. Sweep fixtures until one really produces a mark, so the
    // assertion cannot pass vacuously: if citizenship stopped granting marks, no seed would.
    let sawBornMark = false;
    let welcomedCount = 0;
    for (let seed = 1; seed <= 60 && !sawBornMark; seed++) {
      resetSimRng();
      setSimSeed(seed);
      const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed });
      state.resources.food = 5000;
      spawnVisitorGroup(state, state.entities, state.buildings, 'refugees');
      const group = state.visitorGroups.find((candidate) => candidate.kind === 'refugees');
      if (!group) continue;
      const ids = new Set(group.entityIds);
      const next = negotiateRefugees(state, group.id, 'welcome');
      const welcomed = next.entities.filter((entity) => ids.has(entity.id) && entity.faction === undefined);
      welcomedCount += welcomed.length;
      for (const person of welcomed) {
        // Identity must exist before the settler can act, not after a later load backfill.
        expect(person.genomeV2, `seed ${seed}: welcomed settler has no genome`).toBeDefined();
        if ((person.marks ?? []).some((mark) => mark.source === 'born')) sawBornMark = true;
      }
    }
    expect(welcomedCount, 'no fixture welcomed a refugee').toBeGreaterThan(0);
    expect(sawBornMark, 'no welcomed refugee received a born mark across 60 seeds').toBe(true);
  });

  it('W-81: yearly wildlife and flora spawn only on legal ground', () => {
    const animals: Array<{ state: WorldState; entity: Entity }> = [];
    const props: Array<{ state: WorldState; entity: Entity }> = [];
    for (let seed = 1; seed <= 24; seed++) {
      resetSimRng();
      setSimSeed(seed);
      const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed });
      // A ring island: land only in a small inner disc and an outer band, water between.
      paintMap(state, (_tx, _ty, wx, wy) => {
        const distance = Math.hypot(wx - 600, wy - 450);
        return distance <= 120 || (distance >= 200 && distance <= 460);
      });
      const before = new Set(state.entities.map((entity) => entity.id));
      rollYearlyWorldEvent(
        state, state.entities, state.buildings, state.width, state.height, () => state.nextEntityId++,
      );
      for (const entity of state.entities) {
        if (before.has(entity.id)) continue;
        if (entity.type === EntityType.Wolf || entity.type === EntityType.Deer) animals.push({ state, entity });
        else if (entity.type === EntityType.Tree || entity.type === EntityType.Grass) props.push({ state, entity });
      }
    }

    // Guard against a vacuous pass: the fixture must actually roll spawn events.
    expect(animals.length, 'no yearly animals were spawned').toBeGreaterThan(0);
    expect(props.length, 'no yearly flora was spawned').toBeGreaterThan(0);
    for (const { state, entity } of animals) {
      expect(
        isPassableWildlifePosition(state, entity.x, entity.y),
        `${entity.type} spawned in water or on impassable ground at ${entity.x},${entity.y}`,
      ).toBe(true);
    }
    for (const { state, entity } of props) {
      expect(
        isFootprintOnBuildableTerrain(state, 32, 32, entity.x, entity.y)
        && !overlapsAnyBuilding(state.buildings, 32, 32, entity.x, entity.y),
        `${entity.type} spawned on an illegal prop site at ${entity.x},${entity.y}`,
      ).toBe(true);
    }
  });

  it('W-82: a poached deer is retired through the wildlife-death owner', () => {
    resetSimRng();
    setSimSeed(999);
    const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed: 999 });
    const groupId = 'wilderness-hunters';

    // Find a real poach tick for this group id on a processed day boundary.
    let tick = -1;
    let day = -1;
    for (let candidateDay = 3; candidateDay < 40 && tick < 0; candidateDay++) {
      const candidateTick = candidateDay * TICKS_PER_DAY;
      if (seededRandomForRun(`poach:${groupId}:${candidateTick}`) < 0.25) {
        tick = candidateTick;
        day = candidateDay;
      }
    }
    expect(tick, 'the fixture found no poach tick').toBeGreaterThan(0);

    state.tick = tick;
    state.lastProcessedCalendarDay = day - 1;
    state.entities = state.entities.filter((entity) => entity.type !== EntityType.Deer);
    const deer = createEntity(EntityType.Deer, 400, 400, state.nextEntityId++);
    state.entities.push(deer);
    const hunter = state.entities.find((entity) => entity.type === EntityType.Human && entity.alive)!;
    hunter.huntTargetId = deer.id;

    const group: VisitorGroup = {
      id: groupId, name: 'Hunters', kind: 'hunters', campX: 100, campY: 100,
      daysLeft: 5, entityIds: [], giftsGiven: 0, tradesCompleted: 0,
      refugeeResolved: true, leaderTalked: false, spawnedAtCalendarDay: getAbsoluteCalendarDay(tick) - 2,
    };
    state.visitorGroups = [group];

    const ctx = contextFor(state);
    tickVisitorGroups(state, state.entities, ctx);

    expect(deer.alive, 'the poached deer stayed alive').toBe(false);
    expect(ctx.entityById.has(deer.id), 'the dead deer stayed in the live index').toBe(false);
    expect(ctx.byType[EntityType.Deer].includes(deer), 'the dead deer stayed in its byType bucket').toBe(false);
    expect(hunter.huntTargetId, 'the hunter still targets the dead deer').toBeUndefined();
  });

  it('W-86: a second visitor camp is refused while one exists', () => {
    resetSimRng();
    setSimSeed(3);
    const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed: 3 });
    state.tick = 8 * TICKS_PER_DAY;
    state.buildings = [house(101, 600, 450)];
    spawnVisitorGroup(state, state.entities, state.buildings, 'traders');
    expect(state.visitorGroups).toHaveLength(1);

    const offered = tryFirstWeekVisitor(state, state.entities, state.buildings);
    expect(offered, 'a second camp was offered beside a live camp').toBeNull();
    expect(state.visitorGroups).toHaveLength(1);
  });
});

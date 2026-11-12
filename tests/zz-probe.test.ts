import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, TerrainType, BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, VisitorGroup, WorldMap, WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/entityFactory';
import { indexLivingEntity } from '../src/game/entityIndex';
import {
  negotiateRefugees,
  spawnVisitorGroup,
  tickVisitorGroups,
  tryFirstWeekVisitor,
  rollYearlyWorldEvent,
} from '../src/game/groupEvents';
import { pickSite } from '../src/game/worldEventSites';
import { isPassableWildlifePosition } from '../src/game/worldGen';
import { isFootprintOnBuildableTerrain, overlapsAnyBuilding } from '../src/game/placementUtils';
import { setSimSeed, seededRandomForRun, resetSimRng } from '../src/game/simRng';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { makeNextAliveDeer } from '../src/game/rivalEvents';
import { isNewCalendarDayTick } from '../src/game/dayCycleClock';
import { emptyEntityByType } from '../src/game/gameTypes';
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
  };
}

describe('probe', () => {
  it('W-77 refugee identity at welcome', () => {
    resetSimRng();
    const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed: 12_345 });
    state.resources.food = 5000;
    spawnVisitorGroup(state, state.entities, state.buildings, 'refugees');
    const group = state.visitorGroups.find((g) => g.kind === 'refugees')!;
    const ids = new Set(group.entityIds);
    const next = negotiateRefugees(state, group.id, 'welcome');
    const welcomed = next.entities.filter((e) => ids.has(e.id) && e.faction === undefined);
    console.log('W77 welcomed', welcomed.length, welcomed.map((p) => ({
      genome: p.genomeV2 !== undefined, marks: p.marks?.map((m) => m.id) ?? null,
    })));
    expect(welcomed.length).toBeGreaterThan(0);
  });

  it('W-81 yearly spawns on a ring-island map', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      resetSimRng();
      const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed });
      paintMap(state, (_tx, _ty, wx, wy) => {
        const d = Math.hypot(wx - 600, wy - 450);
        return d <= 120 || (d >= 200 && d <= 460);
      });
      const before = new Set(state.entities.map((e) => e.id));
      const rolled = rollYearlyWorldEvent(
        state, state.entities, state.buildings, state.width, state.height, () => state.nextEntityId++,
      );
      const spawned = state.entities.filter((e) => !before.has(e.id));
      const report = spawned.map((e) => ({
        type: e.type,
        x: Math.round(e.x),
        y: Math.round(e.y),
        passable: isPassableWildlifePosition(state, e.x, e.y),
        propLegal: isFootprintOnBuildableTerrain(state, 32, 32, e.x, e.y)
          && !overlapsAnyBuilding(state.buildings, 32, 32, e.x, e.y),
      }));
      console.log('W81 seed', seed, rolled.event?.id, report.length,
        report.filter((r) => (r.type === EntityType.Wolf || r.type === EntityType.Deer)
          ? !r.passable
          : !r.propLegal).length, 'illegal', JSON.stringify(report.slice(0, 3)));
    }
    expect(true).toBe(true);
  });

  it('W-85 pickSite widen scan ignores a rival camp', () => {
    resetSimRng();
    setSimSeed(7);
    const state = initGame({ skipTerrain: true, width: 400, height: 400, seed: 7 });
    paintMap(state, (tx, ty) => (
      (tx >= 17 && tx <= 22 && ty >= 17 && ty <= 22)
      || (tx >= 27 && tx <= 32 && ty >= 27 && ty <= 32)
    ));
    const site = pickSite(state, { x: 200, y: 150 }, 10, 20, [{ x: 200, y: 200 }]);
    console.log('W85 site', site, 'gap', Math.max(Math.abs(site.x - 200), Math.abs(site.y - 200)));
    expect(true).toBe(true);
  });

  it('W-82 find a poach tick and run the visitor hunter path', () => {
    const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed: 999 });
    for (const group of ['wilderness-hunters', 'hunters-probe']) {
      for (let day = 1; day < 16; day++) {
        const tick = day * TICKS_PER_DAY;
        const roll = seededRandomForRun(`poach:${group}:${tick}`);
        if (roll < 0.25) console.log('W82 poach tick', group, day, tick, roll);
      }
    }
    const deer = createEntity(EntityType.Deer, 400, 400, state.nextEntityId++);
    state.entities = state.entities.filter((e) => e.type !== EntityType.Deer);
    state.entities.push(deer);
    const hunter = state.entities.find((e) => e.type === EntityType.Human && e.alive)!;
    hunter.huntTargetId = deer.id;
    const ctx = contextFor(state);
    const group: VisitorGroup = {
      id: 'wilderness-hunters',
      name: 'Hunters',
      kind: 'hunters',
      campX: 100,
      campY: 100,
      daysLeft: 5,
      entityIds: [],
      giftsGiven: 0,
      tradesCompleted: 0,
      refugeeResolved: true,
      leaderTalked: false,
      spawnedAtCalendarDay: 0,
    };
    state.visitorGroups = [group];
    state.tick = 3 * TICKS_PER_DAY;
    console.log('W82 pre', state.tick, 'newDay', isNewCalendarDayTick(state), 'last', state.lastProcessedCalendarDay,
      'deer alive', deer.alive, 'groups', state.visitorGroups.length, 'entities', state.entities.length,
      'roll', seededRandomForRun(`poach:${group.id}:${state.tick}`),
      'nextDeer', makeNextAliveDeer(state.entities)()?.id ?? null,
      'kind', group.kind, 'daysLeft', group.daysLeft);
    tickVisitorGroups(state, state.entities);
    console.log('W82 deer alive', deer.alive, 'byTypeDeer', ctx.byType[EntityType.Deer].includes(deer),
      'target', hunter.huntTargetId, 'entityById', ctx.entityById.has(deer.id));
    expect(true).toBe(true);
  });

  it('W-86 second visitor camp in the first-week window', () => {
    resetSimRng();
    setSimSeed(3);
    const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed: 3 });
    state.tick = 7 * TICKS_PER_DAY;
    const house = {
      id: 101, type: BuildingType.House, x: 600, y: 450, width: 20, height: 20,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    } as Building;
    state.buildings = [house];
    spawnVisitorGroup(state, state.entities, state.buildings, 'traders');
    const event = tryFirstWeekVisitor(state, state.entities, state.buildings);
    console.log('W86 groups', state.visitorGroups.length, 'event', event?.id ?? null,
      'flag', state.firstWeekVisitorSpawned);
    expect(true).toBe(true);
  });
});

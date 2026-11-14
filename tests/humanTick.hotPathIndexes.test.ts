/**
 * PERF-04: camp, war-band and festival lookups are tick-stable, so `tickHumans` indexes them once
 * instead of scanning for every settler. The read counter proves the per-settler scan is gone.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, MapSize, Season, emptyEntityByType } from '../src/game/gameTypes';
import type { Building, Entity, VisitorGroup, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { tickHumans } from '../src/game/humanTick';
import { clearAllFactionWanderStates } from '../src/game/factionWander';
import { getCalendarDay, getColonyDay, setHumanBirthFromAge, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';
import { testWorldMap } from '../src/test/worldMapFixtures';
import type { TickContext } from '../src/game/simulation/simulationTypes';

const FIXTURE_SEED = 20_261_107;
/** 16:00 — inside the festival gathering window and outside the default work shift. */
const FESTIVAL_TICK = 16 * TICKS_PER_HOUR;
const SQUARE = { x: 640, y: 480, width: 40, height: 40 };
const SQUARE_CENTRE = { x: SQUARE.x + SQUARE.width / 2, y: SQUARE.y + SQUARE.height / 2 };

function building(
  id: number,
  type: BuildingType,
  at: { x: number; y: number; width: number; height: number },
): Building {
  return {
    id,
    type,
    x: at.x,
    y: at.y,
    width: at.width,
    height: at.height,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

function settler(world: WorldState, id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  const template = world.entities.find((e) => e.type === EntityType.Human && isPlayerHuman(e));
  if (!template) throw new Error('initGame produced no settler to use as the fixture template');
  const entity: Entity = {
    ...template,
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    alive: true,
    isJuvenile: false,
    job: JobType.Settler,
    workerBuildingId: undefined,
    residenceBuildingId: undefined,
    prisonBuildingId: undefined,
    partnerId: undefined,
    affairPartnerId: undefined,
    childrenIds: [],
    ...overrides,
  };
  setHumanBirthFromAge(entity, entity.age ?? 30, getColonyDay(world));
  return entity;
}

function visitorGroup(id: string, campX: number, campY: number, kind: VisitorGroup['kind'] = 'traders'): VisitorGroup {
  return {
    id,
    name: `Group ${id}`,
    kind,
    entityIds: [],
    campX,
    campY,
    daysLeft: 3,
    giftsGiven: 0,
    tradesCompleted: 0,
    refugeeResolved: false,
    leaderTalked: false,
  };
}

interface Fixture {
  world: WorldState;
  goers: Entity[];
}

/** Festival goers with no job or home, one Square placed last behind several filler buildings. */
function festivalFixture(goerCount: number): Fixture {
  const world = initGame({
    villageName: 'Hotpath', size: MapSize.Medium, seed: FIXTURE_SEED, skipTerrain: true,
  });
  world.worldMap = testWorldMap({ tilesX: 128, tilesY: 96, seed: FIXTURE_SEED });
  world.tick = FESTIVAL_TICK;
  world.dayInYear = getCalendarDay(FESTIVAL_TICK);
  world.festival = { active: true, name: 'Harvest Fair', daysLeft: 2 };

  const filler: Building[] = [];
  for (let i = 0; i < 40; i++) {
    filler.push(building(200 + i, BuildingType.House, { x: 60 + (i % 8) * 60, y: 60 + Math.floor(i / 8) * 60, width: 30, height: 30 }));
  }
  world.buildings = [...filler, building(101, BuildingType.TownHall, { x: 400, y: 300, width: 40, height: 40 }), building(900, BuildingType.Square, SQUARE)];

  const goers: Entity[] = [];
  for (let i = 0; i < goerCount; i++) {
    goers.push(settler(world, 10 + i, 200 + (i % 10) * 4, 460 + Math.floor(i / 10) * 4));
  }
  world.entities = goers;
  world.visitorGroups = [
    visitorGroup('V1', 100, 100),
    visitorGroup('V2', 120, 120),
    visitorGroup('P1', 300, 500, 'performers'),
  ];
  return { world, goers };
}

function simContext(state: WorldState, humans: Entity[]): TickContext {
  const byType = emptyEntityByType();
  byType[EntityType.Human] = humans;
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 16,
    season: Season.Summer,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((h) => [h.id, h])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
    hasWell: false,
    hasHospital: false,
  };
}

function countedBuildings(buildings: Building[], counter: { reads: number }): Building[] {
  return new Proxy(buildings, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && /^\d+$/.test(prop)) counter.reads++;
      return Reflect.get(target, prop, receiver);
    },
  });
}

function runTick(fixture: Fixture, counter?: { reads: number }): void {
  clearAllFactionWanderStates();
  const context = simContext(fixture.world, fixture.world.entities);
  if (counter) {
    const counted = countedBuildings(fixture.world.buildings, counter);
    context.updatedBuildings = counted;
    fixture.world.buildings = counted;
  }
  tickHumans(fixture.world, context);
}

beforeEach(() => {
  clearAllFactionWanderStates();
});

describe('humanTick per-settler lookups', () => {
  it('single building scan does not grow with the number of festival goers', () => {
    const small = festivalFixture(20);
    const large = festivalFixture(80);

    const smallCounter = { reads: 0 };
    const largeCounter = { reads: 0 };
    runTick(small, smallCounter);
    runTick(large, largeCounter);

    // The old shape read the building list once per goer: four times the goers meant four times
    // the reads. Indexed lookups keep the extra reads near the one extra pass over the cast.
    expect(largeCounter.reads).toBeLessThan(smallCounter.reads * 1.8 + 200);
  });

  it('sends every festival goer to the Square even when it sits last in the building list', () => {
    const fixture = festivalFixture(30);
    const startX = fixture.goers.map((goer) => goer.x);

    runTick(fixture);

    const movedTowardSquare = fixture.goers.filter((goer, index) => goer.x > startX[index]).length;
    expect(movedTowardSquare).toBeGreaterThan(fixture.goers.length / 2);
    expect(SQUARE_CENTRE.x).toBeGreaterThan(startX[0]);
  });

  it('resolves each visitor against its own group, not the first group in the list', () => {
    const fixture = festivalFixture(1);
    const visitor = settler(fixture.world, 500, 320, 320, { faction: 'visitor', groupId: 'V2' });
    fixture.world.festival = null;
    fixture.world.entities = [visitor];
    fixture.world.visitorGroups = [
      visitorGroup('V1', 100, 100),
      visitorGroup('V2', 1200, 320),
    ];

    runTick(fixture);

    // V2 camp lies to the east, V1's to the north-west: only the indexed lookup reaches V2.
    expect(visitor.x).toBeGreaterThan(320);
  });
});

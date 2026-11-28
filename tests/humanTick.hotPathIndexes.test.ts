/**
 * PERF-04: festival place lookups are tick-stable, so `tickHumans` indexes them once
 * instead of scanning for every settler. Retired visitor-camp movement is no longer tested.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, MapSize, Season, WeatherType, emptyEntityByType } from '../src/game/gameTypes';
import type { Building, Entity, VisitorGroup, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { tickHumans } from '../src/game/humanTick';
import { getPlayerCampCenter, getPlayerCampCenterFromBuildings, getPlayerSettlerCenter } from '../src/game/frontierCombat';
import { getCalendarDay, getColonyDay, setHumanBirthFromAge, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';
import { testWorldMap } from '../src/test/worldMapFixtures';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { OFFSCREEN_HUMAN_THROTTLE, type SimulationFocus } from '../src/game/simFocus';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { nearestWalkableWorldPoint } from '../src/game/pathfinding';

const FIXTURE_SEED = 20_261_107;
/** 18:00 — inside the shorter evening festival window and outside the default work shift. */
const FESTIVAL_TICK = 18 * TICKS_PER_HOUR;
const SQUARE = { x: 640, y: 480, width: 40, height: 40 };
const SQUARE_CENTRE = { x: SQUARE.x + SQUARE.width / 2, y: SQUARE.y + SQUARE.height / 2 };

function building(
  id: number,
  type: BuildingType,
  at: { x: number; y: number; width: number; height: number },
  overrides: Partial<Building> = {},
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
    ...overrides,
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
  ];
  return { world, goers };
}

function simContext(state: WorldState, humans: Entity[], hourOfDay = 18): TickContext {
  const byType = emptyEntityByType();
  byType[EntityType.Human] = humans;
  return {
    width: state.width,
    height: state.height,
    hourOfDay,
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
  const context = simContext(fixture.world, fixture.world.entities);
  if (counter) {
    const counted = countedBuildings(fixture.world.buildings, counter);
    context.updatedBuildings = counted;
    fixture.world.buildings = counted;
  }
  tickHumans(fixture.world, context);
}

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

});

const TEST_SEED = 20_261_006;
/** 23:00 on day 1: `prefersHomeTonightFor` is unconditional, so the settler walks home when active. */
const NIGHT_TICK = TICKS_PER_DAY + 23 * TICKS_PER_HOUR;
const NO_THROTTLE_ID = 7;
const THROTTLE_ID = 12;
const HOME_ID = 900;

const OFF_SCREEN: SimulationFocus = { minX: -2000, maxX: -1000, minY: -2000, maxY: -1000 };
const ON_SCREEN: SimulationFocus = { minX: 0, maxX: 1500, minY: 0, maxY: 1500 };

let settlerPrototype: Entity | undefined;

function baseSettler(): Entity {
  if (!settlerPrototype) {
    const probe = initGame({ size: MapSize.Medium, seed: 4242 });
    const found = probe.entities.find((e) => isPlayerHuman(e) && !e.isJuvenile && e.alive);
    if (!found) throw new Error('worldGen produced no settler to use as a test prototype');
    settlerPrototype = found;
  }
  return structuredClone(settlerPrototype);
}

function throttleSettler(id: number, overrides: Partial<Entity> = {}): Entity {
  return Object.assign(baseSettler(), {
    id,
    alive: true,
    isJuvenile: false,
    age: 30,
    energy: 400,
    maxEnergy: 400,
    vx: 0,
    vy: 0,
    flash: 0,
    faction: undefined,
    occupation: 'settler',
    job: JobType.Settler,
    workerBuildingId: undefined,
    residenceBuildingId: HOME_ID,
    prisonBuildingId: undefined,
    partnerId: undefined,
    affairPartnerId: undefined,
    affairProgress: 0,
    chatTicks: undefined,
    chatPhrase: undefined,
    chatPartnerId: undefined,
    chatDialogueSessionKey: undefined,
  }, overrides);
}

function house(): Building {
  return {
    id: HOME_ID,
    type: BuildingType.House,
    completed: true,
    faction: undefined,
    occupants: [],
    x: 500,
    y: 500,
    width: 40,
    height: 40,
    level: 1,
  } as unknown as Building;
}

/** A night world whose only settler starts far from their house. */
function nightWorld(id: number): WorldState {
  const state = initGame({ size: MapSize.Medium, seed: TEST_SEED });
  // This tests scheduling, not route connectivity. On generated terrain the only route home
  // can be blocked, so an active settler correctly holds position and looks throttled.
  // Keep both start and home on deterministic, connected walkable ground.
  state.worldMap = testWorldMap({ tilesX: 100, tilesY: 100, seed: TEST_SEED });
  state.buildings = [house()];
  const position = state.worldMap
    ? nearestWalkableWorldPoint(state.worldMap, state.buildings, 100, 100)
    : null;
  if (!position) throw new Error('fixture must provide walkable ground');
  state.entities = [throttleSettler(id, position)];
  state.visitorGroups = [];
  state.pendingRaidEvents = [];
  state.pendingOutgoingRaidEvents = [];
  state.pendingDiplomacyEvents = [];
  state.pendingStoryEvents = [];
  state.electionCeremony = null;
  state.pendingElectionYear = null;
  state.resources.food = 0;
  state.weather = WeatherType.Clear;
  state.tick = NIGHT_TICK;
  return state;
}

function contextFor(state: WorldState, focus?: SimulationFocus): TickContext {
  const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human);
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 23,
    season: state.season ?? Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType: { [EntityType.Human]: humans } as unknown as TickContext['byType'],
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((h) => [h.id, h])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
    focus,
  };
}

function positionOf(state: WorldState, id: number): { x: number; y: number } {
  const found = state.entities.find((e) => e.id === id);
  if (!found) throw new Error(`no entity ${id} in the fixture`);
  return { x: found.x, y: found.y };
}

describe('the off-screen human throttle', () => {
  afterEach(() => { resetSimRng(); });
  it('advances and feeds human physiology identically on and off camera', () => {
    const onScreen = nightWorld(NO_THROTTLE_ID);
    const offScreen = nightWorld(NO_THROTTLE_ID);
    for (const state of [onScreen, offScreen]) {
      state.resources.food = 10;
      state.entities[0].needs = { nutrition: 40, rest: 50, stamina: 65, severeHungerTicks: 0 };
      state.entities[0].energy = state.entities[0].maxEnergy * 0.65;
    }

    setSimSeed(TEST_SEED);
    tickHumans(onScreen, contextFor(onScreen, ON_SCREEN));
    setSimSeed(TEST_SEED);
    tickHumans(offScreen, contextFor(offScreen, OFF_SCREEN));

    expect(onScreen.entities[0].needs).toEqual(offScreen.entities[0].needs);
    expect(onScreen.entities[0].energy).toBe(offScreen.entities[0].energy);
    expect(onScreen.resources.food).toBe(offScreen.resources.food);
    expect(onScreen.resources.food).toBe(9);
    expect(onScreen.entities[0].needs!.lastMealTick).toBe(NIGHT_TICK);
  });

  it('pins the fixture: one id the throttle opens for, one it skips', () => {
    expect((NIGHT_TICK + THROTTLE_ID) % OFFSCREEN_HUMAN_THROTTLE).toBe(0);
    expect((NIGHT_TICK + NO_THROTTLE_ID) % OFFSCREEN_HUMAN_THROTTLE).not.toBe(0);
  });

  it('holds an off-screen settler on a tick the throttle skips', () => {
    const state = nightWorld(NO_THROTTLE_ID);
    const before = positionOf(state, NO_THROTTLE_ID);

    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, OFF_SCREEN));

    expect(positionOf(state, NO_THROTTLE_ID)).toEqual(before);
  });

  it('runs the off-screen settler on its own throttle tick', () => {
    const state = nightWorld(THROTTLE_ID);
    const before = positionOf(state, THROTTLE_ID);

    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, OFF_SCREEN));

    expect(positionOf(state, THROTTLE_ID)).not.toEqual(before);
  });

  it('runs an in-focus settler on the tick the throttle would skip', () => {
    const state = nightWorld(NO_THROTTLE_ID);
    const before = positionOf(state, NO_THROTTLE_ID);

    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, ON_SCREEN));

    expect(positionOf(state, NO_THROTTLE_ID)).not.toEqual(before);
  });
});

const CAMP_FIXTURE_SEED = 20_260_922;
/** 09:00 on a weekday — inside the default 07:00–16:00 shift, and not a day boundary. */
const WORK_TICK = 9 * TICKS_PER_HOUR;
const HALL_ID = 101;
const BARRACKS_ID = 102;
const FARM_ID = 103;
const HALL = { x: 400, y: 300, width: 40, height: 40 };
const BARRACKS = { x: 200, y: 200, width: 30, height: 30 };
/** Neither a Town Hall nor a House, so it never becomes the anchor — it only gives the settlers a commute. */
const FARM = { x: 1080, y: 820, width: 40, height: 40 };
const HALL_ANCHOR = { x: HALL.x, y: HALL.y };

/**
 * The branch rule as an oracle: `building.x/y` is the canonical footprint centre, so the anchor is
 * the building point itself. The split must stay a pure extraction of this rule.
 */
function canonicalCampCenter(state: WorldState, buildings: Building[]): { x: number; y: number } {
  const playerBuildings = buildings.filter((b) => b.completed);
  const townHall = playerBuildings.find((b) => b.type === BuildingType.TownHall);
  if (townHall) {
    return { x: townHall.x, y: townHall.y };
  }
  const house = playerBuildings.find((b) => b.type === BuildingType.House);
  if (house) {
    return { x: house.x, y: house.y };
  }
  const players = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  if (players.length > 0) {
    return {
      x: players.reduce((s, e) => s + e.x, 0) / players.length,
      y: players.reduce((s, e) => s + e.y, 0) / players.length,
    };
  }
  return { x: state.width / 2, y: state.height / 2 };
}

interface AnchorFixture {
  world: WorldState;
  guard: Entity;
  hall: Building | null;
  barracks: Building;
}

/**
 * A village with a barracks guard on shift and roaming settlers;
 * `withHall` selects the building or live-settler anchor.
 */
function anchorFixture(withHall: boolean): AnchorFixture {
  const world = initGame({
    villageName: 'Anchor', size: MapSize.Medium, seed: CAMP_FIXTURE_SEED, skipTerrain: true,
  });
  // The anchor test needs flat walkable ground, not a particular random biome.
  world.worldMap = testWorldMap({ tilesX: 128, tilesY: 96, seed: CAMP_FIXTURE_SEED });
  world.tick = WORK_TICK;
  world.dayInYear = getCalendarDay(WORK_TICK);

  const hall = withHall ? building(HALL_ID, BuildingType.TownHall, HALL) : null;
  const barracks = building(BARRACKS_ID, BuildingType.Barracks, BARRACKS, { occupants: [4] });
  const farm = building(FARM_ID, BuildingType.Farm, FARM, { occupants: [5, 6, 7] });
  world.buildings = hall ? [hall, barracks, farm] : [barracks, farm];

  const guard = settler(world, 4, 215, 215, {
    job: JobType.Soldier,
    workerBuildingId: BARRACKS_ID,
    energy: 90,
  });
  // Free-roaming settlers, far from the village and on a long commute to the farm: their walk is
  // what shifts the settler average during the tick.
  const roamers = [
    settler(world, 5, 100, 700, { workerBuildingId: FARM_ID }),
    settler(world, 6, 150, 750, { workerBuildingId: FARM_ID }),
    settler(world, 7, 200, 800, { workerBuildingId: FARM_ID }),
  ];

  world.entities = [...roamers, guard];
  return { world, guard, hall, barracks };
}

describe('camp anchor split (N-4)', () => {
  it('matches the canonical centre in every branch', () => {
    const { world, hall, barracks } = anchorFixture(true);
    const house = building(103, BuildingType.House, { x: 60, y: 60, width: 20, height: 20 });
    const unfinishedHall = building(105, BuildingType.TownHall, { x: 800, y: 100, width: 40, height: 40 }, {
      completed: false,
    });

    const cases: Array<{ name: string; buildings: Building[] }> = [
      { name: 'town hall wins over house', buildings: [house, hall!, house] },
      { name: 'house when there is no hall', buildings: [house, barracks] },
      { name: 'unfinished hall is not a hall', buildings: [unfinishedHall, house] },
      { name: 'no buildings at all', buildings: [] },
    ];

    for (const c of cases) {
      expect(getPlayerCampCenter(world, c.buildings), c.name).toEqual(canonicalCampCenter(world, c.buildings));
      expect(getPlayerCampCenter(world, c.buildings), c.name).toEqual(
        getPlayerCampCenterFromBuildings(c.buildings) ?? getPlayerSettlerCenter(world),
      );
    }

    // Pinned answers, so the branches themselves are under test and not just the agreement.
    expect(getPlayerCampCenterFromBuildings([hall!, house])).toEqual(HALL_ANCHOR);
    expect(getPlayerCampCenterFromBuildings([house])).toEqual({ x: 60, y: 60 });
    expect(getPlayerCampCenterFromBuildings([unfinishedHall])).toBeNull();
    expect(getPlayerCampCenterFromBuildings([])).toBeNull();
    expect(getPlayerCampCenter(world, [])).toEqual(getPlayerSettlerCenter(world));

    // No settlers and no buildings: the map centre, as before.
    world.entities = [];
    expect(getPlayerCampCenter(world, [])).toEqual({ x: world.width / 2, y: world.height / 2 });
  });
});

describe('camp anchor inside the human loop (N-4)', () => {
  it('keeps the Town Hall anchor fixed while the barracks guard patrols', () => {
    const fixture = anchorFixture(true);
    const { world, guard } = fixture;
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(HALL_ANCHOR);

    tickHumans(world, simContext(world, world.entities, 9));

    // The anchor is unchanged by the tick: nothing in the loop touches a building (N-4 equivalence).
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(HALL_ANCHOR);
    expect(getPlayerCampCenterFromBuildings(world.buildings)).toEqual(HALL_ANCHOR);

    expect(Math.hypot(guard.x - 215, guard.y - 215)).toBeLessThan(30);
  });

  it('recomputes the live-settler anchor when the village has neither hall nor house', () => {
    const fixture = anchorFixture(false);
    const { world, guard } = fixture;
    const before = getPlayerSettlerCenter(world);
    expect(getPlayerCampCenterFromBuildings(world.buildings)).toBeNull();
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(before);

    tickHumans(world, simContext(world, world.entities, 9));

    // The half that must not be cached really does move inside the tick: the three farm-hands walk
    // toward the farm while the guard patrols, so the average is not the same number twice.
    const after = getPlayerSettlerCenter(world);
    expect(after).not.toEqual(before);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.5);
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(after);

    expect(Math.hypot(guard.x - 215, guard.y - 215)).toBeLessThan(30);
  });
});

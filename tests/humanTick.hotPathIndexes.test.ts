import { HUMAN_SCENARIO_SEED, scenarioSettler, scenarioBuilding, scenarioWorld, scenarioContext } from './helpers/humanScenario';
import { SOCIAL_STAGGER } from '../src/game/adaptiveSpatialQuery';
import { NIGHT_START } from '../src/game/daycycleconstants';
import { buildingAccessPoint } from '../src/game/buildingAccess';
import { DEFAULT_WORK_SCHEDULE } from '../src/game/workSchedule';
import { prefersHomeTonightFor } from '../src/game/humanSchedule';
import { building as staffingBuilding, human as sharedHuman } from '../src/test/factories';
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
import { TICKS_PER_DAY, PER_TICK_RATE_SCALE, getHourOfDay } from '../src/game/dayCycleClock';
import { resetSimRng, setSimSeed, personDayRoll, seededRandomForRun } from '../src/game/simRng';
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

function simContext(state: WorldState, humans: Entity[], hourOfDay = 18, focus?: SimulationFocus): TickContext {
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
    focus,
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

describe('human tick duty and offscreen physiology', () => {
  function pickId(predicate: (id: number) => boolean): number {
    for (let id = 1; id <= 500; id++) {
      if (predicate(id)) return id;
    }
    throw new Error('no fixture id satisfied the predicate');
  }

  const FAR_FOCUS: SimulationFocus = { minX: 5000, maxX: 6000, minY: 5000, maxY: 6000 };

  describe('M15 — one energy-drain rule on the throttled path', () => {
    const restingTick = TICKS_PER_DAY + 23 * TICKS_PER_HOUR; // 23:00 on day 1
    const restingHour = 23;
    const settlerId = pickId(
      (id) =>
        prefersHomeTonightFor(DEFAULT_WORK_SCHEDULE, id, restingTick, restingHour)
        && (restingTick + id) % OFFSCREEN_HUMAN_THROTTLE !== 0,
    );

    function restingSettlerWorld(): WorldState {
      const state = initGame({ size: MapSize.Medium, seed: 7 });
      const home = staffingBuilding(900, BuildingType.House, { x: 0, y: 0, width: 46, height: 40, occupants: [settlerId] });
      const settler = sharedHuman(settlerId, { maxAge: 80,
        x: home.x + home.width / 2,
        y: home.y + home.height / 2,
        energy: 500,
        maxEnergy: 500,
        residenceBuildingId: 900,
      });
      state.tick = restingTick;
      state.entities = [settler];
      state.buildings = [home];
      state.resources.food = 0;
      return state;
    }

    it('drains the same stamina on-screen and off-screen', () => {
      expect(prefersHomeTonightFor(DEFAULT_WORK_SCHEDULE, settlerId, restingTick, restingHour)).toBe(true);

      const onscreen = restingSettlerWorld();
      tickHumans(onscreen, simContext(onscreen, onscreen.entities, restingHour));
      const onscreenStamina = onscreen.entities.find((e) => e.id === settlerId)!.needs!.stamina;

      const offscreen = structuredClone(restingSettlerWorld());
      tickHumans(offscreen, simContext(offscreen, offscreen.entities, restingHour, FAR_FOCUS));
      const offscreenStamina = offscreen.entities.find((e) => e.id === settlerId)!.needs!.stamina;

      expect(offscreenStamina).toBeCloseTo(onscreenStamina, 6);
    });
  });

  describe('M16 — on-duty official reaches officialHandlePetitioners', () => {
    const dayJobTick = TICKS_PER_DAY + 10 * TICKS_PER_HOUR; // 10:00 on a work day
    const dayJobHour = 10;
    const officialId = pickId(
      (id) => (dayJobTick + id) % 3 !== 0 && personDayRoll(id, dayJobTick, 836) < 0.4,
    );
    const petitionerId = officialId + 500;

    function townHallWorld(): WorldState {
      const state = initGame({ size: MapSize.Medium, seed: 7 });
      // The hall stands on the generated camp clearing, so its doorstep is open, walkable ground.
      const site = state.worldMap?.campSite ?? { x: 300, y: 300 };
      const hall = staffingBuilding(900, BuildingType.TownHall, {
        x: site.x,
        y: site.y,
        width: 60,
        height: 50,
        occupants: [officialId],
      });
      // `building.x/y` is the footprint centre; the official works at the hall's canonical south
      // doorstep (bare-grid frontage), not at the old corner + 0.9 height reference.
      const doorstep = buildingAccessPoint(hall, null);
      const official = sharedHuman(officialId, { maxAge: 80,
        x: doorstep.x,
        y: doorstep.y,
        workerBuildingId: 900,
        job: JobType.Official,
        occupation: 'official',
        energy: 500,
        maxEnergy: 500,
        gender: 'male',
      });
      // A grieving settler next to the hall always wants a civic audience.
      const petitioner = sharedHuman(petitionerId, { maxAge: 80,
        x: doorstep.x + 4,
        y: doorstep.y + 4,
        griefUntilTick: dayJobTick + 1000,
        energy: 500,
        maxEnergy: 500,
        gender: 'female',
      });
      state.tick = dayJobTick;
      state.entities = [official, petitioner];
      state.buildings = [hall];
      state.resources.food = 0;
      return state;
    }

    it('runs the hall audience behaviour and greets the petitioner', () => {
      const world = townHallWorld();
      tickHumans(world, simContext(world, world.entities, dayJobHour));

      const official = world.entities.find((e) => e.id === officialId)!;
      expect(official.chatPhrase).toBeTruthy();
    });
  });
});

describe('one definition of the village anchor', () => {
  it('prefers a hall, then a house, then the settler mean — never a stray building', () => {
    const hall = {
      id: 1, type: BuildingType.TownHall, completed: true, x: 100, y: 100, width: 40, height: 40,
    } as never;
    const house = {
      id: 2, type: BuildingType.House, completed: true, x: 200, y: 200, width: 20, height: 20,
    } as never;
    const barracks = {
      id: 3, type: BuildingType.Barracks, completed: true, x: 900, y: 900, width: 40, height: 40,
    } as never;

    // `building.x/y` is the canonical footprint centre (buildingGeometry), so the anchor is that
    // point itself; adding half a footprint would put the camp ~2 tiles south-east of the hall.
    expect(getPlayerCampCenterFromBuildings([hall, house])).toEqual({ x: 100, y: 100 });
    expect(getPlayerCampCenterFromBuildings([house])).toEqual({ x: 200, y: 200 });
    // No hall and no house: the building half must decline, which is what lets the settler mean answer.
    expect(getPlayerCampCenterFromBuildings([barracks])).toBeNull();

    // This is the case the renderer's private copy got wrong: it returned the first completed player
    // building (the Barracks at 920,920) while the simulation anchored on the settlers.
    const world = {
      entities: [sharedHuman(1, { x: 300, y: 300 }), sharedHuman(2, { x: 400, y: 400 })],
      width: 1000,
      height: 1000,
    };
    expect(getPlayerCampCenter(world, [barracks])).toEqual({ x: 350, y: 350 });
  });


});

describe('Human tick priority and upkeep regressions', () => {
  afterEach(resetSimRng);

  describe('war-band human upkeep', () => {
    it('lets an exhausted, expectant soldier recover during seven hours of camp sleep', () => {
      const state = scenarioWorld();
      const soldier = scenarioSettler(77, {
        gender: 'female', pregnant: true, pregnancyProgress: 10, pregnancyDueProgress: 5000,
        job: JobType.Soldier, raidDeploymentId: 'outgoing_raid_test',
      });
      soldier.needs = { nutrition: 80, rest: 0, stamina: 0, severeHungerTicks: 0 };
      state.entities = [soldier];
      setSimSeed(HUMAN_SCENARIO_SEED);
      const start = TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR;
      for (let offset = 0; offset < 7 * TICKS_PER_HOUR; offset++) {
        state.tick = start + offset;
        tickHumans(state, scenarioContext(state, [soldier]));
      }
      expect(soldier.needs!.rest).toBeGreaterThan(90);
      expect(soldier.needs!.stamina).toBeGreaterThan(90);
      expect(soldier.energy).toBe(90);
      expect(soldier.raidDeploymentId).toBe('outgoing_raid_test');
      expect(soldier.pregnant).toBe(true);
      expect(soldier.indoorBuildingId).toBeUndefined();
    });

    it('does not count a marching soldier as present or working at the village barracks', () => {
      const state = scenarioWorld();
      const barracks = scenarioBuilding(9, BuildingType.Barracks, { x: 0, y: 0 });
      const soldier = scenarioSettler(78, {
        job: JobType.Soldier, workerBuildingId: barracks.id, raidDeploymentId: 'outgoing_raid_test',
      });
      soldier.needs = { nutrition: 80, rest: 85, stamina: 100, severeHungerTicks: 0 };
      state.entities = [soldier];
      state.buildings = [barracks];
      barracks.occupants = [soldier.id];
      state.tick = TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
      tickHumans(state, scenarioContext(state, [soldier]));
      expect(soldier.scheduleWorkedTicksToday ?? 0).toBe(0);
      expect(soldier.schedulePresentTicksToday ?? 0).toBe(0);
      expect(soldier.needs!.stamina).toBeLessThan(100);
      expect(soldier.raidDeploymentId).toBe('outgoing_raid_test');
    });
  });

  describe('nightly recovery keeps priority over spouse-following', () => {
    it('sends an exhausted, married woman home instead of slowly chasing her spouse', () => {
      const state = scenarioWorld();
      const house = scenarioBuilding(97, BuildingType.House, { x: 500, y: 500 });
      const wife = scenarioSettler(88, {
        gender: 'female', x: 720, y: 500, partnerId: 89,
        relationshipStatus: 'married', reproductionCooldown: 0,
        residenceBuildingId: house.id,
      });
      const husband = scenarioSettler(89, {
        gender: 'male', x: 1110, y: 500, partnerId: wife.id,
        relationshipStatus: 'married', residenceBuildingId: house.id,
      });
      house.occupants = [wife.id, husband.id];
      state.buildings = [house];
      state.entities = [wife, husband];
      state.tick = TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR + 2;
      wife.needs = {
        nutrition: 80, rest: 0, stamina: 0, severeHungerTicks: 0,
        breakUntilRecovered: true,
        sleepRecoveryUntilTick: state.tick + 8 * TICKS_PER_HOUR,
      };

      const homeDistance = Math.hypot(wife.x - house.x, wife.y - house.y);
      const spouseStart = { x: husband.x, y: husband.y };
      const spouseDistance = Math.hypot(wife.x - spouseStart.x, wife.y - spouseStart.y);
      tickHumans(state, scenarioContext(state, [wife, husband]));

      // Both settlers move during the tick; compare against the original chase target.
      expect(Math.hypot(wife.x - house.x, wife.y - house.y)).toBeLessThan(homeDistance);
      expect(Math.hypot(wife.x - spouseStart.x, wife.y - spouseStart.y)).toBeGreaterThan(spouseDistance);
      expect(Math.hypot(wife.vx, wife.vy)).toBeGreaterThan(8);
      expect(wife.needs?.sleepRecoveryUntilTick).toBeGreaterThan(state.tick);
    });
  });

  describe('L39 — ambient dialogue cadence', () => {
    /** Quiet-at-home settler (no commute, no leisure) whose ambient roll passes. */
    function quietAmbientTick(id: number, aligned: boolean): number {
      for (let day = 1; day < 5000; day++) {
        for (let slot = 0; slot < TICKS_PER_DAY; slot++) {
          const tick = day * TICKS_PER_DAY + slot;
          const bucket = (tick + id) % SOCIAL_STAGGER;
          if (aligned ? bucket !== 0 : bucket === 0) continue;
          if (!aligned && (tick + id) % 3 !== 0) continue;
          const hour = getHourOfDay(tick);
          if (hour < 5 || hour >= 20) continue;
          if (!prefersHomeTonightFor({ startHour: 20, endHour: 23 }, id, tick, hour)) continue;
          if (seededRandomForRun(`chat-ambient:${id}:${tick}`) > 0.036 * PER_TICK_RATE_SCALE) continue;
          return tick;
        }
      }
      throw new Error('no ambient dialogue tick found');
    }

    function runAmbient(tick: number): { speaker: Entity; peer: Entity } {
      const state = scenarioWorld();
      state.tick = tick;
      state.workSchedule = { startHour: 20, endHour: 23 };
      const speaker = scenarioSettler(1, { x: 0, y: 0, gender: 'male', relationshipStatus: 'married', partnerId: 999 });
      const peer = scenarioSettler(2, { x: 10, y: 0, gender: 'female', relationshipStatus: 'married', partnerId: 998 });
      state.entities = [speaker, peer];
      setSimSeed(HUMAN_SCENARIO_SEED);
      tickHumans(state, scenarioContext(state, [speaker, peer]));
      return { speaker, peer };
    }

    /** The ambient roll for the observed settler must actually pass on the chosen tick. */
    function expectRollPasses(id: number, tick: number): void {
      setSimSeed(HUMAN_SCENARIO_SEED);
      expect(seededRandomForRun(`chat-ambient:${id}:${tick}`)).toBeLessThanOrEqual(0.036 * PER_TICK_RATE_SCALE);
    }

    it('never rolls ambient dialogue on a tick the neighbour scan skips', () => {
      setSimSeed(HUMAN_SCENARIO_SEED);
      const tick = quietAmbientTick(1, false);
      expect((tick + 1) % SOCIAL_STAGGER).not.toBe(0);
      expect((tick + 1) % 3).toBe(0);
      expectRollPasses(1, tick);

      const { speaker } = runAmbient(tick);

      // An ambient roll on a bucket the neighbour scan rejects must not speak a solo line.
      expect(speaker.chatPhrase).toBeUndefined();
      expect(speaker.chatDialogueSessionKey).toBeUndefined();
    });

    it('still pairs with a nearby settler on the aligned bucket', () => {
      setSimSeed(HUMAN_SCENARIO_SEED);
      const tick = quietAmbientTick(1, true);
      expect((tick + 1) % SOCIAL_STAGGER).toBe(0);
      expectRollPasses(1, tick);

      const { speaker, peer } = runAmbient(tick);

      expect(speaker.chatPartnerId).toBe(peer.id);
    });
  });

  describe('L40 — prisoner upkeep', () => {
    it('advances a jailed settler\'s dialogue timer instead of freezing it', () => {
      const state = scenarioWorld();
      const prison = scenarioBuilding(9, BuildingType.Prison, { x: 100, y: 100 });
      state.buildings = [prison];
      const prisoner = scenarioSettler(1, {
        x: 100,
        y: 100,
        prisonBuildingId: prison.id,
        chatPhrase: 'Let me out.',
        chatTicks: 6,
      });
      prison.occupants = [prisoner.id];
      state.entities = [prisoner];

      tickHumans(state, scenarioContext(state, [prisoner]));

      // A jailed settler still advances the chat timer.
      expect(prisoner.chatTicks).toBe(5);
      expect(prisoner.chatPhrase).toBe('Let me out.');
    });
  });

  describe('L41 — realtime affair gate honours the colony work schedule', () => {
    /** First in-game noon that keeps the settler home on the evening work window. */
    function noonTick(): number {
      for (let day = 1; day < 5000; day++) {
        const tick = day * TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
        if (prefersHomeTonightFor({ startHour: 20, endHour: 23 }, 1, tick, 12)) return tick;
      }
      throw new Error('no noon tick found');
    }

    function affairScene(tick: number, startHour: number, endHour: number): Entity {
      const state = scenarioWorld();
      state.tick = tick;
      state.worldMap = null;
      state.workSchedule = { startHour, endHour };
      const farm = scenarioBuilding(1, BuildingType.Farm, { x: 180, y: 400 });
      const farmHand = scenarioSettler(1, {
        x: 400,
        y: 400,
        gender: 'male',
        relationshipStatus: 'married',
        partnerId: 999, // absent spouse: the gate only depends on the schedule
        workerBuildingId: farm.id,
        job: JobType.Farmer,
        occupation: 'farmer',
      });
      farm.occupants = [farmHand.id];
      const lover = scenarioSettler(2, {
        x: 600,
        y: 400,
        gender: 'female',
        relationshipStatus: 'married',
        partnerId: 998,
        affairPartnerId: farmHand.id,
      });
      farmHand.affairPartnerId = lover.id;
      state.buildings = [farm];
      state.entities = [farmHand, lover];
      setSimSeed(HUMAN_SCENARIO_SEED);
      tickHumans(state, scenarioContext(state, [farmHand, lover]));
      return farmHand;
    }

    it('does not open the affair gate when the schedule excludes the hour', () => {
      setSimSeed(HUMAN_SCENARIO_SEED);
      const tick = noonTick();

      // The player's 20:00–23:00 schedule excludes noon, so the affair gate stays shut.
      const farmHand = affairScene(tick, 20, 23);

      expect(farmHand.vx).toBe(0);
      expect(farmHand.vy).toBe(0);
    });

    it('keeps the work commute ahead of an affair during the scheduled shift', () => {
      setSimSeed(HUMAN_SCENARIO_SEED);
      const tick = noonTick();
      const farmHand = affairScene(tick, 7, 16);

      // The farm is to the left and the lover to the right: work must win at noon.
      expect(farmHand.vx).toBeLessThan(0);
    });
  });

  describe('L42 — company-following leisure replaces stale velocity', () => {
    /** Ticks whose deterministic rolls put the settler on the spouse-following branch. */
    function companyFollowTicks(): number[] {
      const ticks: number[] = [];
      for (let day = 1; day < 5000 && ticks.length < 8; day++) {
        const tick = day * TICKS_PER_DAY + 15 * TICKS_PER_HOUR;
        const leisureSlotPeriod = 80 * TICKS_PER_HOUR;
        const leisureSlot = Math.floor(tick / leisureSlotPeriod + 1 * 3); // entity id 1
        if (personDayRoll(1, tick, 510 + leisureSlot) >= 0.4) continue;
        if (personDayRoll(1, tick, 520 + leisureSlot) >= 0.78) continue;
        ticks.push(tick);
      }
      if (ticks.length === 0) throw new Error('no company-following leisure tick found');
      return ticks;
    }

    function runCompanyFollow(fixture: WorldState, tick: number, previousVx: number): number {
      const state = structuredClone(fixture);
      state.tick = tick;
      const speaker = scenarioSettler(1, {
        x: 400,
        y: 400,
        vx: previousVx,
        gender: 'male',
        relationshipStatus: 'married',
        partnerId: 2,
      });
      const spouse = scenarioSettler(2, { x: 600, y: 400, gender: 'female', relationshipStatus: 'married', partnerId: 1 });
      state.entities = [speaker, spouse];
      setSimSeed(HUMAN_SCENARIO_SEED);
      tickHumans(state, scenarioContext(state, [speaker, spouse]));
      return speaker.vx;
    }

    it('routes toward company without blending stale velocity', () => {
      const fixture = scenarioWorld();
      fixture.worldMap = null;
      setSimSeed(HUMAN_SCENARIO_SEED);
      const routes = companyFollowTicks().map((tick) => ({
        fresh: runCompanyFollow(fixture, tick, 0),
        stale: runCompanyFollow(fixture, tick, -20),
      }));
      const towardCompany = routes.filter(({ fresh }) => fresh > 0);
      expect(towardCompany.length).toBeGreaterThan(0);
      expect(towardCompany.some(({ fresh, stale }) => Math.abs(fresh - stale) < 1e-9)).toBe(true);
    });
  });
});

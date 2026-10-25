/** Residents and visitors share beds reserved before departure. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  BuildingType,
  EntityType,
  HOTEL_GUEST_CAPACITY,
  JobType,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getHourOfDay } from '../src/game/dayCycleClock';
import {
  checkInVisitor,
  countHotelSettlerLodgers,
  getHotelRoster,
  hotelHasVacancy,
  isSettlerLodgingAtHotel,
  tickHotelLodging,
  lodgingHotelFor,
  needsHotelBed,
} from '../src/game/hotelStay';
import { isPlayerHuman } from '../src/game/playerHuman';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { initGame } from '../src/game/worldGen';
import { tickHumans } from '../src/game/humanTick';

const TEST_SEED = 20_261_010;
/** 23:00 — deep night, so `stayIn` is unconditional and the old hourly home snap would fire. */
const LATE_NIGHT_OFFSET = 23 * TICKS_PER_HOUR;
/**
 * A walkable land point on this seed, with land to its west and east. The cases below used
 * `width * 0.78`, which on this map is open sea several tiles from any shore — they passed only
 * while a settler could walk over water.
 */
const WALKER_X = 1280;
const WALKER_Y = 672;

let settlerPrototype: Entity | undefined;

function baseSettler(): Entity {
  if (!settlerPrototype) {
    const probe = initGame({ seed: 4242 });
    const found = probe.entities.find((e) => isPlayerHuman(e) && !e.isJuvenile && e.alive);
    if (!found) throw new Error('worldGen produced no settler to use as a test prototype');
    settlerPrototype = found;
  }
  return structuredClone(settlerPrototype);
}

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  return Object.assign(baseSettler(), {
    id,
    alive: true,
    isJuvenile: false,
    age: 30,
    energy: 90,
    maxEnergy: 100,
    vx: 0,
    vy: 0,
    flash: 0,
    faction: undefined,
    occupation: 'settler',
    job: JobType.Settler,
    homeBuildingId: undefined,
    residenceBuildingId: undefined,
    prisonBuildingId: undefined,
    relationshipStatus: 'single',
    partnerId: undefined,
    affairPartnerId: undefined,
    affairProgress: 0,
    chatTicks: undefined,
    chatPhrase: undefined,
    chatPartnerId: undefined,
    chatDialogueSessionKey: undefined,
  }, overrides);
}

function house(id: number, x: number, y: number): Building {
  return {
    id,
    type: BuildingType.House,
    completed: true,
    faction: undefined,
    occupants: [],
    x,
    y,
    width: 40,
    height: 40,
    level: 1,
  } as unknown as Building;
}

function hotel(id: number, centreX: number, centreY: number, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type: BuildingType.Hotel,
    completed: true,
    faction: undefined,
    occupants: [],
    x: centreX - 30,
    y: centreY - 26,
    width: 60,
    height: 52,
    level: 1,
    ...overrides,
  } as unknown as Building;
}

function hotelCentre(building: Building): { x: number; y: number } {
  return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
}

function distanceTo(entity: Entity, x: number, y: number): number {
  return Math.hypot(entity.x - x, entity.y - y);
}

function newWorld(): WorldState {
  const state = initGame({ seed: TEST_SEED });
  state.entities = [];
  state.buildings = [];
  state.visitorGroups = [];
  state.pendingRaidEvents = [];
  state.pendingOutgoingRaidEvents = [];
  state.pendingDiplomacyEvents = [];
  state.pendingStoryEvents = [];
  state.electionCeremony = null;
  state.pendingElectionYear = null;
  state.resources.food = 100;
  state.resources.gold = 100;
  state.weather = WeatherType.Clear;
  state.tick = TICKS_PER_DAY + LATE_NIGHT_OFFSET;
  // Test the lodging destination without unrelated terrain/path recovery changing its velocity.
  state.worldMap = null;
  return state;
}

function contextFor(state: WorldState, humans: Entity[]): TickContext {
  return {
    width: state.width,
    height: state.height,
    hourOfDay: getHourOfDay(state.tick),
    season: Season.Spring,
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
  };
}

afterEach(() => {
  resetSimRng();
});

describe('settler lodging overnight', () => {
  it('sleeps at a completed hotel with a free bed when the walk home is too long for the night', () => {
    const state = newWorld();
    const walkerX = WALKER_X;
    const walkerY = WALKER_Y;
    const home = house(1, Math.round(state.width * 0.06), walkerY);
    // ~45 px from the walker's centre, inside the walk's direct (non-pathing) branch.
    const inn = hotel(2, walkerX + 45, walkerY);
    const walker = settler(1, { x: walkerX, y: walkerY, residenceBuildingId: home.id });
    state.buildings = [home, inn];
    state.entities = [walker];

    expect(getHourOfDay(state.tick)).toBe(23);
    expect(needsHotelBed(walker, state.buildings, 23), 'walk home exceeds the night').toBe(true);
    expect(lodgingHotelFor(walker, state.buildings, state.entities, state.tick)).toBe(inn);

    const before = distanceTo(walker, hotelCentre(inn).x, hotelCentre(inn).y);
    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, [walker]));

    expect(walker.vx, 'walks toward the hotel, not home').toBeGreaterThan(0);
    expect(distanceTo(walker, hotelCentre(inn).x, hotelCentre(inn).y)).toBeLessThan(before);

    // Control on the same tick and the same settler: with no hotel the walk is homeward, to the left.
    const noInn = newWorld();
    const control = settler(1, { x: walkerX, y: walkerY, residenceBuildingId: home.id });
    noInn.buildings = [home];
    noInn.entities = [control];
    setSimSeed(TEST_SEED);
    tickHumans(noInn, contextFor(noInn, [control]));
    expect(control.vx, 'without a hotel the settler still walks home').toBeLessThan(0);
    expect(distanceTo(control, home.x + home.width / 2, home.y + home.height / 2))
      .toBeGreaterThan(200);
  });

  it('reserves the last bed before walking and prevents a second departure', () => {
    const state = newWorld();
    const home = house(1, 100, WALKER_Y);
    const inn = hotel(2, WALKER_X + 100, WALKER_Y);
    const guests = Array.from({ length: HOTEL_GUEST_CAPACITY - 1 }, (_, i) =>
      settler(20 + i, { faction: 'visitor' }));
    inn.hotelGuestIds = guests.map((e) => e.id);
    const first = settler(1, { x: WALKER_X, y: WALKER_Y, residenceBuildingId: home.id });
    const second = settler(2, { x: WALKER_X, y: WALKER_Y, residenceBuildingId: home.id });
    state.buildings = [home, inn];
    state.entities = [first, second, ...guests];

    expect(lodgingHotelFor(first, state.buildings, state.entities, state.tick)).toBe(inn);
    expect(lodgingHotelFor(second, state.buildings, state.entities, state.tick)).toBeUndefined();
  });

  it('caps a group of own residents while all are still walking and preserves their beds', () => {
    const state = newWorld();
    const home = house(1, 100, WALKER_Y);
    const inn = hotel(2, WALKER_X + 100, WALKER_Y, { occupants: [99] });
    const residents = Array.from({ length: HOTEL_GUEST_CAPACITY + 2 }, (_, i) =>
      settler(i + 1, { x: WALKER_X, y: WALKER_Y, residenceBuildingId: home.id }));
    state.buildings = [home, inn];
    state.entities = residents;
    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, residents));

    expect(residents.filter((e) => e.hotelStayBuildingId === inn.id)).toHaveLength(HOTEL_GUEST_CAPACITY);
    expect(countHotelSettlerLodgers(inn, residents)).toBe(HOTEL_GUEST_CAPACITY);
    expect(getHotelRoster(inn, state.buildings, residents, 23).lodgers).toHaveLength(HOTEL_GUEST_CAPACITY);
    expect(isSettlerLodgingAtHotel(residents[0], state.buildings, 23)).toBe(false);
    tickHotelLodging(state);
    expect(countHotelSettlerLodgers(inn, residents)).toBe(HOTEL_GUEST_CAPACITY);
    expect(lodgingHotelFor(residents[0], state.buildings, residents, state.tick)).toBe(inn);
    const visitor = settler(100, { faction: 'visitor' });
    state.entities.push(visitor);
    expect(checkInVisitor(state, visitor, inn)).toBe(false);

    residents[0].alive = false;
    tickHotelLodging(state);
    expect(residents[0].hotelStayBuildingId).toBeUndefined();
    expect(lodgingHotelFor(residents[8], state.buildings, residents, state.tick)).toBe(inn);
    state.tick = residents[8].hotelStayUntilTick!;
    tickHotelLodging(state);
    expect(countHotelSettlerLodgers(inn, residents)).toBe(0);
  });

  it('uses another hotel when the closest is reserved and releases a demolished destination', () => {
    const state = newWorld();
    const home = house(1, 100, WALKER_Y);
    const inn = hotel(2, WALKER_X + 100, WALKER_Y);
    const other = hotel(3, WALKER_X + 120, WALKER_Y);
    const residents = Array.from({ length: HOTEL_GUEST_CAPACITY + 1 }, (_, i) =>
      settler(i + 1, { x: WALKER_X, y: WALKER_Y, residenceBuildingId: home.id }));
    state.buildings = [home, inn, other];
    state.entities = residents;
    for (const resident of residents.slice(0, HOTEL_GUEST_CAPACITY)) {
      expect(lodgingHotelFor(resident, state.buildings, residents, state.tick)).toBe(inn);
    }
    expect(lodgingHotelFor(residents[8], state.buildings, residents, state.tick)).toBe(other);
    state.buildings = [home, inn];
    tickHotelLodging(state);
    expect(residents[8].hotelStayBuildingId).toBeUndefined();
  });

  it('goes home as before when the walk home fits in the night', () => {
    const state = newWorld();
    const walkerX = WALKER_X;
    const walkerY = WALKER_Y;
    // Centre 40 px away: about an hour's walk, below LODGING_MIN_COMMUTE_HOURS.
    const home = house(1, walkerX - 60, walkerY);
    const inn = hotel(2, walkerX + 45, walkerY);
    const walker = settler(1, { x: walkerX, y: walkerY, residenceBuildingId: home.id });
    state.buildings = [home, inn];
    state.entities = [walker];

    expect(needsHotelBed(walker, state.buildings, 23)).toBe(false);
    expect(lodgingHotelFor(walker, state.buildings, state.entities, state.tick)).toBeUndefined();

    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, [walker]));

    expect(walker.vx, 'walks home, which is to the left').toBeLessThan(0);
  });

  it('falls back to walking home when no hotel exists or every bed is taken', () => {
    const state = newWorld();
    const walkerY = Math.round(state.height * 0.5);
    const home = house(1, Math.round(state.width * 0.06), walkerY);
    const walker = settler(1, { x: Math.round(state.width * 0.78), y: walkerY, residenceBuildingId: home.id });
    const innCentreX = walker.x + 10;
    const inn = hotel(2, innCentreX, walkerY);
    // Lodgers stand at the hotel and, like the walker, cannot reach their own home tonight.
    const lodger = (id: number): Entity => settler(id, { x: innCentreX, y: walkerY, residenceBuildingId: home.id, hotelStayBuildingId: inn.id, hotelStayUntilTick: state.tick + TICKS_PER_HOUR });
    const seven = [2, 3, 4, 5, 6, 7, 8].map(lodger);
    const eight = [...seven, lodger(9)];

    expect(needsHotelBed(walker, [home], 23), 'the control settler does need a bed').toBe(true);
    expect(lodgingHotelFor(walker, [home], [walker], state.tick), 'no hotel at all').toBeUndefined();
    expect(lodgingHotelFor(walker, [home, inn], [walker, ...seven], state.tick), 'one bed still free').toBe(inn);
    walker.hotelStayBuildingId = undefined;
    walker.hotelStayUntilTick = undefined;
    expect(lodgingHotelFor(walker, [home, inn], [walker, ...eight], state.tick), 'all eight beds taken').toBeUndefined();

    // Visitors and settlers share the one pool of HOTEL_GUEST_CAPACITY beds.
    const visitors = [settler(31, { faction: 'visitor' }), settler(32, { faction: 'visitor' })];
    const halfFullInn = hotel(3, innCentreX, walkerY, { hotelGuestIds: [31, 32] });
    expect(HOTEL_GUEST_CAPACITY).toBe(8);
    expect(hotelHasVacancy(halfFullInn, visitors, undefined, 6), '2 visitors + 6 settlers fill it').toBe(false);
    expect(hotelHasVacancy(halfFullInn, visitors, undefined, 5)).toBe(true);
  });
});

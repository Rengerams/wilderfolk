/**
 * S-06 residual: faction travel is throttled decisions, not throttled movement. A rival marching to
 * the village or wandering back to its camp must cover the same ground off camera as on camera.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  MapSize,
} from '../src/game/gameTypes';
import type { Building, Entity, RaidEvent, RivalSettlement, WorldState } from '../src/game/gameTypes';
import type { SimulationFocus } from '../src/game/simFocus';
import { gameTick } from '../src/game/gameTick';
import { clearAllFactionWanderStates } from '../src/game/factionWander';
import { TICKS_PER_DAY, getCalendarDay } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { invalidateCachedEntityByType } from '../src/game/entityTypeCache';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { initGame } from '../src/game/worldGen';

const FIXTURE_SEED = 20_261_113;
const RIVAL_ID = 7;
const VISITOR_ID = 2;
const HOUSE_ID = 9100;
const HOTEL_ID = 9101;
/** The first processed tick opens the throttle for the rival, so the window starts on its decision. */
const WALK_TICK = 24 * 100 - RIVAL_ID - 1;
/** Same alignment for the visitor's own throttle slot. */
const VISITOR_WALK_TICK = 24 * 100 - VISITOR_ID - 1;
const OFF_SCREEN: SimulationFocus = { minX: -900, maxX: -400, minY: -900, maxY: -400 };
const ON_SCREEN: SimulationFocus = { minX: 0, maxX: 2000, minY: 0, maxY: 2000 };

function building(id: number, type: BuildingType, x: number, y: number): Building {
  return {
    id, type, x, y, width: 44, height: 36,
    occupants: [], level: 1, constructionProgress: 1, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  } as Building;
}

/** A real settler cloned from the generated colony, so every unrelated field is a real value. */
function settler(state: WorldState, id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  const template = state.entities.find((entity) => entity.type === EntityType.Human && isPlayerHuman(entity));
  if (!template) throw new Error('initGame produced no settler template');
  return {
    ...structuredClone(template),
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    alive: true,
    isJuvenile: false,
    age: 30,
    job: JobType.Settler,
    workerBuildingId: undefined,
    residenceBuildingId: undefined,
    prisonBuildingId: undefined,
    partnerId: undefined,
    affairPartnerId: undefined,
    childrenIds: [],
    faction: undefined,
    groupId: undefined,
    indoorBuildingId: undefined,
    hotelStayBuildingId: undefined,
    hotelStayUntilTick: undefined,
    ...overrides,
  };
}

function flatWorld(entities: Entity[], buildings: Building[], tick = WALK_TICK): WorldState {
  const state = initGame({
    size: MapSize.Medium, width: 2000, height: 2000, seed: FIXTURE_SEED, skipTerrain: true,
  });
  state.worldMap = testWorldMap({ tilesX: 200, tilesY: 200, seed: FIXTURE_SEED });
  state.tick = tick;
  state.dayInYear = getCalendarDay(tick);
  state.entities = entities;
  state.buildings = buildings;
  state.visitorGroups = [];
  state.rivalSettlements = [];
  state.pendingRaidEvents = [];
  state.pendingOutgoingRaidEvents = [];
  state.pendingDiplomacyEvents = [];
  state.pendingStoryEvents = [];
  state.electionCeremony = null;
  state.pendingElectionYear = null;
  state.festival = null;
  state.spotlightLore = null;
  state.villageLeaderId = null;
  state.resources.food = 50;
  rebuildEntityByIdMap(state);
  invalidateCachedEntityByType(state);
  return state;
}

function rivalSettlement(campX: number, campY: number): RivalSettlement {
  return {
    id: 'R1', name: 'Ridge', campX, campY, population: 1, entityIds: [RIVAL_ID],
    relationship: 'tense', foundedYear: 0, daysUntilAction: 99, raidCooldownDays: 99, peaceTreatyDays: 0,
  };
}

function marchEvent(): RaidEvent {
  return {
    id: 'raid_R1', rivalId: 'R1', rivalName: 'Ridge', title: 'War-band',
    description: 'A war-band is marching.', emoji: '⚔️', choices: [],
    createdAtTick: 0, expiresAtTick: WALK_TICK + 10 * TICKS_PER_DAY,
    marchDistanceTiles: 20, attackerStrength: 60,
    lootFood: 0, lootGold: 0, lootWood: 0, lootStone: 0,
  };
}

/** A rival camp fixture; `withRaid` is the marching war-band the faction branch follows. */
function rivalWorld(x: number, withRaid: boolean): { state: WorldState; actor: Entity } {
  const templateState = initGame({ size: MapSize.Medium, width: 2000, height: 2000, seed: FIXTURE_SEED, skipTerrain: true });
  const rival = settler(templateState, RIVAL_ID, x, 500, { faction: 'rival', groupId: 'R1' });
  const state = flatWorld([rival], [building(HOUSE_ID, BuildingType.House, 500, 500)]);
  state.rivalSettlements = [rivalSettlement(500, 500)];
  if (withRaid) state.pendingRaidEvents = [marchEvent()];
  return { state, actor: rival };
}

/** Runs real ticks from one camera focus; every run starts from an identical fixture and RNG. */
function run(focus: SimulationFocus, ticks: number, build: () => { state: WorldState; actor: Entity }): {
  dx: number; dy: number; actor: Entity; state: WorldState;
} {
  clearAllFactionWanderStates();
  resetSimRng();
  setSimSeed(FIXTURE_SEED);
  const { state, actor } = build();
  const start = { x: actor.x, y: actor.y };
  for (let i = 0; i < ticks; i++) gameTick(state, focus);
  return { dx: actor.x - start.x, dy: actor.y - start.y, actor, state };
}

beforeEach(() => {
  clearAllFactionWanderStates();
});

afterEach(() => {
  resetSimRng();
  clearAllFactionWanderStates();
});

/** A checked-in visitor walking from the camp to the hotel door. */
function hotelWorld(): { state: WorldState; actor: Entity } {
  const templateState = initGame({
    size: MapSize.Medium, width: 2000, height: 2000, seed: FIXTURE_SEED, skipTerrain: true,
  });
  const visitor = settler(templateState, VISITOR_ID, 1600, 530, {
    faction: 'visitor',
    groupId: 'V1',
    hotelStayBuildingId: HOTEL_ID,
    hotelStayUntilTick: VISITOR_WALK_TICK + 10 * TICKS_PER_DAY,
  });
  const hotel = building(HOTEL_ID, BuildingType.Hotel, 1300, 500);
  // A checked-in guest: the hotel's pointer repair drops a stay that is not on its guest list.
  hotel.hotelGuestIds = [VISITOR_ID];
  const state = flatWorld(
    [visitor],
    [building(HOUSE_ID, BuildingType.House, 500, 500), hotel],
    VISITOR_WALK_TICK,
  );
  state.visitorGroups = [{
    id: 'V1', name: 'Wanderers', kind: 'traders', campX: 1650, campY: 500, daysLeft: 5,
    entityIds: [VISITOR_ID], giftsGiven: 0, tradesCompleted: 0,
    refugeeResolved: false, leaderTalked: false,
  }];
  return { state, actor: visitor };
}

describe('off-screen faction travel (S-06 residual)', () => {
  it('covers the same ground on a rival march with and without camera focus', () => {
    const onScreen = run(ON_SCREEN, 24, () => rivalWorld(1700, true));
    const offScreen = run(OFF_SCREEN, 24, () => rivalWorld(1700, true));

    const marched = Math.hypot(onScreen.dx, onScreen.dy);
    expect(marched, 'the fixture really marches toward the village').toBeGreaterThan(100);
    expect(Math.hypot(offScreen.dx - onScreen.dx, offScreen.dy - onScreen.dy))
      .toBeLessThan(1);
  });

  it('walks a camp-bound rival home off camera', () => {
    const { actor } = run(OFF_SCREEN, 240, () => rivalWorld(800, false));
    expect(Math.hypot(actor.x - 500, actor.y - 500), 'the rival reached its camp').toBeLessThan(70);
  });

  it('carries a hotel-bound visitor at full pace for one throttle window', () => {
    const onScreen = run(ON_SCREEN, 24, hotelWorld);
    const offScreen = run(OFF_SCREEN, 24, hotelWorld);

    const walked = Math.hypot(onScreen.dx, onScreen.dy);
    expect(walked, 'the hotel walk covers a real throttle window').toBeGreaterThan(60);
    expect(Math.hypot(offScreen.dx - onScreen.dx, offScreen.dy - onScreen.dy))
      .toBeLessThan(1);
  });

  it('walks a hotel-bound visitor through the door off camera', () => {
    const { actor } = run(OFF_SCREEN, 240, hotelWorld);
    // The door is 300 px away: half a day of off-screen travel must not pass it unseen.
    expect(actor.indoorBuildingId, 'the guest checked in off camera').toBe(HOTEL_ID);
  });
});


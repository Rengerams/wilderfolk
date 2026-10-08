/**
 * The off-screen human throttle, both directions: a settler outside the camera focus acts only on
 * the tick the throttle opens, and the same settler in focus acts every tick.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import type { SimulationFocus } from '../src/game/simFocus';
import { OFFSCREEN_HUMAN_THROTTLE } from '../src/game/simFocus';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { tickHumans } from '../src/game/humanTick';
import { isPlayerHuman } from '../src/game/playerHuman';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { initGame } from '../src/game/worldGen';

const TEST_SEED = 20_261_006;
/** 23:00 on day 1: `prefersHomeTonightFor` is unconditional, so the settler walks home when active. */
const NIGHT_TICK = TICKS_PER_DAY + 23 * TICKS_PER_HOUR;
const NO_THROTTLE_ID = 7;
const THROTTLE_ID = 3;
const HOME_ID = 900;

const OFF_SCREEN: SimulationFocus = { minX: -2000, maxX: -1000, minY: -2000, maxY: -1000 };
const ON_SCREEN: SimulationFocus = { minX: 0, maxX: 300, minY: 0, maxY: 300 };

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
    energy: 400,
    maxEnergy: 400,
    vx: 0,
    vy: 0,
    flash: 0,
    faction: undefined,
    occupation: 'settler',
    job: JobType.Settler,
    homeBuildingId: undefined,
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
  const state = initGame({ seed: TEST_SEED });
  state.entities = [settler(id, { x: 100, y: 100 })];
  state.buildings = [house()];
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

afterEach(() => {
  resetSimRng();
});

describe('the off-screen human throttle', () => {
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

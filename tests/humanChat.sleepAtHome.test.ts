/**
 * Sleepers keep their mouth shut (2026-09-16).
 *
 * Reported from play: settlers kept talking, with a speech bubble over them, while they
 * were sleeping at home. There is no `sleeping` flag in the simulation — "asleep" is
 * *at home during the night*, composed from the two rules that already own it:
 * `isNightHour` (the schedule owner's night window, 20:00–06:00) and `isNearResidence`
 * (the residency owner's 55 px proximity rule). The night routine is what puts them
 * there: `socialLife` sets `stayHome` for rest motives and `humanLeisureBehavior`
 * commutes them to their house.
 *
 * Two behaviours hang off that predicate: the ambient-chatter gate in `humanTick` and
 * the sleeper cull in `renderer/humans.ts` (they are indoors, so they are not drawn).
 * The scripted dialogue sessions are deliberately exempt — they are owned by the
 * dialogue tree, and ending one here would cut a story beat mid-line.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import {
  PER_TICK_RATE_SCALE,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  getHourOfDay,
} from '../src/game/dayCycleClock';
import { isAsleepAtHome } from '../src/game/humanSchedule';
import { endAmbientHumanChat } from '../src/game/humanChat';
import { resetSimRng, seededRandomForRun, setSimSeed } from '../src/game/simRng';
import { isPlayerHuman } from '../src/game/playerHuman';
import { initGame } from '../src/game/worldGen';
import { SOCIAL_STAGGER } from '../src/game/adaptiveSpatialQuery';
import { tickHumans } from '../src/game/humanTick';

const TEST_SEED = 20_260_916;
const AMBIENT_CHANCE = 0.036 * PER_TICK_RATE_SCALE;

/** A fully-formed settler prototype, so the fixtures do not hand-build a partial Entity. */
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

function house(id: number, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type: BuildingType.House,
    completed: true,
    faction: undefined,
    occupants: [],
    x: 100,
    y: 100,
    width: 40,
    height: 40,
    level: 1,
    ...overrides,
  } as unknown as Building;
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
  state.tick = TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
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

/** First aligned night tick whose ambient roll passes for this settler. */
function nightAmbientTick(id: number): number {
  setSimSeed(TEST_SEED); // the roll is a pure function of (seed, salt)
  for (let day = 1; day < 5000; day++) {
    for (let slot = 0; slot < TICKS_PER_DAY; slot++) {
      const tick = day * TICKS_PER_DAY + slot;
      if ((tick + id) % SOCIAL_STAGGER !== 0) continue;
      const hour = getHourOfDay(tick);
      if (!(hour >= 20 || hour < 6)) continue;
      if (seededRandomForRun(`chat-ambient:${id}:${tick}`) > AMBIENT_CHANCE) continue;
      return tick;
    }
  }
  throw new Error('no night ambient dialogue tick found');
}

afterEach(() => {
  resetSimRng();
});

describe('isAsleepAtHome', () => {
  const home = house(1);
  const atHome = settler(1, { x: home.x + home.width / 2, y: home.y + home.height / 2, residenceBuildingId: home.id });

  it('is true only for a resident who is near their house during the night', () => {
    expect(isAsleepAtHome(atHome, [home], 22)).toBe(true);
    expect(isAsleepAtHome(atHome, [home], 20)).toBe(true); // NIGHT_START
    expect(isAsleepAtHome(atHome, [home], 5)).toBe(true);
    expect(isAsleepAtHome(atHome, [home], 6)).toBe(false); // NIGHT_END
    expect(isAsleepAtHome(atHome, [home], 12)).toBe(false); // daytime at home is not sleep
  });

  it('is false away from home, without a residence, or in an unusable house', () => {
    expect(isAsleepAtHome(settler(2, { x: 900, y: 700, residenceBuildingId: home.id }), [home], 22)).toBe(false);
    expect(isAsleepAtHome(settler(3, { ...atHome, residenceBuildingId: undefined }), [home], 22)).toBe(false);
    // Night-shift worker / visitor: no residence at all, so they stay awake and visible.
    expect(isAsleepAtHome(settler(4, { x: home.x, y: home.y }), [home], 22)).toBe(false);
    const unfinished = house(9, { completed: false });
    expect(isAsleepAtHome(settler(5, { x: 120, y: 120, residenceBuildingId: unfinished.id }), [unfinished], 22)).toBe(false);
  });
});

describe('endAmbientHumanChat', () => {
  it('ends an ordinary chat, including a pair link', () => {
    const talker = settler(1, { chatPhrase: 'Lovely evening.', chatTicks: 8, chatPartnerId: 2 });
    expect(endAmbientHumanChat(talker)).toBe(true);
    expect(talker.chatPhrase).toBeUndefined();
    expect(talker.chatTicks).toBeUndefined();
    expect(talker.chatPartnerId).toBeUndefined();
  });

  it('never cuts a scripted dialogue session, and no-ops on a silent settler', () => {
    const inDialogue = settler(1, { chatPhrase: 'Line one.', chatTicks: 8, chatDialogueSessionKey: '1:2' });
    expect(endAmbientHumanChat(inDialogue)).toBe(false);
    expect(inDialogue.chatPhrase).toBe('Line one.');
    expect(inDialogue.chatTicks).toBe(8);
    expect(endAmbientHumanChat(settler(2))).toBe(false);
  });
});

describe('ambient chatter at home after dark', () => {
  it('keeps a sleeping settler silent on a tick the same settler would speak away from home', () => {
    const tick = nightAmbientTick(1);
    setSimSeed(TEST_SEED);
    expect(seededRandomForRun(`chat-ambient:1:${tick}`)).toBeLessThanOrEqual(AMBIENT_CHANCE);

    // Control: away from home at night, the ambient roll lands and the settler speaks.
    const openWorld = newWorld();
    openWorld.tick = tick;
    openWorld.buildings = [house(1)];
    const awaySpeaker = settler(1, { x: 700, y: 600, residenceBuildingId: 1 });
    const awayPeer = settler(2, { x: 710, y: 600 });
    openWorld.entities = [awaySpeaker, awayPeer];
    setSimSeed(TEST_SEED);
    tickHumans(openWorld, contextFor(openWorld, [awaySpeaker, awayPeer]));
    expect(awaySpeaker.chatPhrase, 'control settler should have started a chat').toBeDefined();

    // The same settler at home on the same tick: asleep, so silent.
    const homeWorld = newWorld();
    homeWorld.tick = tick;
    homeWorld.buildings = [house(1)];
    const sleeping = settler(1, { x: 120, y: 120, residenceBuildingId: 1 });
    const homePeer = settler(2, { x: 130, y: 120 });
    homeWorld.entities = [sleeping, homePeer];
    setSimSeed(TEST_SEED);
    tickHumans(homeWorld, contextFor(homeWorld, [sleeping, homePeer]));
    expect(sleeping.chatPhrase).toBeUndefined();
    expect(sleeping.chatTicks).toBeUndefined();
  });

  it('stops a chat that is already running when the settler is home for the night', () => {
    const tick = nightAmbientTick(1);
    const state = newWorld();
    state.tick = tick;
    state.buildings = [house(1)];
    const talker = settler(1, {
      x: 120,
      y: 120,
      residenceBuildingId: 1,
      chatPhrase: 'Still talking.',
      chatTicks: 6,
    });
    state.entities = [talker];

    tickHumans(state, contextFor(state, [talker]));

    expect(talker.chatPhrase).toBeUndefined();
    expect(talker.chatTicks).toBeUndefined();
  });
});

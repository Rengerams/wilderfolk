/**
 * Incoming raids are rolled every day, not only on a rival's major-action day.
 *
 * `maybeQueueRaid` carries the raid's whole cadence — its own cooldown, the relationship-scaled
 * chance roll, the population and structure gates — and `groupEvents`/`storyEvents` both use
 * `raidCooldownDays` as the only raid switch. Sitting under the action-timer gate meant the roll
 * was asked once per 45–90 days, so a colony could go a whole game without being raided.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import type { Entity, RivalSettlement, WorldState } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { tickRivalSettlements, type RivalEventCallbacks } from '../src/game/rivalEvents';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { building, human } from '../src/test/factories';
import { hitTestCamp } from '../src/game/groupEvents';
import { maybeFoundRivalSettlement, spawnRivalSettlement } from '../src/game/rivalSettlements';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

/** First tick of a calendar day, i.e. one `isNewCalendarDayTick` sees. */
const FIRST_DAY_TICK = TICKS_PER_DAY;

/** A tense camp with a live population — `rival.population` is recounted from `entityIds` daily. */
function rivalCamp(): RivalSettlement {
  const ids = Array.from({ length: 12 }, (_, i) => 500 + i);
  return {
    id: 'rival-stonefall',
    name: 'Stonefall',
    campX: 480,
    campY: 300,
    population: ids.length,
    entityIds: ids,
    buildingIds: [],
    relationship: 'tense',
    foundedYear: 0,
    // Far enough out that no major-action day falls inside any test window.
    daysUntilAction: 100000,
    raidCooldownDays: 0,
    peaceTreatyDays: 0,
  };
}

function makeState(): { state: WorldState; allAlive: Entity[] } {
  const camp = rivalCamp();
  const settlers = Array.from({ length: 8 }, (_, i) => human(i + 1));
  const rivals = camp.entityIds.map((id) => human(id, { faction: 'rival', groupId: camp.id }));
  const allAlive = [...settlers, ...rivals];
  const state = {
    entities: allAlive,
    buildings: [building(1, BuildingType.House)],
    tick: FIRST_DAY_TICK,
    paused: false,
    speed: 1,
    width: 640,
    height: 480,
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring,
    weather: WeatherType.Clear,
    year: 5,
    dayInYear: 30,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 900,
    eventLog: [],
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 1,
    humanPopulation: settlers.length,
    maxHumanPopulation: 20,
    workingSettlers: 0,
    idleSettlers: settlers.length,
    villageName: 'Testvale',
    villageReputation: 50,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
    foodSpoilageRate: 0,
    biodiversityIndex: 100,
    pollutionLevel: 0,
    disasters: [],
    tradeRoutes: [],
    eventsThisYear: [],
    worldMap: null,
    yearlyStats: [],
    lifetimeStats: {},
    visitorGroups: [],
    rivalSettlements: [camp],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: true,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: -1,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    researchNodes: [],
    unlockedTechs: [],
    activeResearch: null,
    researchProgress: 0,
    festival: null,
  } as unknown as WorldState;
  return { state, allAlive };
}

/** Boundary collaborators the daily layer supplies; only the raid roll is under test here. */
const callbacks: RivalEventCallbacks = {
  pushNews: () => {},
  pushFloat: () => {},
  logEvent: () => {},
  tickPendingDiplomacyEvents: () => {},
  queueDiplomacyEvent: () => {},
  killWildGameForPoach: () => {},
};

afterEach(() => {
  resetSimRng();
});

describe('incoming raid cadence', () => {
  it('founds a strategic rival without adding a village camp or settlers', () => {
    setSimSeed(12345);
    const { state, allAlive } = makeState();
    const buildingsBefore = [...state.buildings];
    const entitiesBefore = [...allAlive];
    const nextBuildingId = state.nextBuildingId;
    const nextEntityId = state.nextEntityId;
    spawnRivalSettlement(state, state.buildings);
    const rival = state.rivalSettlements.at(-1)!;
    expect(rival.population).toBeGreaterThan(0);
    expect(rival.entityIds).toEqual([]);
    expect(rival.buildingIds).toEqual([]);
    expect(state.buildings).toEqual(buildingsBefore);
    expect(allAlive).toEqual(entitiesBefore);
    expect(state.nextBuildingId).toBe(nextBuildingId);
    expect(state.nextEntityId).toBe(nextEntityId);
    expect(hitTestCamp(state, rival.campX, rival.campY)).toBeNull();
  });

  it('retires legacy camp objects without destroying strategic population or raid records', () => {
    const { state, allAlive } = makeState();
    const rival = state.rivalSettlements[0];
    const legacyHouse = building(99, BuildingType.House, { faction: 'rival', groupId: rival.id });
    state.buildings.push(legacyHouse);
    rival.buildingIds = [legacyHouse.id];
    rival.peaceTreatyDays = 60;
    const population = rival.population;
    const rivalIds = new Set(rival.entityIds);
    const nextBuildingId = state.nextBuildingId;
    const settler = allAlive.find((entity) => entity.faction !== 'rival')!;
    settler.residenceBuildingId = legacyHouse.id;
    const raids = state.pendingRaidEvents;
    tickRivalSettlements(state, allAlive, callbacks);
    expect(state.buildings.map((entry) => entry.id)).toEqual([1]);
    expect(settler.alive).toBe(true);
    expect(settler.residenceBuildingId).toBeUndefined();
    expect(allAlive.filter((entity) => rivalIds.has(entity.id)).every((entity) => !entity.alive)).toBe(true);
    expect(rival.population).toBe(population);
    expect(rival.buildingIds).toEqual([]);
    expect(rival.entityIds).toEqual([]);
    expect(rival.peaceTreatyDays).toBe(59);
    expect(state.pendingRaidEvents).toBe(raids);
    expect(state.nextBuildingId).toBe(nextBuildingId);
  });

  it('sweeps camp buildings no rival record still lists', () => {
    const { state, allAlive } = makeState();
    const rival = state.rivalSettlements[0];
    const orphan = building(98, BuildingType.Farm, { faction: 'rival', groupId: rival.id });
    state.buildings.push(orphan);
    rival.buildingIds = [];
    const settler = allAlive.find((entity) => entity.faction !== 'rival')!;
    settler.workerBuildingId = orphan.id;
    settler.residenceBuildingId = orphan.id;
    settler.job = JobType.Farmer;
    settler.occupation = JobType.Farmer;

    tickRivalSettlements(state, allAlive, callbacks);

    expect(state.buildings.map((entry) => entry.id)).toEqual([1]);
    expect(settler.workerBuildingId).toBeUndefined();
    expect(settler.residenceBuildingId).toBeUndefined();
    expect(settler.job).toBe(JobType.Settler);
    expect(settler.occupation).toBe(JobType.Settler);
  });

  it('never expands strategic settlements onto the village map', () => {
    setSimSeed(12345);
    const { state } = makeState();
    state.entities = state.entities.filter((entity) => entity.faction !== 'rival');
    state.rivalSettlements[0].entityIds = [];
    state.rivalSettlements[0].relationship = 'friendly';
    const buildingsBefore = [...state.buildings];
    for (let day = 0; day < 100; day++) {
      state.tick += TICKS_PER_DAY;
      tickRivalSettlements(state, state.entities, callbacks);
    }
    expect(state.buildings).toEqual(buildingsBefore);
    expect(state.rivalSettlements[0].buildingIds).toEqual([]);
  });

  it('decrements peace treaty days at the 18:00 world-events pulse', () => {
    const { state, allAlive } = makeState();
    const camp = state.rivalSettlements[0];
    camp.peaceTreatyDays = 60;
    state.tick = TICKS_PER_DAY + 18 * TICKS_PER_HOUR;
    tickRivalSettlements(state, allAlive, callbacks);
    expect(camp.peaceTreatyDays).toBe(59);
    state.tick += TICKS_PER_DAY;
    tickRivalSettlements(state, allAlive, callbacks);
    expect(camp.peaceTreatyDays).toBe(58);
  });

  it('asks the raid question on days the rival takes no major action', () => {
    setSimSeed(7);
    const { state, allAlive } = makeState();

    for (let day = 0; day < 30 && state.pendingRaidEvents.length === 0; day++) {
      state.tick = FIRST_DAY_TICK + day * TICKS_PER_DAY;
      tickRivalSettlements(state, allAlive, callbacks);
    }

    // The action timer never fired, so nothing below could have queued this raid.
    expect(state.rivalSettlements[0].daysUntilAction).toBeGreaterThan(0);
    expect(state.pendingRaidEvents).toHaveLength(1);
    expect(state.pendingRaidEvents[0].rivalId).toBe('rival-stonefall');
    expect(state.eventLog.filter((e) => e.combatStage === 'dispatched')).toHaveLength(1);
    expect(state.rivalSettlements[0].raidCooldownDays).toBe(21);
  });
});


describe('world-map settlement founding and saved games', () => {
  it('founds neighbors through the daily rival pulse, up to six without village objects', () => {
    setSimSeed(12345);
    const { state, allAlive } = makeState();
    state.rivalSettlements = [];
    state.entities = allAlive.filter((person) => person.faction !== 'rival');
    const buildings = [...state.buildings];
    const people = [...state.entities];
    for (const [day, expected] of [[9, 0], [10, 1], [11, 1], [39, 1], [40, 2],
      [70, 3], [100, 4], [130, 5], [160, 6], [190, 6]]) {
      state.year = 0;
      state.dayInYear = day;
      state.tick = day * TICKS_PER_DAY;
      tickRivalSettlements(state, state.entities, callbacks);
      expect(state.rivalSettlements, `day ${day}`).toHaveLength(expected);
    }
    expect(state.buildings).toEqual(buildings);
    expect(state.entities).toEqual(people);
    expect(state.rivalSettlements.every((camp) => camp.entityIds.length === 0
      && camp.buildingIds.length === 0)).toBe(true);
  });

  it('requires six living player settlers and counts friendly neighbors toward the limit', () => {
    const { state, allAlive } = makeState();
    state.rivalSettlements = [];
    state.year = 0;
    state.dayInYear = 10;
    maybeFoundRivalSettlement(state, allAlive.filter((person) => person.faction !== 'rival').slice(0, 5));
    expect(state.rivalSettlements).toHaveLength(0);
    for (let index = 0; index < 6; index++) {
      expect(spawnRivalSettlement(state, state.buildings, 'friendly')).not.toBeNull();
    }
    const before = structuredClone(state);
    expect(spawnRivalSettlement(state, state.buildings, 'tense')).toBeNull();
    maybeFoundRivalSettlement(state, allAlive);
    expect(state).toEqual(before);
  });

  it.each([0, 3, 7])('preserves an older save with %i strategic settlements', (count) => {
    const world = initGame({ seed: 4242 });
    world.rivalSettlements = Array.from({ length: count }, (_, index) => ({
      ...rivalCamp(), id: `saved-neighbor-${index}`, relationship: 'friendly' as const,
      buildingIds: [], entityIds: [], peaceTreatyDays: 45, giftsGiven: 4,
    }));
    const expected = world.rivalSettlements.map((camp) => ({
      id: camp.id, relationship: camp.relationship, population: camp.population,
      peaceTreatyDays: camp.peaceTreatyDays, giftsGiven: camp.giftsGiven,
    }));
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    if (count === 0) delete payload.rivalSettlements;
    const parsed = parseSaveJson(JSON.stringify(payload));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) throw new Error('Save payload refused');
    const outcome = loadGameFromParsedOutcome(parsed.parsed);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.detail ?? outcome.reason);
    const loaded = outcome.world;
    expect(loaded.rivalSettlements).toMatchObject(expected);
    loaded.year = 8;
    loaded.dayInYear = 10;
    // Advance to a founding day in an established save without any new saved field.
    while ((loaded.year * DAYS_PER_YEAR + loaded.dayInYear - 10) % 30 !== 0) loaded.dayInYear++;
    loaded.tick += TICKS_PER_DAY;
    const settlers = Array.from({ length: 6 }, (_, index) => human(900000 + index));
    maybeFoundRivalSettlement(loaded, settlers);
    expect(loaded.rivalSettlements).toHaveLength(count < 6 ? count + 1 : count);
    expect(loaded.rivalSettlements.slice(0, count)).toMatchObject(expected);
    expect(loaded.buildings.some((entry) => entry.faction === 'rival')).toBe(false);
    expect(loaded.entities.some((entry) => entry.alive && entry.faction === 'rival')).toBe(false);
  });
});

/**
 * Incoming raids are rolled every day, not only on a rival's major-action day.
 *
 * `maybeQueueRaid` carries the raid's whole cadence — its own cooldown, the relationship-scaled
 * chance roll, the population and structure gates — and `groupEvents`/`storyEvents` both use
 * `raidCooldownDays` as the only raid switch. Sitting under the action-timer gate meant the roll
 * was asked once per 45–90 days, so a colony could go a whole game without being raided.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, RivalSettlement, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { tickRivalSettlements, type RivalEventCallbacks } from '../src/game/rivalEvents';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { building, human } from '../src/test/factories';

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
  createRivalBuilding: (_state, type, x, y): Building => building(800, type, { x, y, faction: 'rival' }),
  killWildGameForPoach: () => {},
};

afterEach(() => {
  resetSimRng();
});

describe('incoming raid cadence', () => {
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

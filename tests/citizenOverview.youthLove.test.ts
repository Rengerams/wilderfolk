/**
 * The People screen's sweetheart counter — `citizenOverview.computeCitizenOverview().youthLove`.
 *
 * Youth love is a real mutual pair bond in the simulation (`humanRelationships.advanceYouthLove`,
 * run daily from `tickLayerDaily`) that had no counter anywhere outside the opt-in console
 * diagnostics, so the People screen's Life card could only ever read zero while a save held
 * sweethearts. These tests pin the rule the new counter has to obey: **one pair counts once**, the
 * same one-half-only convention `affairs` and `humanTick`'s `activeYouthLovePairs` already use — so
 * they fail if the counter is ever rewritten as "settlers with a partner id", which reports two.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, Season, WeatherType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { computeCitizenOverview } from '../src/game/citizenOverview';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 14,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: 'settler' as Entity['job'],
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function makeState(entities: Entity[]): WorldState {
  return {
    entities,
    buildings: [],
    tick: 0,
    paused: false,
    speed: 1,
    width: 400,
    height: 300,
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring,
    weather: WeatherType.Clear,
    year: 0,
    dayInYear: 0,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 100,
    eventLog: [],
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 0,
    humanPopulation: 0,
    maxHumanPopulation: 0,
    workingSettlers: 0,
    idleSettlers: 0,
    villageName: 'Sweetheartville',
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
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
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
  } as unknown as WorldState;
}

/** Two 12–17 year olds naming each other — the mutual link `advanceYouthLove` creates. */
function sweetheartPair(): [Entity, Entity] {
  const her = human(1, {
    age: 14, gender: 'female', name: 'Ada', youthLovePartnerId: 2, youthLoveProgress: 40,
  });
  const him = human(2, {
    age: 15, gender: 'male', name: 'Bram', youthLovePartnerId: 1, youthLoveProgress: 40,
  });
  return [her, him];
}

describe('citizen overview — sweetheart pairs', () => {
  it('counts one mutual youth-love pair once, in either entity order', () => {
    const [her, him] = sweetheartPair();

    expect(computeCitizenOverview(makeState([her, him])).youthLove).toBe(1);
    expect(computeCitizenOverview(makeState([him, her])).youthLove).toBe(1);
  });

  it('keeps sweethearts out of the adult counters', () => {
    const [her, him] = sweetheartPair();
    const overview = computeCitizenOverview(makeState([her, him]));

    // A sweetheart link must not read as a marriage, an affair, or a pregnancy, and 14–15 year olds
    // are not "married" just because they are paired.
    expect(overview.married).toBe(0);
    expect(overview.affairs).toBe(0);
    expect(overview.pregnant).toBe(0);
    expect(overview.youthLove).toBe(1);
  });

  it('reports no pair when the sweethearts are gone', () => {
    const [her, him] = sweetheartPair();
    her.alive = false;
    him.alive = false;

    expect(computeCitizenOverview(makeState([her, him])).youthLove).toBe(0);
  });
});

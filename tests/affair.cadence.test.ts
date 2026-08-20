/**
 * Affair cadence authority — SIMULATION_AUTHORITY.md §3/§4 + Objective 9 +
 * BUG 2026-08-20-affair-establishment-dual-cadence.
 *
 * The staggered-social (realtime) path may advance tryst progress and fire
 * flirt/heart feedback, and progress may begin before establishment — but it
 * must NEVER write affairPartnerId (establishment) and must never roll a
 * scandal for an unestablished pair. Establishment, gossip, and scandal
 * decisions belong to the new-calendar-day owner (tryDailyAffairEncounter).
 *
 * The golden test runs REAL sim ticks inside the first day (no day boundary):
 * a couple at 95 tryst progress completes to 100 in the staggered path without
 * ever establishing, then the daily owner establishes on its own roll.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityType, Season, WeatherType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { gameTick } from '../src/game/gameTick';
import { tryDailyAffairEncounter } from '../src/game/humanTick';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import {
  flushRelationshipDiagnostics,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsEnabled,
} from '../src/game/relationshipDiagnostics';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
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
    ...overrides,
  } as Entity;
}

function makeState(entities: Entity[], buildings: WorldState['buildings'] = []): WorldState {
  return {
    entities,
    buildings,
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
    villageName: 'Affairville',
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

/** A married woman at 95 tryst progress + distant husband + single paramour at her side. */
function affairFixture(): { wife: Entity; husband: Entity; paramour: Entity; state: WorldState } {
  const wife = human(1, {
    gender: 'female',
    relationshipStatus: 'married',
    partnerId: 2,
    affairProgress: 95,
    x: 10,
    y: 10,
  });
  const husband = human(2, { gender: 'male', x: 100, y: 100 });
  const paramour = human(3, { gender: 'male', relationshipStatus: 'single', affairProgress: 95, x: 12, y: 10 });
  return { wife, husband, paramour, state: makeState([wife, husband, paramour]) };
}

beforeEach(() => {
  setRelationshipDiagnosticsEnabled(true);
  resetRelationshipDiagnostics();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('affair cadence (Objective 9)', () => {
  it('staggered path completes progress but NEVER establishes an affair', () => {
    const { state } = affairFixture();
    const world = structuredClone(state);

    // One full day MINUS the day boundary — the staggered path runs, the daily
    // owner does not.
    let ticked = world;
    for (let t = 1; t <= 71; t++) ticked = gameTick(ticked);

    const wifeAfter = ticked.entities.find((e) => e.id === 1)!;
    const paramourAfter = ticked.entities.find((e) => e.id === 3)!;

    expect(wifeAfter.affairPartnerId).toBeUndefined();
    expect(paramourAfter.affairPartnerId).toBeUndefined();
    expect(wifeAfter.affairProgress).toBe(100); // progress completed pre-establishment
    expect(paramourAfter.affairProgress).toBe(100);
    // No scandal artifacts either — exposure requires an established affair.
    expect(ticked.entities.some((e) => e.prisonBuildingId != null)).toBe(false);
    expect(ticked.villageReputation).toBe(50);
    expect(ticked.eventLog.some((l) => l.type === 'scandal')).toBe(false);
    expect(collectSimulationInvariantErrors(ticked)).toEqual([]);
  });

  it('daily owner is the sole establisher (deterministic unit)', () => {
    const { wife, husband, paramour, state } = affairFixture();
    const entityById = new Map([[wife.id, wife], [husband.id, husband], [paramour.id, paramour]]);

    vi.spyOn(Math, 'random').mockReturnValue(0.001); // dailyChance passes, bump=16
    tryDailyAffairEncounter(
      state,
      wife,
      entityById,
      state.buildings,
      new Map(),
      0, // no church
      18, // social hour
      undefined,
      [husband, paramour],
      400,
      300,
    );
    vi.restoreAllMocks();

    expect(wife.affairPartnerId).toBe(3);
    expect(paramour.affairPartnerId).toBe(1);
    expect(wife.affairProgress).toBe(100);
    expect(paramour.affairProgress).toBe(100);

    const snap = flushRelationshipDiagnostics(100, 1, 0)!;
    expect(snap.affairsEstablished).toBe(1);
    expect(snap.scandalExposures).toBe(0);
  });
});

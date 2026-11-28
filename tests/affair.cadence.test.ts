/**
 * Affair cadence: the staggered realtime path may advance tryst progress and fire flirt/heart
 * feedback, but only the daily owner (`tryDailyAffairEncounter`) establishes or rolls scandal.
 */
import { personDayRoll } from '../src/game/simRng';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityType, Season, WeatherType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { gameTick } from '../src/game/gameTick';
import { getPendingAffairs, selectPendingAffairMeeting, isValidAffairTarget, reconcileAffairPartner, tryDailyAffairEncounter } from '../src/game/simulation/humanRelationships';

import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
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
    energy: 0,
    maxEnergy: 0,
    needs: { nutrition: 80, rest: 85, stamina: 100 },
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
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
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
    affairCandidates: { 3: { progress: 95, lastEncounterDay: 0 } },
    x: 10,
    y: 10,
  });
  const husband = human(2, { gender: 'male', x: 100, y: 100 });
  const paramour = human(3, { gender: 'male', relationshipStatus: 'single', affairCandidates: { 1: { progress: 95, lastEncounterDay: 0 } }, x: 12, y: 10 });
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
  it('realtime pursuit outside the daily encounter gate never advances or establishes a pair', () => {
    const { state, wife, paramour } = affairFixture();
    // Begin AFTER the 18:00 clock boundary; no daily encounter can run until 19:00.
    state.tick = 18 * TICKS_PER_HOUR;
    paramour.x = 170; // outside the old 75-unit search but within known-candidate pursuit
    const initialWife = structuredClone(wife.affairCandidates);
    const initialParamour = structuredClone(paramour.affairCandidates);
    const byId = new Map(state.entities.map(person => [person.id, person]));
    for (let t = 0; t < 5; t++) {
      expect(selectPendingAffairMeeting(wife, byId, state.tick + t, () => true)).toBe(paramour);
    }
    expect(wife.affairCandidates).toEqual(initialWife);
    expect(paramour.affairCandidates).toEqual(initialParamour);
    let ticked = state;
    for (let t = 1; t < TICKS_PER_HOUR; t++) ticked = gameTick(ticked);

    const wifeAfter = ticked.entities.find((e) => e.id === 1)!;
    const paramourAfter = ticked.entities.find((e) => e.id === 3)!;
    expect(wifeAfter.affairPartnerId).toBeUndefined();
    expect(paramourAfter.affairPartnerId).toBeUndefined();
    expect(wifeAfter.affairCandidates).toEqual(initialWife);
    expect(paramourAfter.affairCandidates).toEqual(initialParamour);
    const snap = flushRelationshipDiagnostics(ticked.tick, 0, 0)!;
    expect(snap.affairChecks).toBe(0);
    expect(snap.affairProgressGains).toBe(0);
    expect(snap.affairsEstablished).toBe(0);
    expect(ticked.entities.some((e) => e.prisonBuildingId != null)).toBe(false);
    expect(ticked.villageReputation).toBe(50);
    expect(ticked.eventLog.some((l) => l.type === 'scandal')).toBe(false);
    expect(collectSimulationInvariantErrors(ticked)).toEqual([]);
  });

  it('establishes from the married participant even if the single paramour has the lower ID', () => {
    const married = human(8, {
      gender: 'female', relationshipStatus: 'married', partnerId: 7,
      affairCandidates: { 2: { progress: 95, lastEncounterDay: 0 } }, x: 10, y: 10,
    });
    const spouse = human(7, { gender: 'male', x: 200, y: 200 });
    const single = human(2, {
      gender: 'male', relationshipStatus: 'single',
      affairCandidates: { 8: { progress: 95, lastEncounterDay: 0 } }, x: 12, y: 10,
    });
    const state = makeState([married, spouse, single]);
    const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));
    let day = 1;
    while (day <= 20_000 && personDayRoll(married.id, day * TICKS_PER_DAY, 610) >= 0.001) day++;
    expect(day).toBeLessThanOrEqual(20_000);
    state.tick = day * TICKS_PER_DAY;
    married.affairCandidates![2].lastEncounterDay = day;
    single.affairCandidates![8].lastEncounterDay = day;

    tryDailyAffairEncounter(state, married, entityById, state.buildings,
      new Map(), 0, 18, undefined, [spouse, single], 400, 300);

    expect(married.affairPartnerId).toBe(single.id);
    expect(single.affairPartnerId).toBe(married.id);
    expect(married.affairCandidateId).toBeUndefined();
    expect(single.affairCandidateId).toBeUndefined();
  });

  it('daily owner is the sole establisher (deterministic unit)', () => {
    const { wife, husband, paramour, state } = affairFixture();
    const entityById = new Map([[wife.id, wife], [husband.id, husband], [paramour.id, paramour]]);

    // The daily gate is a stateless per-settler, per-day roll (`personDayRoll(id, tick, 610)`),
    // so this loop picks the first day whose roll fires.
    const tickOnDay = (day: number): number => day * TICKS_PER_DAY;
    let day = 1;
    while (day <= 5000 && personDayRoll(wife.id, tickOnDay(day), 610) >= 0.001) day++;
    state.tick = tickOnDay(day);
    wife.affairCandidates![3].lastEncounterDay = day;
    paramour.affairCandidates![1].lastEncounterDay = day;

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

    expect(wife.affairCandidateId).toBeUndefined();
    expect(paramour.affairCandidateId).toBeUndefined();
    expect(wife.affairPartnerId).toBe(3);
    expect(paramour.affairPartnerId).toBe(1);
    expect(wife.affairProgress).toBe(100);
    expect(paramour.affairProgress).toBe(100);

    const snap = flushRelationshipDiagnostics(100, 1, 0)!;
    expect(snap.affairsEstablished).toBe(1);
    expect(snap.scandalExposures).toBe(0);
  });
});

describe('affair progress belongs to a verified pair', () => {
  it('clears legacy unbound progress instead of transferring 100% to a new lover', () => {
    const single = human(3, {
      gender: 'female', relationshipStatus: 'single',
      affairProgress: 100, courtshipPartnerId: 4, courtshipProgress: 47,
    });
    const married = human(1, {
      gender: 'male', relationshipStatus: 'married', partnerId: 2,
      affairProgress: 100,
    });
    const people = new Map([[single.id, single], [married.id, married]]);
    reconcileAffairPartner(single, people);
    reconcileAffairPartner(married, people);
    expect(single.affairPartnerId).toBeUndefined();
    expect(single.affairProgress).toBe(0);
    expect(single.courtshipPartnerId).toBe(4);
    expect(single.courtshipProgress).toBe(47);
    expect(married.affairProgress).toBe(0);
    expect(single.affairCandidates).toBeUndefined();
    expect(married.affairCandidates).toBeUndefined();
  });

  it('keeps only a mutual unmarried paramour candidate with a married initiator', () => {
    const married = human(8, {
      gender: 'female', relationshipStatus: 'married', partnerId: 6,
      affairCandidateId: 2, affairProgress: 32,
    });
    const single = human(2, {
      gender: 'male', relationshipStatus: 'single',
      affairCandidateId: 8, affairProgress: 32,
    });
    const people = new Map([[married.id, married], [single.id, single]]);
    reconcileAffairPartner(married, people);
    reconcileAffairPartner(single, people);
    expect(married.affairCandidates?.[2]?.progress).toBe(32);
    expect(single.affairCandidates?.[8]?.progress).toBe(32);
    expect(married.affairCandidateId).toBeUndefined();
    expect(single.affairCandidateId).toBeUndefined();
    expect(isValidAffairTarget(married, single, 0)).toBe(true);
    single.courtshipPartnerId = 9;
    expect(isValidAffairTarget(married, single, 0)).toBe(false);
    reconcileAffairPartner(single, people);
    reconcileAffairPartner(married, people);
    expect(single.affairCandidates).toBeUndefined();
    expect(married.affairCandidates).toBeUndefined();
  });

  it.each([false, true])('consumes both legacy sides on the first call and is idempotent (reverse=%s)', (reverse) => {
    const married = human(8, { gender: 'female', relationshipStatus: 'married', partnerId: 6,
      affairCandidateId: 2, affairProgress: 32 });
    const single = human(2, { gender: 'male', relationshipStatus: 'single',
      affairCandidateId: 8, affairProgress: 47 });
    const people = new Map([[married.id, married], [single.id, single]]);
    const order = reverse ? [single, married] : [married, single];
    reconcileAffairPartner(order[0], people, 3 * TICKS_PER_DAY);
    const entry = { progress: 32, lastEncounterDay: 3 };
    expect(married.affairCandidates).toEqual({ 2: entry });
    expect(single.affairCandidates).toEqual({ 8: entry });
    for (const person of order) {
      expect(person.affairCandidateId).toBeUndefined();
      expect(person.affairProgress).toBe(0);
    }
    const snapshot = structuredClone(order);
    for (let round = 0; round < 3; round++) {
      for (const person of [...order].reverse()) reconcileAffairPartner(person, people, (4 + round) * TICKS_PER_DAY);
      expect(order).toEqual(snapshot);
    }
  });

  it.each([false, true])('discards one-sided legacy progress regardless of reconciliation order (reverse=%s)', (reverse) => {
    const married = human(8, { gender: 'female', relationshipStatus: 'married', partnerId: 6,
      affairCandidateId: 2, affairProgress: 99 });
    const single = human(2, { gender: 'male', relationshipStatus: 'single', affairProgress: 100 });
    const people = new Map([[married.id, married], [single.id, single]]);
    const order = reverse ? [single, married] : [married, single];
    for (const person of order) reconcileAffairPartner(person, people);
    for (const person of order) {
      expect(person.affairCandidateId).toBeUndefined();
      expect(person.affairCandidates).toBeUndefined();
      expect(person.affairProgress).toBe(0);
      expect(person.affairPartnerId).toBeUndefined();
    }
  });

  it('discards both invalid reciprocal legacy links immediately, preserving any established scalar', () => {
    const married = human(8, { gender: 'female', relationshipStatus: 'married', partnerId: 6,
      affairCandidateId: 2, affairProgress: 99 });
    const single = human(2, { gender: 'male', relationshipStatus: 'single',
      affairCandidateId: 8, affairPartnerId: 4, affairProgress: 100 });
    const lover = human(4, { gender: 'female', relationshipStatus: 'married', affairPartnerId: 2, affairProgress: 100 });
    const people = new Map([[married.id, married], [single.id, single], [lover.id, lover]]);
    reconcileAffairPartner(married, people);
    expect(married.affairCandidateId).toBeUndefined();
    expect(married.affairProgress).toBe(0);
    expect(married.affairCandidates).toBeUndefined();
    expect(single.affairCandidateId).toBeUndefined();
    expect(single.affairPartnerId).toBe(4);
    expect(single.affairProgress).toBe(100);
    expect(single.affairCandidates).toBeUndefined();
  });

  it('does not refresh or overwrite an already migrated reciprocal map with stale legacy scalars', () => {
    const { wife, paramour, state } = affairFixture();
    wife.affairCandidateId = paramour.id;
    paramour.affairCandidateId = wife.id;
    wife.affairProgress = 100;
    paramour.affairProgress = 100;
    const byId = new Map(state.entities.map(person => [person.id, person]));
    reconcileAffairPartner(paramour, byId, 5 * TICKS_PER_DAY);
    expect(wife.affairCandidates).toEqual({ 3: { progress: 95, lastEncounterDay: 0 } });
    expect(paramour.affairCandidates).toEqual({ 1: { progress: 95, lastEncounterDay: 0 } });
    expect(wife.affairCandidateId).toBeUndefined();
    expect(paramour.affairCandidateId).toBeUndefined();
    expect(wife.affairProgress).toBe(0);
    expect(paramour.affairProgress).toBe(0);
  });

  it('retires pending progress when the candidates become spouses', () => {
    const married = human(8, {
      gender: 'female', relationshipStatus: 'married', partnerId: 2,
      affairCandidateId: 2, affairProgress: 99,
    });
    const former = human(2, {
      gender: 'male', relationshipStatus: 'married', partnerId: 8,
      affairCandidateId: 8, affairProgress: 99,
    });
    const people = new Map([[married.id, married], [former.id, former]]);
    reconcileAffairPartner(married, people);
    reconcileAffairPartner(former, people);
    expect(married.affairCandidateId).toBeUndefined();
    expect(former.affairCandidateId).toBeUndefined();
    expect(married.affairProgress).toBe(0);
    expect(former.affairProgress).toBe(0);
  });

  it('does not assign a completed affair to the wrong candidate when one person changes partners', () => {
    const married = human(8, {
      gender: 'female', relationshipStatus: 'married', partnerId: 6,
      affairCandidateId: 2, affairProgress: 99,
    });
    const former = human(2, { gender: 'male', relationshipStatus: 'single', affairCandidateId: 8, affairProgress: 99 });
    const next = human(3, { gender: 'male', relationshipStatus: 'single' });
    const people = new Map([[married.id, married], [former.id, former], [next.id, next]]);
    // Pending interest is not an exclusive established affair.
    expect(isValidAffairTarget(married, next, 0)).toBe(true);
    former.affairCandidateId = undefined;
    reconcileAffairPartner(married, people);
    expect(married.affairCandidateId).toBeUndefined();
    expect(married.affairProgress).toBe(0);
    expect(isValidAffairTarget(married, next, 0)).toBe(true);
  });
});


describe('nonexclusive pending affairs', () => {
  it('keeps independent reciprocal candidates and expires only the stale pair', () => {
    const married = human(1, { gender: 'female', relationshipStatus: 'married', partnerId: 9,
      affairCandidates: { 2: { progress: 10, lastEncounterDay: 0 }, 3: { progress: 70, lastEncounterDay: 20 } } });
    const first = human(2, { gender: 'male', relationshipStatus: 'single',
      affairCandidates: { 1: { progress: 10, lastEncounterDay: 0 } } });
    const second = human(3, { gender: 'male', relationshipStatus: 'single',
      affairCandidates: { 1: { progress: 70, lastEncounterDay: 20 } } });
    const people = [married, first, second];
    const byId = new Map(people.map(person => [person.id, person]));
    expect(getPendingAffairs(married, people, 0).map(p => p.person.id)).toEqual([3, 2]);
    expect(selectPendingAffairMeeting(married, byId, 0, person => person.id === 3)).toBe(second);
    reconcileAffairPartner(married, byId, 20 * TICKS_PER_DAY);
    expect(first.affairCandidates).toBeUndefined();
    expect(married.affairCandidates?.[first.id]).toBeUndefined();
    expect(married.affairCandidates).toEqual({ 3: { progress: 70, lastEncounterDay: 20 } });
    expect(second.affairCandidates).toEqual({ 1: { progress: 70, lastEncounterDay: 20 } });
    expect(getPendingAffairs(married, people, 20 * TICKS_PER_DAY).map(p => p.progress)).toEqual([70]);
  });

  it('a real successful encounter with a different candidate keeps the first pair intact', () => {
    const { wife, husband, paramour, state } = affairFixture();
    const next = human(4, { gender: 'male', relationshipStatus: 'single', x: 11, y: 10 });
    let day = 1;
    while (day <= 20_000 && personDayRoll(wife.id, day * TICKS_PER_DAY, 610) >= 0.001) day++;
    expect(day).toBeLessThanOrEqual(20_000);
    wife.affairCandidates![3].lastEncounterDay = day;
    paramour.affairCandidates![1].lastEncounterDay = day;
    state.tick = day * TICKS_PER_DAY;
    state.entities.push(next);
    const byId = new Map(state.entities.map(person => [person.id, person]));
    tryDailyAffairEncounter(state, wife, byId, [], new Map(), 0, 18, undefined,
      [husband, paramour, next], 400, 300, person => person.id === next.id);
    expect(wife.affairCandidates?.[3]?.progress).toBe(95);
    expect(wife.affairCandidates?.[4]?.progress).toBeGreaterThan(0);
    expect(wife.affairCandidates?.[4]).toEqual(next.affairCandidates?.[1]);
    expect(wife.affairPartnerId).toBeUndefined();
  });
});

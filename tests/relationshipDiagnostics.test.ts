/**
 * Relationship diagnostics truthfulness — Objective 8.
 *
 * Every counter means exactly what its name says:
 *   - `conceptionCandidates` increments once per evaluated candidate.
 *   - Each gate failure (eligibility / energy / proximity / roll) records only
 *     the FIRST reason a candidate was blocked — candidates == successes +
 *     sum(blocks) for a single-path candidate.
 *   - `pregnanciesStartedThisInterval` increments ONLY when a new pregnancy is
 *     created; `birthsCompletedThisInterval` increments only at a completed
 *     birth; `activePregnancies` is the current pregnant count from the
 *     authoritative state and never derived from the interval counters.
 *
 * The fixture starts a pregnancy (mocked roll), advances it to term, and
 * completes a birth — then checks each counter.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityType, Season, WeatherType, emptyEntityByType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tryDailyConception } from '../src/game/simulation/humanRelationships';
import { tickPregnancyAndBirth } from '../src/game/simulation/humanLifecycle';
import {
  flushRelationshipDiagnostics,
  recordRelationshipDiagnostic,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsEnabled,
  type RelationshipDiagnosticsSnapshot,
} from '../src/game/relationshipDiagnostics';

const ENERGY_THRESHOLD = SPECIES_CONFIG[EntityType.Human].reproductionEnergyThreshold;

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

function makeState(entities: Entity[]): WorldState {
  return {
    entities,
    tick: 100,
    width: 400,
    height: 300,
    year: 0,
    dayInYear: 0,
    season: Season.Spring,
    weather: WeatherType.Clear,
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextEntityId: 100,
    eventLog: [],
    villageReputation: 50,
    buildings: [],
    paused: false,
    speed: 1,
  } as unknown as WorldState;
}

function makeCtx(entities: Entity[]): TickContext {
  const entityById = new Map(entities.map((e) => [e.id, e]));
  return {
    width: 400,
    height: 300,
    byType: emptyEntityByType(),
    newEntities: [],
    entityById,
    buildingById: new Map(),
    aliveEntities: entities,
    updatedBuildings: [],
    playerHumans: entities,
    predators: [],
    hourOfDay: 12,
    season: Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
  } as TickContext;
}

function flush(activePregnancies: number): RelationshipDiagnosticsSnapshot {
  return flushRelationshipDiagnostics(100, 1, activePregnancies)!;
}

beforeEach(() => {
  setRelationshipDiagnosticsEnabled(true);
  resetRelationshipDiagnostics();
});

afterAll(() => {
  setRelationshipDiagnosticsEnabled(false);
  vi.restoreAllMocks();
});

describe('conception gate funnel (Objective 8)', () => {
  it('records eligibility rejection for a non-eligible candidate', () => {
    const male = human(1, { gender: 'male', relationshipStatus: 'married', partnerId: 2 });
    const wife = human(2, { gender: 'female' });
    const state = makeState([male, wife]);
    const ctx = makeCtx([male, wife]);

    expect(tryDailyConception(state, ctx, male)).toBe(false);
    const snap = flush(0);

    expect(snap.conceptionCandidates).toBe(1);
    expect(snap.conceptionEligibilityRejected).toBe(1);
    expect(snap.conceptionEnergyBlocked).toBe(0);
    expect(snap.conceptionProximityBlocked).toBe(0);
    expect(snap.conceptionRollFailed).toBe(0);
    expect(snap.pregnanciesStartedThisInterval).toBe(0);
  });

  it('records an energy block for a low-energy married woman', () => {
    const mother = human(1, {
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 2,
      energy: ENERGY_THRESHOLD * 0.5,
    });
    const husband = human(2, { gender: 'male' });
    const state = makeState([mother, husband]);
    const ctx = makeCtx([mother, husband]);

    expect(tryDailyConception(state, ctx, mother)).toBe(false);
    const snap = flush(0);

    expect(snap.conceptionEnergyBlocked).toBe(1);
    expect(snap.conceptionEligibilityRejected).toBe(0);
  });

  it('records a proximity block when the couple is apart', () => {
    const mother = human(1, {
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 2,
      energy: ENERGY_THRESHOLD * 2,
      x: 10,
      y: 10,
    });
    const husband = human(2, { gender: 'male', x: 100, y: 100 });
    const state = makeState([mother, husband]);
    const ctx = makeCtx([mother, husband]);

    expect(tryDailyConception(state, ctx, mother)).toBe(false);
    const snap = flush(0);

    expect(snap.conceptionProximityBlocked).toBe(1);
    expect(snap.conceptionEnergyBlocked).toBe(0);
  });

  it('records a roll failure when the couple is together but the roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const mother = human(1, {
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 2,
      energy: ENERGY_THRESHOLD * 2,
      x: 10,
      y: 10,
    });
    const husband = human(2, { gender: 'male', x: 10, y: 10 });
    const state = makeState([mother, husband]);
    const ctx = makeCtx([mother, husband]);

    expect(tryDailyConception(state, ctx, mother)).toBe(false);
    const snap = flush(0);

    expect(snap.conceptionRollFailed).toBe(1);
    expect(snap.conceptionProximityBlocked).toBe(0);
    expect(snap.pregnanciesStartedThisInterval).toBe(0);
    vi.restoreAllMocks();
  });

  it('increments pregnanciesStartedThisInterval only when a pregnancy is created', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const mother = human(1, {
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 2,
      energy: ENERGY_THRESHOLD * 2,
      x: 10,
      y: 10,
    });
    const husband = human(2, { gender: 'male', x: 10, y: 10 });
    const state = makeState([mother, husband]);
    const ctx = makeCtx([mother, husband]);

    expect(tryDailyConception(state, ctx, mother)).toBe(true);
    const snap = flush(1);

    expect(mother.pregnant).toBe(true);
    expect(mother.pregnancyDueProgress).toBeGreaterThan(0);
    expect(snap.pregnanciesStartedThisInterval).toBe(1);
    expect(snap.conceptionRollFailed).toBe(0);
    vi.restoreAllMocks();
  });
});

describe('active vs interval state (Objective 8)', () => {
  it('activePregnancies comes from the authoritative state, not the interval counters', () => {
    // Two pregnant women who conceived in a PREVIOUS interval.
    const a = human(1, { gender: 'female', pregnant: true, pregnancyDueProgress: 50 });
    const b = human(2, { gender: 'female', pregnant: true, pregnancyDueProgress: 60 });
    const state = makeState([a, b]);
    // Mirror the real flush site (humanTick): count from the authoritative world.
    const active = state.entities.filter((e) => e.alive && e.pregnant).length;

    const snap = flush(active);

    expect(snap.activePregnancies).toBe(2);
    expect(snap.pregnanciesStartedThisInterval).toBe(0); // predates this interval
    expect(snap.birthsCompletedThisInterval).toBe(0);
  });

  it('interval counters reset on flush; active state is re-read fresh', () => {
    recordRelationshipDiagnostic('conceptionCandidates');
    recordRelationshipDiagnostic('pregnanciesStartedThisInterval');
    const first = flush(1);
    expect(first.conceptionCandidates).toBe(1);
    expect(first.pregnanciesStartedThisInterval).toBe(1);

    const second = flush(1);
    expect(second.conceptionCandidates).toBe(0);
    expect(second.pregnanciesStartedThisInterval).toBe(0);
    expect(second.activePregnancies).toBe(1);
  });
});

describe('birth lifecycle (Objective 8)', () => {
  it('counts a completed birth separately from new conceptions', () => {
    const husband = human(2, { gender: 'male' });
    const mother = human(1, {
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 2,
      pregnant: true,
      pregnantById: 2,
      pregnancyProgress: 49,
      pregnancyDueProgress: 50,
    });
    const state = makeState([mother, husband]);
    const ctx = makeCtx([mother, husband]);

    // Pregnancy existed BEFORE this interval — visible only via active state.
    const before = flush(1);
    expect(before.activePregnancies).toBe(1);
    expect(before.pregnanciesStartedThisInterval).toBe(0);
    expect(before.birthsCompletedThisInterval).toBe(0);

    vi.spyOn(Math, 'random').mockReturnValue(0.5); // not stillborn, not wildkin
    tickPregnancyAndBirth(state, ctx, mother, { livingHumanAt: (id) => ctx.entityById.get(id ?? -1) });

    expect(mother.pregnant).toBe(false);
    expect(ctx.newEntities.length).toBe(1); // the child
    const after = flush(0);
    expect(after.birthsCompletedThisInterval).toBe(1);
    expect(after.pregnanciesStartedThisInterval).toBe(0); // conception was not this interval
    expect(after.activePregnancies).toBe(0);
    vi.restoreAllMocks();
  });
});

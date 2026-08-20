/**
 * Tick-layer schedule lock — SIMULATION_AUTHORITY.md §4.
 *
 * The tick-layer structure is FIXED for this architecture. `gameTick` is the
 * only orchestrator and it calls exactly four layer files, in this order, on
 * fixed cadences:
 *
 *   1. tickLayerRealtime — every tick (movement, animation, realtime spatial behavior)
 *   2. tickLayerSystems  — every LAYER_SYSTEMS_INTERVAL (4) ticks
 *   3. tickLayerAssign   — every LAYER_ASSIGN_INTERVAL (18) ticks
 *   4. tickLayerDaily    — every TICKS_PER_DAY (72) ticks, once per colony day
 *
 * No tickLayerSocial.ts / tickLayerPregnancy.ts / tickLayerMoonHowler.ts /
 * tickLayerBuildings.ts may exist; new layers require an authority-document
 * update first (§4 gate).
 *
 * This test instruments the four layer modules with spies and drives the real
 * `gameTick` orchestration (all domain logic inside the layers is mocked out),
 * then asserts the fixed order and the exact per-interval call counts — the
 * executable version of the cadence law. TICKS_PER_DAY === 72 (production
 * cadence) is asserted explicitly; a temporary benchmark cadence must never be
 * committed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { Season, WeatherType } from '../src/game/gameTypes';

const callLog = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('../src/game/tickLayerRealtime', () => ({
  tickLayerRealtime: vi.fn((state: { tick: number }) => {
    callLog.calls.push(`realtime@${state.tick}`);
  }),
}));

vi.mock('../src/game/tickLayerSystems', () => ({
  tickLayerSystems: vi.fn((state: { tick: number }) => {
    callLog.calls.push(`systems@${state.tick}`);
  }),
  LAYER_SYSTEMS_INTERVAL: 4,
}));

vi.mock('../src/game/tickLayerAssign', () => ({
  tickLayerAssign: vi.fn((state: { tick: number }) => {
    callLog.calls.push(`assign@${state.tick}`);
  }),
  LAYER_ASSIGN_INTERVAL: 18,
}));

vi.mock('../src/game/tickLayerDaily', () => ({
  tickLayerDaily: vi.fn((state: { tick: number }) => {
    callLog.calls.push(`daily@${state.tick}`);
  }),
  tickWinterHeating: vi.fn(() => true),
}));

import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function world(startTick: number): WorldState {
  return {
    tick: startTick,
    paused: false,
    width: 800,
    height: 600,
    entities: [],
    buildings: [],
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    weather: WeatherType.Clear,
    season: Season.Spring,
    year: 0,
    dayInYear: 0,
    yearlyStats: [],
    lifetimeStats: {},
    eventsThisYear: [],
    ecosystemHealth: 100,
    humanPopulation: 0,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
    workingSettlers: 0,
    idleSettlers: 0,
    nextEntityId: 1,
    nextBuildingId: 1,
    nextFloatingTextId: 1,
    villageName: 'Orderville',
    villageReputation: 0,
    storageMax: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    foodSpoilageRate: 0,
    biodiversityIndex: 100,
    pollutionLevel: 0,
    challenges: [],
    autoSave: false,
    notifications: [],
    bigNews: [],
    screenShakeImpulse: 0,
    disasters: [],
    tradeRoutes: [],
    totalBuildingsCompleted: 0,
    worldMap: null,
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: 0,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    eventLog: [],
  } as unknown as WorldState;
}

function runTicks(fromTick: number, count: number): void {
  let state = world(fromTick);
  for (let i = 0; i < count; i++) {
    state = gameTick(state);
  }
}

beforeEach(() => {
  callLog.calls.length = 0;
});

describe('gameTick layer orchestration (fixed schedule)', () => {
  it('protects the production cadence: TICKS_PER_DAY is 72', () => {
    expect(TICKS_PER_DAY).toBe(72);
  });

  it('calls the four layers in fixed order on a full-stack tick (72)', () => {
    runTicks(0, 72);
    const tail = callLog.calls.slice(-4);
    expect(tail).toEqual(['realtime@72', 'systems@72', 'assign@72', 'daily@72']);
  });

  it('runs each layer only on its declared interval over 216 ticks (3 days)', () => {
    runTicks(0, 216); // 216 = 3 × TICKS_PER_DAY
    const count = (name: string) => callLog.calls.filter((c) => c.startsWith(`${name}@`)).length;

    expect(count('realtime')).toBe(216); // every tick
    expect(count('systems')).toBe(216 / 4); // LAYER_SYSTEMS_INTERVAL
    expect(count('assign')).toBe(216 / 18); // LAYER_ASSIGN_INTERVAL (4×/day)
    expect(count('daily')).toBe(216 / TICKS_PER_DAY); // once per colony day
  });

  it('fires no daily tick before the first day boundary', () => {
    runTicks(0, TICKS_PER_DAY - 1);
    expect(callLog.calls.some((c) => c.startsWith('daily@'))).toBe(false);
  });

  it('fires no assign pulse before its first interval tick', () => {
    runTicks(0, 17);
    expect(callLog.calls.some((c) => c.startsWith('assign@'))).toBe(false);
  });

  it('daily runs exactly once per colony day at the day boundary', () => {
    runTicks(0, 3 * TICKS_PER_DAY);
    const dailies = callLog.calls.filter((c) => c.startsWith('daily@'));
    expect(dailies).toEqual(['daily@72', 'daily@144', 'daily@216']);
  });

  it('produces an identical trace on repeated runs (deterministic schedule)', () => {
    runTicks(0, 216);
    const first = [...callLog.calls];
    callLog.calls.length = 0;
    runTicks(0, 216);
    expect(callLog.calls).toEqual(first);
  });
});

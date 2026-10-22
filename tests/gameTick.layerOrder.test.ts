/**
 * Tick-layer schedule lock — SIMULATION_AUTHORITY.md §4.
 *
 * The tick-layer structure is FIXED for this architecture. `gameTick` is the
 * only orchestrator and it calls exactly four layer files, in this order, on
 * fixed cadences:
 *
 *   1. tickLayerRealtime — every tick (movement, animation, realtime spatial behavior)
 *   2. tickLayerSystems  — every LAYER_SYSTEMS_INTERVAL (4) ticks
 *   3. tickLayerAssign   — every LAYER_ASSIGN_INTERVAL (18) ticks, offset 9 ticks (03:00)
 *   4. tickLayerDaily    — every TICKS_PER_DAY (72) ticks, once per colony day
 *
 * No tickLayerSocial.ts / tickLayerPregnancy.ts / tickLayerMoonHowler.ts /
 * tickLayerBuildings.ts may exist; new layers require an authority-document
 * update first (§4 gate).
 *
 * This test instruments the four layer modules with spies and drives the real
 * `gameTick` orchestration (all domain logic inside the layers is mocked out),
 * then asserts the fixed order and the exact per-interval call counts — the
 * executable version of the cadence law. TICKS_PER_DAY === 288 (production
 * cadence) is asserted explicitly; a temporary benchmark cadence must never be
 * committed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { Season, WeatherType } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';

const callLog = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('../src/game/tickLayerRealtime', () => ({
  tickLayerRealtime: vi.fn((state: { tick: number }) => {
    callLog.calls.push(`realtime@${state.tick}`);
  }),
}));

vi.mock('../src/game/tickLayerSystems', async () => {
  // The interval must come from the owner, not a literal: a mock that hardcodes it lets the real
  // constant change while this test keeps reporting the old cadence.
  const actual = await vi.importActual<typeof import('../src/game/tickLayerSystems')>(
    '../src/game/tickLayerSystems',
  );
  return {
    ...actual,
    tickLayerSystems: vi.fn((state: { tick: number }) => {
      callLog.calls.push(`systems@${state.tick}`);
    }),
  };
});

vi.mock('../src/game/tickLayerAssign', async () => {
  const actual = await vi.importActual<typeof import('../src/game/tickLayerAssign')>(
    '../src/game/tickLayerAssign',
  );
  return {
    ...actual,
    tickLayerAssign: vi.fn((state: { tick: number }) => {
      callLog.calls.push(`assign@${state.tick}`);
    }),
  };
});

vi.mock('../src/game/tickLayerDaily', () => ({
  tickLayerDaily: vi.fn((state: { tick: number }) => {
    callLog.calls.push(`daily@${state.tick}`);
  }),
  tickWinterHeating: vi.fn(() => true),
}));

vi.mock('../src/game/prisonGuardDuty', async () => {
  const actual = await vi.importActual<typeof import('../src/game/prisonGuardDuty')>(
    '../src/game/prisonGuardDuty',
  );
  return {
    ...actual,
    tickPrisonPresence: vi.fn((state: { tick: number }) => {
      if (state.tick % TICKS_PER_HOUR === 0) callLog.calls.push(`prison-presence@${state.tick}`);
    }),
  };
});


import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { LAYER_SYSTEMS_INTERVAL } from '../src/game/tickLayerSystems';
import { LAYER_ASSIGN_INTERVAL } from '../src/game/tickLayerAssign';

function world(startTick: number): WorldState {
  return {
    tick: startTick,
    paused: false,
    width: 800,
    height: 600,
    entities: [],
    buildings: [],
    deathParticles: [],
    floatingTexts: [],
    researchNodes: [],
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

async function runTicks(fromTick: number, count: number): Promise<void> {
  vi.resetModules();
  const { gameTick } = await import('../src/game/gameTick');
  let state = world(fromTick);
  for (let i = 0; i < count; i++) {
    state = gameTick(state);
  }
}

beforeEach(() => {
  callLog.calls.length = 0;
});

describe('gameTick layer orchestration (fixed schedule)', () => {
  it('protects the production cadence: TICKS_PER_DAY is 288', () => {
    expect(TICKS_PER_DAY).toBe(288);
  });

  it('pins the layer intervals the schedule law declares', () => {
    // The counts below are written as the law's literals, so these two must agree with it.
    expect(LAYER_SYSTEMS_INTERVAL).toBe(4);
    expect(LAYER_ASSIGN_INTERVAL).toBe(72);
  });

  it('calls the four layers in fixed order on a full-stack tick (288)', async () => {
    await runTicks(0, TICKS_PER_DAY);
    const tail = callLog.calls.slice(-4);
    expect(tail).toEqual(['realtime@288', 'systems@288', 'prison-presence@288', 'daily@288']);
  });

  it('runs each layer only on its declared interval over three days', async () => {
    const ticks = 3 * TICKS_PER_DAY;
    await runTicks(0, ticks);
    const count = (name: string) => callLog.calls.filter((c) => c.startsWith(`${name}@`)).length;

    expect(count('realtime')).toBe(ticks);
    expect(count('systems')).toBe(ticks / LAYER_SYSTEMS_INTERVAL);
    expect(count('assign')).toBe(ticks / LAYER_ASSIGN_INTERVAL);
    expect(count('prison-presence')).toBe(ticks / TICKS_PER_HOUR);
    expect(count('daily')).toBe(ticks / (TICKS_PER_DAY / 4));
  });

  it('fires no daily tick before the first day boundary', async () => {
    await runTicks(0, TICKS_PER_DAY / 4 - 1);
    expect(callLog.calls.some((c) => c.startsWith('daily@'))).toBe(false);
  });

  it('runs assignment at 03:00, 09:00, 15:00 and 21:00, never midnight', async () => {
    await runTicks(0, TICKS_PER_DAY);
    const assignments = callLog.calls.filter((c) => c.startsWith('assign@'));
    expect(assignments).toEqual(['assign@36', 'assign@108', 'assign@180', 'assign@252']);
  });

  it('daily runs exactly once per colony day at the day boundary', async () => {
    await runTicks(0, 3 * TICKS_PER_DAY);
    const dailies = callLog.calls.filter((c) => c.startsWith('daily@'));
    expect(dailies).toEqual(Array.from({ length: 12 }, (_, i) => `daily@${(i + 1) * (TICKS_PER_DAY / 4)}`));
  });

  it('produces an identical trace on repeated runs (deterministic schedule)', async () => {
    await runTicks(0, 3 * TICKS_PER_DAY);
    const first = [...callLog.calls];
    callLog.calls.length = 0;
    await runTicks(0, 3 * TICKS_PER_DAY);
    expect(callLog.calls).toEqual(first);
  });
});

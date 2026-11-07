/**
 * The main-thread fallback fails like the worker: it snapshots the mutable sim slices before the tick
 * and restores them when `gameTick` throws, so a failed frame leaves no partially-applied tick.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Season, WeatherType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { createInitialView } from '../src/game/viewState';

vi.mock('../src/game/gameEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/gameEngine')>();
  return { ...actual, gameTick: vi.fn(actual.gameTick) };
});

/** A world with the fields `extractSimPrep` / `applySimPrep` touch, shaped like the loop's own tests. */
function makeWorld(): WorldState {
  return {
    entities: [] as Entity[],
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
    villageName: 'Loopville',
    villageReputation: 0,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
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
  } as unknown as WorldState;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main-thread fallback tick rollback (P-3)', () => {
  it('holds simulation off the UI thread while worker recovery is scheduled', async () => {
    vi.resetModules();
    const { GameLoop } = await import('../src/game/gameLoop');
    const { gameTick } = await import('../src/game/gameEngine');
    const loop = new GameLoop(makeWorld(), createInitialView(400, 300), () => null);
    const internals = loop as unknown as {
      running: boolean; tickAccumulator: number; workerRecoveryTimer: ReturnType<typeof setTimeout> | null;
      frameBody: (time: number) => void;
    };
    internals.running = true;
    internals.tickAccumulator = 1000;
    const timer = setTimeout(() => {}, 60_000);
    internals.workerRecoveryTimer = timer;
    vi.mocked(gameTick).mockClear();
    vi.mocked(gameTick).mockImplementation((world) => { world.tick++; return world; });
    try {
      internals.frameBody(1000);
      expect(vi.mocked(gameTick)).not.toHaveBeenCalled();
      expect(loop.getWorld().tick).toBe(0);
      clearTimeout(timer);
      internals.workerRecoveryTimer = null;
      internals.frameBody(2000);
      expect(loop.getWorld().tick).toBe(1);
    } finally {
      clearTimeout(timer);
      internals.workerRecoveryTimer = null;
    }
  });

  it('restores the pre-tick world and stops retrying when a fallback tick throws', async () => {
    vi.resetModules();
    const { GameLoop } = await import('../src/game/gameLoop');
    const { gameTick } = await import('../src/game/gameEngine');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loop = new GameLoop(makeWorld(), createInitialView(400, 300), () => null);
    (loop as unknown as { running: boolean }).running = true;

    const before = structuredClone(loop.getWorld()) as WorldState;

    // The failing call mutates first, the way the real tick does before its invariant check.
    vi.mocked(gameTick).mockImplementation((world: WorldState) => {
      world.tick += 1;
      world.resources.food -= 5;
      throw new Error('simulated tick failure');
    });

    // Force the unsupported-worker fallback path. A recovery timer or worker
    // boot gate would correctly prevent all local ticks, masking the rollback.
    const internals = loop as unknown as {
      workerBooting: boolean; workerEnabled: boolean;
      workerRecoveryTimer: ReturnType<typeof setTimeout> | null;
      workerRecoveryInFlight: boolean; tickAccumulator: number;
    };
    internals.workerBooting = false;
    internals.workerEnabled = false;
    internals.workerRecoveryTimer = null;
    internals.workerRecoveryInFlight = false;
    internals.tickAccumulator = 12_000;
    const frameBody = (loop as unknown as { frameBody: (time: number) => void }).frameBody.bind(loop);

    frameBody(1000);
    const heldTime = internals.tickAccumulator;
    frameBody(2000);
    expect(internals.tickAccumulator).toBe(heldTime);
    frameBody(3000);
    expect(internals.tickAccumulator).toBe(heldTime);

    // One attempt per frame — never the same accumulated tick retried up to MAX_CATCHUP_STEPS
    // times — and the partial tick it applied is gone.
    expect(vi.mocked(gameTick)).toHaveBeenCalledTimes(3);
    expect(loop.getWorld().tick).toBe(before.tick);
    expect(loop.getWorld().resources).toEqual(before.resources);
    expect(loop.getWorld().entities).toEqual(before.entities);

    // Reported once through the loop's warn channel, not once per frame.
    const reports = warn.mock.calls.filter((call) =>
      String(call[0]).includes('Main-thread tick failed'),
    );
    expect(reports).toHaveLength(1);

    vi.mocked(gameTick).mockImplementation((world: WorldState) => {
      world.tick += 1;
      return world;
    });
    frameBody(4000);
    expect(loop.getWorld().tick).toBe(before.tick + 1);
    expect(internals.tickAccumulator).toBe(heldTime - 1000);
  });
});

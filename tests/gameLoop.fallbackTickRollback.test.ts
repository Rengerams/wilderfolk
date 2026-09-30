/**
 * P-3 — the main-thread fallback has to fail the way the worker fails.
 *
 * The worker snapshots the mutable sim slices before its tick and restores them when `gameTick`
 * throws (`gameWorker.ts:307`, `:346-349`). The fallback ran `gameTick` bare, and a throw there is
 * not harmless: `gameTick` advances `state.tick` and runs all four layers *before* its own invariant
 * check, so every failed frame left one more partially-applied tick in the world — and because the
 * throw escaped `frameBody` into the frame-level swallow-and-continue handler, that frame's draw and
 * UI notify were skipped too, once per frame, with the failed step's time still in the accumulator.
 *
 * The injection is a module mock of `gameEngine.gameTick`, the only seam the loop's tick has; the
 * replacement mutates exactly like the real tick does before it throws, so the rollback assertion
 * below cannot pass by accident. No production code was weakened for this test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Season, WeatherType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { GameLoop } from '../src/game/gameLoop';
import { gameTick } from '../src/game/gameEngine';
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
  it('restores the pre-tick world and stops retrying when a fallback tick throws', () => {
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

    // Enough accumulated time for the full catch-up budget: 12 steps at 1× (1000 ms per tick).
    (loop as unknown as { tickAccumulator: number }).tickAccumulator = 12_000;
    const frameBody = (loop as unknown as { frameBody: (time: number) => void }).frameBody.bind(loop);

    frameBody(1000);
    frameBody(2000);
    frameBody(3000);

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
  });
});

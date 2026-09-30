/**
 * Bundled game-loop suites. Each `describe('<original file name>')` below carries one former test
 * file's body verbatim, with that file's own top-of-file doc comment kept directly above it.
 *
 * `gameLoop.fallbackTickRollback.test.ts` (hoisted `vi.mock('../src/game/gameEngine', …)`) and
 * `gameLoop.diagnostics.test.ts` (top-level `afterEach`) were deliberately NOT bundled: both calls
 * become file-wide in a single module and would change cross-file behaviour.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BASE_TICKS_PER_SECOND, GameLoop } from '../src/game/gameLoop';
import { initGame } from '../src/game/gameEngine';
import { createInitialView } from '../src/game/viewState';
import { applyWorkerCommand, WORKER_CMD_PROTO, type WorkerCommand } from '../src/game/simWorker/commands';
import {
  applySimTickDelta,
  simTickDeltaFromWorld,
  type SimTickDelta,
} from '../src/game/simBuffers/simDelta';
import { finishedBuilding, human } from '../src/test/factories';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { HOURS_PER_DAY } from '../src/game/gameConstants';

/**
 * GameLoop command transport — SIMULATION_AUTHORITY.md §5 worker invariants
 * + Objective 6.
 */
describe('gameLoop.commandDispatch.test.ts', () => {
  /** Renamed from `makeWorld` only so the bundled game-loop suites share one module scope; body unchanged. */
  function makeWorldForEntities(entities: Entity[], buildings: Building[]): WorldState {
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
      villageName: 'Loopville',
      villageReputation: 0,
      challenges: [],
      autoSave: false,
      wildlifeCounts: {
        grass: 0,
        rabbits: 0,
        deer: 0,
        wolves: 0,
        foxes: 0,
        werewolves: 0,
        wildkin: 0,
        trees: 0,
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

  async function settleLoop(loop: GameLoop): Promise<void> {
    (loop as unknown as { running: boolean }).running = true;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  function makeFakeHost(authoritative: WorldState) {
    let tickHandler:
      | ((w: WorldState, d: SimTickDelta | null, r: unknown, c: boolean) => void)
      | null = null;
    let cmdHandler:
      | ((w: WorldState, d: SimTickDelta | null, r: unknown, ok: boolean, reason?: string) => void)
      | null = null;
    let faultHandler:
      | ((source: 'tick' | 'command' | 'export' | 'general', message: string) => void)
      | null = null;

    return {
      host: {
        isReady: () => true,
        whenIdle: vi.fn(() => new Promise<void>(() => {})),
        sendCommand: vi.fn(() => Promise.resolve({ tick: 1 } as unknown as SimTickDelta)),
        getAuthoritativeWorld: () => authoritative,
        setTickResultHandler: (h: unknown) => {
          tickHandler = h as typeof tickHandler;
        },
        setCommandResultHandler: (h: unknown) => {
          cmdHandler = h as typeof cmdHandler;
        },
        setWorkerFaultHandler: (h: unknown) => {
          faultHandler = h as typeof faultHandler;
        },
      },
      fireTick: (w: WorldState) => tickHandler!(w, null, null, true),
      fireCommandResult: (w: WorldState, ok: boolean) => cmdHandler!(w, null, null, ok),
      fireFault: (source: 'tick' | 'command' | 'export' | 'general', message: string) =>
        faultHandler!(source, message),
    };
  }

  describe('GameLoop command transport', () => {
    it('dispatches to a permanently busy worker WITHOUT waiting for idle', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);

      const fakeHost = {
        isReady: () => true,
        whenIdle: vi.fn(() => new Promise<void>(() => {})),
        sendCommand: vi.fn(() => Promise.resolve({ tick: 1 } as unknown as SimTickDelta)),
        getAuthoritativeWorld: () => loop.getWorld(),
      };
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = fakeHost;

      const cmdObj: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };
      loop.applyCommand(cmdObj);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(fakeHost.whenIdle).not.toHaveBeenCalled();
      expect(fakeHost.sendCommand).toHaveBeenCalledWith(cmdObj);
    });

    it('applies the command OPTIMISTICALLY — instant UI feedback before any worker result', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const fake = makeFakeHost(structuredClone(world));
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

      const cmdObj: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };
      loop.applyCommand(cmdObj);

      const priest = loop.getWorld().entities.find((e) => e.id === 1)!;
      expect(priest.homeBuildingId).toBe(4);
      expect(loop.getWorld().buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(fake.host.sendCommand).toHaveBeenCalledWith(cmdObj);
    });

    it('tick results do NOT overwrite the optimistic display; the authoritative result replaces it', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const fake = makeFakeHost(structuredClone(world));
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

      loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 });

      fake.fireTick(structuredClone(world));
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBe(4);

      const authoritative = structuredClone(world);
      authoritative.entities.find((e) => e.id === 1)!.homeBuildingId = 4;
      authoritative.buildings.find((b) => b.id === 4)!.occupants = [1];
      fake.fireCommandResult(authoritative, true);
      expect(loop.getWorld()).toBe(authoritative);
    });

    it('keeps authoritative Tavern and Hotel hours after worker reconciliation', async () => {
      const world = initGame({ villageName: 'WorkerVenueResult', size: 'medium' });
      const workerAfterTavern = applyWorkerCommand(structuredClone(world), {
        proto: WORKER_CMD_PROTO,
        op: 'setVenueSchedule',
        venue: 'tavern',
        startHour: 12,
        endHour: 20,
      });
      const workerAfterBoth = applyWorkerCommand(workerAfterTavern, {
        proto: WORKER_CMD_PROTO,
        op: 'setVenueSchedule',
        venue: 'hotel',
        startHour: 8,
        endHour: 18,
      });
      const hostAfterWorkerResult = structuredClone(world);
      applySimTickDelta(hostAfterWorkerResult, simTickDeltaFromWorld(workerAfterBoth));

      const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);
      await settleLoop(loop);
      const fake = makeFakeHost(hostAfterWorkerResult);
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

      loop.applyCommand({
        proto: WORKER_CMD_PROTO,
        op: 'setVenueSchedule',
        venue: 'tavern',
        startHour: 12,
        endHour: 20,
      });
      loop.applyCommand({
        proto: WORKER_CMD_PROTO,
        op: 'setVenueSchedule',
        venue: 'hotel',
        startHour: 8,
        endHour: 18,
      });
      expect(loop.getWorld().tavernSchedule).toEqual({ startHour: 12, endHour: 20 });
      expect(loop.getWorld().hotelSchedule).toEqual({ startHour: 8, endHour: 18 });

      fake.fireCommandResult(hostAfterWorkerResult, true);
      expect(loop.getWorld().tavernSchedule).toEqual({ startHour: 12, endHour: 20 });
      expect(loop.getWorld().hotelSchedule).toEqual({ startHour: 8, endHour: 18 });

      fake.fireTick(hostAfterWorkerResult);
      expect(loop.getWorld().tavernSchedule).toEqual({ startHour: 12, endHour: 20 });
      expect(loop.getWorld().hotelSchedule).toEqual({ startHour: 8, endHour: 18 });
    });

    it('reverts to the authoritative world when the worker rejects the command', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const authoritative = structuredClone(world);
      const fake = makeFakeHost(authoritative);
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

      loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 });
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBe(4);

      fake.fireCommandResult(authoritative, false);
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBeUndefined();
    });

    it('main-thread fallback applies the same domain implementation as the worker', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      expect(loop.isUsingSimWorker()).toBe(false);

      const cmdObj: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };
      loop.applyCommand(cmdObj);

      const viaLoop = loop.getWorld();
      const viaDirect = applyWorkerCommand(structuredClone(world), cmdObj);
      const priestLoop = viaLoop.entities.find((e) => e.id === 1)!;
      const priestDirect = viaDirect.entities.find((e) => e.id === 1)!;

      expect(priestLoop.homeBuildingId).toBe(4);
      expect(priestDirect.homeBuildingId).toBe(4);
      expect(viaLoop.buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);
      expect(viaDirect.buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);
    });

    it('uses the venue schedule owner in the main-thread fallback', async () => {
      const world = initGame({ villageName: 'FallbackVenueHours', size: 'medium' });
      const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);
      await settleLoop(loop);
      expect(loop.isUsingSimWorker()).toBe(false);

      loop.applyCommand({
        proto: WORKER_CMD_PROTO,
        op: 'setVenueSchedule',
        venue: 'tavern',
        startHour: 12,
        endHour: 20,
      });
      loop.applyCommand({
        proto: WORKER_CMD_PROTO,
        op: 'setVenueSchedule',
        venue: 'hotel',
        startHour: 8,
        endHour: 18,
      });

      expect(loop.getWorld().tavernSchedule).toEqual({ startHour: 12, endHour: 20 });
      expect(loop.getWorld().hotelSchedule).toEqual({ startHour: 8, endHour: 18 });
    });

    it('reverts an optimistic command before disposing a stalled worker', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const authoritative = structuredClone(world);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);

      const fakeHost = {
        isReady: () => true,
        hasTickInFlight: () => true,
        canPipelineTick: () => false,
        setPaused: vi.fn(),
        getAuthoritativeWorld: () => authoritative,
        dispose: vi.fn(),
      };

      (loop as unknown as { world: WorldState }).world = applyWorkerCommand(structuredClone(world), {
        proto: WORKER_CMD_PROTO,
        op: 'assignWorker',
        buildingId: 4,
        humanId: 1,
      });
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerBooting: boolean }).workerBooting = false;
      (loop as unknown as { workerHost: unknown }).workerHost = fakeHost;
      (loop as unknown as { running: boolean }).running = true;
      (loop as unknown as { lastWorkerActivity: number }).lastWorkerActivity = 0;

      const now = vi.spyOn(performance, 'now').mockReturnValue(15000);
      const raf = vi.fn(() => 1);
      vi.stubGlobal('requestAnimationFrame', raf);

      try {
        (loop as unknown as { frame: (time: number) => void }).frame(1000);
        expect(fakeHost.dispose).toHaveBeenCalledOnce();
        expect((loop as unknown as { workerHost: unknown }).workerHost).toBeNull();
        expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBeUndefined();
        expect(loop.getWorld().buildings.find((b) => b.id === 4)!.occupants).toEqual([]);
      } finally {
        now.mockRestore();
        vi.unstubAllGlobals();
      }
    });

    it('falls back immediately on a worker tick fault and restores authoritative state', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const authoritative = structuredClone(world);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const fake = makeFakeHost(authoritative);
      const dispose = vi.fn();
      const host = { ...fake.host, dispose };
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

      loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 });
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBe(4);

      fake.fireFault('tick', 'simulated tick failure');

      expect(dispose).toHaveBeenCalledOnce();
      expect((loop as unknown as { workerHost: unknown }).workerHost).toBeNull();
      expect(loop.isUsingSimWorker()).toBe(false);
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBeUndefined();
      expect(loop.getWorld().buildings.find((b) => b.id === 4)!.occupants).toEqual([]);
    });

    it('clears stale building selection after a demolish command', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(2, BuildingType.Farm, { occupants: [1] })]);
      const view = createInitialView(400, 300);
      view.selectedBuildingId = 2;
      const loop = new GameLoop(world, view, () => null);
      await settleLoop(loop);

      loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'demolishBuilding', buildingId: 2 });

      expect(loop.getView().selectedBuildingId).toBeNull();
      expect(loop.getWorld().buildings.some((b) => b.id === 2)).toBe(false);
    });
  });
});

/**
 * `GameLoop.exportAuthoritativeWorld` — the save path versus the display world.
 *
 * `workerHost.exportSave()` resolves to the worker's **clone** of the world. The loop used to adopt
 * that clone as `this.world`, which silently replaced the display world's identity mid-session while
 * `GameWorkerHost.getAuthoritativeWorld()` kept returning its own long-lived `worldRef`. Two things
 * followed from the split:
 *
 *  - the adopted clone carries the worker's `paused`/`speed`/dismissed-id sets, which
 *    `applySimTickDelta` never writes, so adopting it could flip the display back;
 *  - and from then on, every tick result replaced the display world from `worldRef` regardless.
 *
 * The save must read the authority without becoming it: `exportAuthoritativeWorld` returns the
 * export for the caller to persist and leaves `this.world` exactly as the display left it.
 */
describe('gameLoop.exportAuthority.test.ts', () => {
  /** A host that is ready and hands back a world the caller controls. */
  function fakeHostReturning(exported: WorldState) {
    return {
      isReady: () => true,
      whenIdle: () => Promise.resolve(),
      exportSave: vi.fn(() => Promise.resolve(exported)),
      getAuthoritativeWorld: () => exported,
      setTickResultHandler: () => {},
      setCommandResultHandler: () => {},
      setWorkerFaultHandler: () => {},
    };
  }

  /**
   * A loop wired to a fake worker. `GameLoop`'s constructor decides worker-vs-main-thread from the
   * environment, so the two fields are set directly — this is the test seam the other `gameLoop` suites
   * use too.
   */
  function loopWithWorker(display: WorldState, exported: WorldState): GameLoop {
    const loop = new GameLoop(display, createInitialView(display.width, display.height), () => null);
    const internals = loop as unknown as { workerEnabled: boolean; workerHost: unknown };
    internals.workerEnabled = true;
    internals.workerHost = fakeHostReturning(exported);
    return loop;
  }

  describe('the save export does not become the display world', () => {
    it('leaves the display world object untouched', async () => {
      const display = initGame({ villageName: 'Display', seed: 20260925 });
      // The display is paused and slowed; the export is a different object with different values.
      display.paused = true;
      display.speed = 5;
      const exported = initGame({ villageName: 'Export', seed: 20260925 });
      exported.paused = false;
      exported.speed = 1;

      const loop = loopWithWorker(display, exported);
      const returned = await loop.exportAuthoritativeWorld(1_000);

      // The caller persists what came back…
      expect(returned.paused).toBe(false);
      // …and the loop is still showing the world the player is looking at.
      expect(loop.getWorld()).toBe(display);
      expect(loop.getWorld().paused).toBe(true);
      expect(loop.getWorld().speed).toBe(5);
    });

    it('keeps the display world after a subsequent tick result', async () => {
      const display = initGame({ villageName: 'Display', seed: 20260925 });
      display.paused = true;
      const exported = initGame({ villageName: 'Export', seed: 20260925 });
      exported.paused = false;

      const loop = loopWithWorker(display, exported);
      await loop.exportAuthoritativeWorld(1_000);

      // A tick result for a world that is *not* the display object lands next.
      const next = initGame({ villageName: 'Next', seed: 20260926 });
      next.paused = false;
      (
        loop as unknown as {
          workerHost: { setTickResultHandler: unknown };
          registerWorkerHandlers: (gen: number) => void;
        }
      ).registerWorkerHandlers(0);

      expect(loop.getWorld().paused).toBe(true);
    });

    it('still reports the export as the authoritative read', async () => {
      const display = initGame({ villageName: 'Display', seed: 20260925 });
      const exported = initGame({ villageName: 'Export', seed: 20260925 });
      exported.villageName = 'Authoritative Name';

      const loop = loopWithWorker(display, exported);
      const returned = await loop.exportAuthoritativeWorld(1_000);

      expect(returned.villageName).toBe('Authoritative Name');
    });

    it('falls back to the main shadow when the export fails', async () => {
      const display = initGame({ villageName: 'Display', seed: 20260925 });
      const loop = new GameLoop(display, createInitialView(display.width, display.height), () => null);
      const internals = loop as unknown as { workerEnabled: boolean; workerHost: unknown };
      internals.workerEnabled = true;
      internals.workerHost = {
        isReady: () => true,
        whenIdle: () => Promise.resolve(),
        exportSave: () => Promise.reject(new Error('nope')),
        getAuthoritativeWorld: () => display,
        setTickResultHandler: () => {},
        setCommandResultHandler: () => {},
        setWorkerFaultHandler: () => {},
      };

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const returned = await loop.exportAuthoritativeWorld(1_000);
      warn.mockRestore();

      expect(returned).toBe(display);
    });
  });
});

/**
 * Baseline pacing contract: one in-game day is 72 real seconds at 1×.
 *
 * The in-game time *grid* is `HOURS_PER_DAY (24) × TICKS_PER_HOUR (3) = 72 ticks/day`; the *pace* is
 * one simulation tick per real second, so an in-game hour is 3 real seconds and a day is 72 real
 * seconds (0.5× ≈ 144 s, 2× ≈ 36 s, 10× ≈ 7.2 s). `BASE_TICKS_PER_SECOND` is the only thing feeding
 * `msPerTick = 1000 / (BASE_TICKS_PER_SECOND * world.speed)` in `GameLoop.frame()`.
 *
 * It carries no test of its own in general, and that absence cost a 2× pacing regression: the
 * constant was silently reverted to `3` (24 s/day) while its doc comment, the `CHANGELOG` and four
 * modules all kept stating 48 s — see
 * `BUG_REPORTS/2026-09-16-baseline-pacing-reverted-to-24s-day.md`. This file makes both the pace and
 * the harness copies of it observable, so a change fails a test instead of only going stale in prose.
 */
describe('gameLoop.pacingContract.test.ts', () => {
  /** Real milliseconds for one in-game day at a given speed multiplier (the scheduler's own formula). */
  function msPerDay(speed: number): number {
    const msPerTick = 1000 / (BASE_TICKS_PER_SECOND * speed);
    return msPerTick * TICKS_PER_DAY;
  }

  /**
   * Scripts that legitimately hold their own copy of the rate (they must not import the app loop).
   *
   * `scripts/perf-all.ts` was removed as dead tooling during the 2026-09-20 audit campaign: nothing
   * referenced it, no npm script targeted it, and its two `gameTick(state, FULL_SIM ? undefined : state)`
   * calls passed a `WorldState` where a `SimulationFocus` belongs. `scripts/sim-profiles.mjs` and
   * `scripts/balance-militia.ts` went with it (the latter's only referrer was the former). Listed here
   * because a harness copy is deliberate — an absent file is a maintained list that went stale.
   */
  const HARNESS_COPIES = ['scripts/test.ts', 'scripts/probe-day-budget.mts'];

  describe('baseline pacing contract', () => {
    it('runs one in-game day every 72 real seconds at 1×', () => {
      expect(BASE_TICKS_PER_SECOND).toBe(1);
      expect(msPerDay(1)).toBeCloseTo(72_000, 6);
    });

    it('gives one in-game hour every three real seconds, on a 24 × 3 = 72 tick day', () => {
      expect(TICKS_PER_DAY).toBe(HOURS_PER_DAY * TICKS_PER_HOUR);
      expect(TICKS_PER_HOUR / BASE_TICKS_PER_SECOND).toBe(3);
    });

    it('scales with the speed multipliers', () => {
      expect(msPerDay(0.5)).toBeCloseTo(144_000, 6);
      expect(msPerDay(2)).toBeCloseTo(36_000, 6);
      expect(msPerDay(10)).toBeCloseTo(7_200, 6);
    });

    it('advances a little over one in-game hour per four real seconds of the HUD liveness window', () => {
      // The browser tier compares the HUD clock text across a 4 000 ms window (`scripts/browser-smoke.mjs`),
      // which is how the 24 s/day rate was caught: it advanced four in-game hours in four seconds, and the
      // 48 s/day rate advanced two. At 1 tick/s the same window is four ticks — the clock must move, and
      // must not have swept a day.
      const ticksPerWindow = (4000 / 1000) * BASE_TICKS_PER_SECOND;
      expect(ticksPerWindow).toBeCloseTo(4, 9);
      expect(ticksPerWindow).toBeLessThan(TICKS_PER_DAY);
      expect(ticksPerWindow / TICKS_PER_HOUR).toBeGreaterThan(1);
    });

    it('keeps the harness copies of the rate in sync', () => {
      for (const file of HARNESS_COPIES) {
        const src = readFileSync(resolve(process.cwd(), file), 'utf8');
        const match = /const BASE_TICKS_PER_SECOND = ([0-9.]+);/.exec(src);
        const rate = match ? Number(match[1]) : Number.NaN;
        expect(rate, `${file} drifted from gameLoop.BASE_TICKS_PER_SECOND`).toBe(BASE_TICKS_PER_SECOND);
      }
    });
  });
});

/**
 * F1 of the 2026-09-16 worker-boundary audit (`docs/private/audits/2026-09-16/game-worker.md`):
 *
 * `GameLoop.adoptWorldSession()` raised `workerBooting` and then queued the import chain, whose
 * first statement polled that same flag while being **the only** code that clears it — so loading a
 * save (or any in-game session swap) on a live worker loop never posted the import, never ticked on
 * either path, and deferred every player command forever. The chain now waits on the host handshake
 * (`GameWorkerHost.whenReady()`), which no caller owns.
 */
describe('gameLoop.sessionSwapWorker.test.ts', () => {
  /** Renamed from `human` only so the bundled game-loop suites share one module scope; body unchanged. */
  function humanEntity(id: number): Entity {
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
      maxAge: 90,
      reproductionCooldown: 0,
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
      job: JobType.Settler,
    };
  }

  /** Renamed from `makeWorld` only so the bundled game-loop suites share one module scope; body unchanged. */
  function makeWorldSessionSwap(): WorldState {
    const church: Building = {
      id: 4,
      type: BuildingType.Church,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };
    return {
      entities: [humanEntity(1)],
      buildings: [church],
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
      villageName: 'Loopville',
      villageReputation: 0,
      autoSave: false,
      visitorGroups: [],
      rivalSettlements: [],
      pendingDiplomacyEvents: [],
      pendingRaidEvents: [],
      pendingOutgoingRaidEvents: [],
      electionCeremony: null,
    } as unknown as WorldState;
  }

  /** Minimal stand-in for `GameWorkerHost` — only the surface the import chain touches. */
  function fakeHost(readyInitially = true) {
    let ready = readyInitially;
    const readyWaiters: Array<() => void> = [];
    return {
      isReady: () => ready,
      whenReady: () => (ready ? Promise.resolve() : new Promise<void>((resolve) => readyWaiters.push(resolve))),
      whenIdle: () => Promise.resolve(),
      importSave: vi.fn(() => Promise.resolve()),
      dispose: vi.fn(),
      setTickResultHandler: () => {},
      setCommandResultHandler: () => {},
      setWorkerFaultHandler: () => {},
      becomeReady(): void {
        ready = true;
        for (const wake of readyWaiters.splice(0)) wake();
      },
    };
  }

  function liveLoop(host: ReturnType<typeof fakeHost>): GameLoop {
    const loop = new GameLoop(makeWorldSessionSwap(), createInitialView(400, 300), () => null);
    const internals = loop as unknown as { running: boolean; workerEnabled: boolean; workerHost: unknown; workerBooting: boolean };
    internals.running = true;
    internals.workerEnabled = true;
    internals.workerHost = host;
    return loop;
  }

  describe('session swap on a live worker (F1)', () => {
    it('posts the import instead of waiting on the flag it would have to clear itself', async () => {
      const host = fakeHost();
      const loop = liveLoop(host);
      const internals = loop as unknown as { workerBooting: boolean };

      loop.setSession(makeWorldSessionSwap(), createInitialView(400, 300));
      // Held while the swap is in flight: the worker is not yet authoritative for the new session.
      expect(internals.workerBooting).toBe(true);

      await vi.waitFor(() => expect(host.importSave).toHaveBeenCalledTimes(1));
      expect(internals.workerBooting).toBe(false);
    });

    it('still waits for a booting worker before importing the new session', async () => {
      const host = fakeHost(false);
      const loop = liveLoop(host);

      loop.setSession(makeWorldSessionSwap(), createInitialView(400, 300));
      await Promise.resolve();
      expect(host.importSave).not.toHaveBeenCalled();

      host.becomeReady();
      await vi.waitFor(() => expect(host.importSave).toHaveBeenCalledTimes(1));
    });

    it('clears the boot flag even when the loop stops before the import lands', async () => {
      const host = fakeHost(false);
      const loop = liveLoop(host);
      const internals = loop as unknown as { running: boolean; workerBooting: boolean };

      loop.setSession(makeWorldSessionSwap(), createInitialView(400, 300));
      internals.running = false;
      host.becomeReady();

      await vi.waitFor(() => expect(internals.workerBooting).toBe(false));
      expect(host.importSave).not.toHaveBeenCalled();
    });
  });
});

/**
 * Player speed / pause controls must survive an authoritative snapshot rebuild.
 *
 * `speed` and `paused` live inside WorldState (so the worker's `gameTick` can
 * early-return while paused and so prep/sync round-trips stay coherent), but the
 * player authors them on the main thread. `GameLoop.rebuildOptimisticDisplay()`
 * replaces the display world with a deep clone of the worker's LAST RECEIVED
 * snapshot, and that snapshot can predate the player's click because the
 * `setSpeed` / `setPaused` message is still in flight. Without a carry-over the
 * chosen speed silently reverts on the next command — and `mutateWorld` only
 * forwards speed when it changes, so nothing ever resends it.
 */
describe('gameLoop.speedControl.test.ts', () => {
  function building(id: number, type: BuildingType): Building {
    return {
      id,
      type,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    } as Building;
  }

  /** Renamed from `makeWorld` only so the bundled game-loop suites share one module scope; body unchanged. */
  function makeWorldSpeed(): WorldState {
    return {
      entities: [human(1)],
      buildings: [building(4, BuildingType.Church)],
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

  /**
   * A loop wired to a fake worker whose authoritative snapshot still carries the
   * OLD speed/pause values — i.e. the message with the player's new choice has not
   * been processed yet.
   */
  async function loopWithStaleSnapshot(snapshot: WorldState) {
    const world = makeWorldSpeed();
    const loop = new GameLoop(world, createInitialView(400, 300), () => null);
    (loop as unknown as { running: boolean }).running = true;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const host = {
      isReady: () => true,
      whenIdle: vi.fn(() => new Promise<void>(() => {})),
      sendCommand: vi.fn(() => Promise.resolve({ tick: 1 } as unknown as SimTickDelta)),
      getAuthoritativeWorld: () => snapshot,
      setSpeed: vi.fn(),
      setPaused: vi.fn(),
      patchUiState: vi.fn(),
      setTickResultHandler: () => {},
      setCommandResultHandler: () => {},
      setWorkerFaultHandler: () => {},
    };
    (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
    (loop as unknown as { workerHost: unknown }).workerHost = host;
    return { loop, host };
  }

  const ASSIGN: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };

  describe('player speed and pause controls survive a snapshot rebuild', () => {
    it('keeps the chosen speed when a command rebuilds the optimistic display', async () => {
      const snapshot = makeWorldSpeed(); // worker copy still at 1×
      const { loop, host } = await loopWithStaleSnapshot(snapshot);

      loop.mutateWorld((w) => { w.speed = 5; });
      expect(loop.getWorld().speed).toBe(5);
      expect(host.setSpeed).toHaveBeenCalledWith(5);

      loop.applyCommand(ASSIGN);

      expect(loop.getWorld().speed).toBe(5);
    });

    it('keeps the pause state when a command rebuilds the optimistic display', async () => {
      const snapshot = makeWorldSpeed();
      const { loop, host } = await loopWithStaleSnapshot(snapshot);

      loop.mutateWorld((w) => { w.paused = true; });
      expect(loop.getWorld().paused).toBe(true);
      expect(host.setPaused).toHaveBeenCalledWith(true);

      loop.applyCommand(ASSIGN);

      expect(loop.getWorld().paused).toBe(true);
    });

    it('still takes authoritative simulation state from the snapshot', async () => {
      const snapshot = makeWorldSpeed();
      snapshot.tick = 999;
      snapshot.resources.food = 42;
      const { loop } = await loopWithStaleSnapshot(snapshot);

      loop.mutateWorld((w) => { w.speed = 3; });
      loop.applyCommand(ASSIGN);

      // The carry-over is exactly speed + paused; nothing else is preserved.
      expect(loop.getWorld().tick).toBe(999);
      expect(loop.getWorld().resources.food).toBe(42);
      expect(loop.getWorld().speed).toBe(3);
    });

    it('notifies subscribers when the player pauses, although the tick does not advance', async () => {
      // The pause control lives in the header and reads `world.paused`, and the world is mutated in
      // place — so the ONLY thing that can repaint it is a subscriber notification. `notify` dedupes on
      // the tick, and a pause never advances it: the sim froze while the button still read "Pause
      // simulation" and the ⏸ banner never appeared (P6 browser pass, 2026-09-20).
      const snapshot = makeWorldSpeed();
      const { loop } = await loopWithStaleSnapshot(snapshot);
      const notifications: Array<{ tick: number; paused: boolean }> = [];
      loop.subscribe((world) => { notifications.push({ tick: world.tick, paused: world.paused }); });
      const tickBefore = loop.getWorld().tick;

      loop.mutateWorld((w) => { w.paused = true; });

      expect(notifications.length, 'pausing must notify subscribers').toBeGreaterThan(0);
      expect(notifications[notifications.length - 1]?.paused).toBe(true);
      // The tick really did stand still — which is exactly why the notification has to be forced.
      expect(loop.getWorld().tick).toBe(tickBefore);
    });
  });
});

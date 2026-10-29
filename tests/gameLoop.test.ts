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
        sendCommand: vi.fn((_cmd: WorkerCommand) => Promise.resolve({ tick: 1 } as unknown as SimTickDelta)),
        getAuthoritativeWorld: () => authoritative,
        getPerformanceSnapshot: () => null,
        getLastCompletedTickLatencyMs: () => null,
        dispose: vi.fn(),
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
    it('does not dispatch a command while a worker is permanently busy', async () => {
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

      expect(fakeHost.whenIdle).toHaveBeenCalled();
      expect(fakeHost.sendCommand).not.toHaveBeenCalled();
    });

    it('applies the command OPTIMISTICALLY — instant UI feedback before any worker result', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const fake = makeFakeHost(structuredClone(world));
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);
      fake.host.whenIdle.mockResolvedValue(undefined);

      const cmdObj: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };
      loop.applyCommand(cmdObj);

      const priest = loop.getWorld().entities.find((e) => e.id === 1)!;
      expect(priest.workerBuildingId).toBe(4);
      expect(loop.getWorld().buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(fake.host.sendCommand).toHaveBeenCalledWith(cmdObj);
    });

    it('drains tick requests before a queued command instead of starving it', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      world.speed = 5;
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const fake = makeFakeHost(structuredClone(world));
      const requestTick = vi.fn(() => true);
      Object.assign(fake.host, {
        canPipelineTick: () => true,
        hasTickInFlight: () => false,
        requestTick,
        setPaused: vi.fn(),
      });
      const internals = loop as unknown as {
        workerEnabled: boolean; workerHost: unknown; lastFrameTime: number;
        tickAccumulator: number; lastWorkerActivity: number; frameBody: (time: number) => void;
      };
      internals.workerEnabled = true;
      internals.workerHost = fake.host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);
      internals.lastFrameTime = 1000;
      internals.tickAccumulator = 500;
      internals.lastWorkerActivity = performance.now();
      loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' });
      internals.frameBody(1100);
      expect(requestTick).not.toHaveBeenCalled();
      fake.fireCommandResult(world, true);
      internals.frameBody(1200);
      expect(requestTick).toHaveBeenCalled();
    });

    it('interpolates acknowledged worker motion without using the request-side accumulator', async () => {
      const world = makeWorldForEntities([human(1)], []);
      world.speed = 5;
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const fake = makeFakeHost(world);
      Object.assign(fake.host, {
        canPipelineTick: () => false,
        hasTickInFlight: () => false,
        setPaused: vi.fn(),
      });
      const internals = loop as unknown as {
        workerEnabled: boolean; workerBooting: boolean; workerHost: unknown;
        lastFrameTime: number; tickFraction: number;
        lastWorkerPresentation: { tick: number; at: number } | null;
        frameBody: (time: number) => void;
      };
      internals.workerEnabled = true;
      internals.workerBooting = false;
      internals.workerHost = fake.host;
      internals.lastFrameTime = 1000;
      (loop as unknown as { registerWorkerHandlers: () => void }).registerWorkerHandlers();

      let now = 1000;
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
      try {
        internals.frameBody(1010);
        expect(internals.tickFraction, 'no worker result is confirmed').toBe(1);

        // The host mutates the same world object before calling the tick callback.
        world.tick = 1;
        now = 1020;
        fake.fireTick(world);
        internals.frameBody(1020);
        expect(internals.tickFraction).toBe(0);

        now = 1120;
        internals.frameBody(1120);
        expect(internals.tickFraction).toBeCloseTo(0.5);

        // A command refresh at the same tick must not restart the motion interval.
        now = 1200;
        fake.fireCommandResult(world, true);
        internals.frameBody(1200);
        expect(internals.tickFraction).toBeCloseTo(0.9);

        world.tick = 2;
        now = 1220;
        fake.fireTick(world);
        now = 1270;
        internals.frameBody(1270);
        expect(internals.tickFraction).toBeCloseTo(0.25);

        world.paused = true;
        now = 1280;
        internals.frameBody(1280);
        expect(internals.tickFraction).toBe(1);
        expect(internals.lastWorkerPresentation).toBeNull();

        world.paused = false;
        now = 1290;
        internals.frameBody(1290);
        expect(internals.tickFraction, 'resume must not replay the pre-pause position').toBe(1);

        world.tick = 3;
        now = 1300;
        fake.fireTick(world);
        now = 1350;
        internals.frameBody(1350);
        expect(internals.tickFraction).toBeCloseTo(0.25);
      } finally {
        clock.mockRestore();
        loop.stop();
      }
    });

    it('defers player commands during worker recovery and applies them when recovery ends', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const internals = loop as unknown as {
        workerRecoveryTimer: ReturnType<typeof setTimeout> | null; flushDeferredWorkerCommands: () => void;
      };
      const timer = setTimeout(() => {}, 60_000);
      internals.workerRecoveryTimer = timer;
      try {
        loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' });
        expect(loop.getWorld().entities[0].workerBuildingId).toBeUndefined();
        clearTimeout(timer);
        internals.workerRecoveryTimer = null;
        internals.flushDeferredWorkerCommands();
        expect(loop.getWorld().entities[0].workerBuildingId).toBe(4);
      } finally {
        clearTimeout(timer);
        internals.workerRecoveryTimer = null;
      }
    });

    it('retains unconfirmed demolitions through worker restart without duplicate replay', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(2, BuildingType.Farm), finishedBuilding(3, BuildingType.Quarry)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const first = makeFakeHost(structuredClone(world));
      let releaseOldWait!: () => void;
      first.host.whenIdle.mockReturnValue(new Promise<void>((resolve) => { releaseOldWait = resolve; }));
      const internals = loop as unknown as {
        workerEnabled: boolean; workerHost: unknown; workerRecoveryTimer: ReturnType<typeof setTimeout> | null;
        registerWorkerHandlers: (g: number) => void; flushDeferredWorkerCommands: () => void;
        deferredWorkerCommands: Array<{ cmd: WorkerCommand }>; commandChain: Promise<void>;
      };
      internals.workerEnabled = true;
      internals.workerHost = first.host;
      internals.registerWorkerHandlers(0);
      const cmd: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'demolishBuilding', buildingId: 2 };
      const secondCmd: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'demolishBuilding', buildingId: 3 };
      loop.applyCommand(cmd);
      loop.applyCommand(secondCmd);
      const staleChain = internals.commandChain;
      await Promise.resolve();
      vi.stubGlobal('Worker', class {});
      try {
        first.fireFault('tick', 'simulated stall');
        expect(loop.getWorld().buildings.some((building) => building.id === 2)).toBe(true);
        expect(internals.deferredWorkerCommands.map((entry) => entry.cmd)).toEqual([cmd, secondCmd]);
        if (internals.workerRecoveryTimer) clearTimeout(internals.workerRecoveryTimer);
        internals.workerRecoveryTimer = null;
        let recoveredWorld = structuredClone(world);
        const recovered = makeFakeHost(recoveredWorld);
        recovered.host.getAuthoritativeWorld = () => recoveredWorld;
        recovered.host.whenIdle.mockResolvedValue(undefined);
        recovered.host.sendCommand.mockImplementation((command) => {
          const result = applyWorkerCommand(recoveredWorld, command);
          recoveredWorld = result;
          recovered.fireCommandResult(result, true);
          return Promise.resolve(simTickDeltaFromWorld(result));
        });
        internals.workerEnabled = true;
        internals.workerHost = recovered.host;
        internals.registerWorkerHandlers(0);
        internals.flushDeferredWorkerCommands();
        releaseOldWait();
        await Promise.all([staleChain, internals.commandChain]);
        expect(loop.getWorld().buildings.some((building) => building.id === 2)).toBe(false);
        expect(loop.getWorld().buildings.some((building) => building.id === 3)).toBe(false);
        expect(recovered.host.sendCommand).toHaveBeenCalledTimes(2);
        expect(first.host.sendCommand).not.toHaveBeenCalled();
      } finally {
        loop.stop();
        vi.unstubAllGlobals();
      }
    });

    it('waits for the worker before running colony-wide staffing commands', async () => {
      const world = makeWorldForEntities([human(1)], [finishedBuilding(4, BuildingType.Church)]);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);
      const authoritative = structuredClone(world);
      const fake = makeFakeHost(authoritative);
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
      (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);
      const command: WorkerCommand = { proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' };
      loop.applyCommand(command);
      expect(loop.getWorld().entities.find((entity) => entity.id === 1)!.workerBuildingId).toBeUndefined();
      expect(authoritative.buildings[0].occupants).toEqual([]);
      const result = applyWorkerCommand(structuredClone(authoritative), command);
      fake.fireCommandResult(result, true);
      expect(loop.getWorld().entities.find((entity) => entity.id === 1)!.workerBuildingId).toBe(4);
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
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.workerBuildingId).toBe(4);

      const authoritative = structuredClone(world);
      authoritative.entities.find((e) => e.id === 1)!.workerBuildingId = 4;
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
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.workerBuildingId).toBe(4);

      fake.fireCommandResult(authoritative, false);
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.workerBuildingId).toBeUndefined();
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

      expect(priestLoop.workerBuildingId).toBe(4);
      expect(priestDirect.workerBuildingId).toBe(4);
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
        expect(loop.getWorld().entities.find((e) => e.id === 1)!.workerBuildingId).toBeUndefined();
        expect(loop.getWorld().buildings.find((b) => b.id === 4)!.occupants).toEqual([]);
      } finally {
        now.mockRestore();
        vi.unstubAllGlobals();
      }
    });

    it('does not read a long pause as worker silence when ticking resumes', async () => {
      const world = makeWorldForEntities([human(1)], []);
      const loop = new GameLoop(world, createInitialView(400, 300), () => null);
      await settleLoop(loop);

      // A pause posts no tick, so `lastWorkerActivity` ages for the whole pause. The resume posts the
      // first tick; a worker that answers it is healthy and must not be torn down by the stale clock.
      let ticksInFlight = 0;
      const dispose = vi.fn();
      const fakeHost = {
        isReady: () => true,
        hasTickInFlight: () => ticksInFlight > 0,
        canPipelineTick: () => true,
        requestTick: () => {
          ticksInFlight++;
          return true;
        },
        setPaused: vi.fn(),
        getAuthoritativeWorld: () => world,
        dispose,
      };

      world.speed = 10;
      (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
      (loop as unknown as { workerBooting: boolean }).workerBooting = false;
      (loop as unknown as { workerHost: unknown }).workerHost = fakeHost;
      (loop as unknown as { lastPausedSentToWorker: boolean }).lastPausedSentToWorker = true;
      (loop as unknown as { lastWorkerActivity: number }).lastWorkerActivity = 0;

      const now = vi.spyOn(performance, 'now').mockReturnValue(15_000);
      vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));

      try {
        const frame = (loop as unknown as { frame: (time: number) => void }).frame;
        frame(1_000); // primes the frame clock; a paused loop posted nothing
        expect(fakeHost.setPaused).toHaveBeenCalledWith(false);

        frame(1_100);
        expect(ticksInFlight, 'the resume posted a tick').toBeGreaterThan(0);

        frame(1_200);
        expect(dispose, 'a 15 s pause was read as worker silence').not.toHaveBeenCalled();
        expect((loop as unknown as { workerHost: unknown }).workerHost).toBe(fakeHost);
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
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.workerBuildingId).toBe(4);

      fake.fireFault('tick', 'simulated tick failure');

      expect(dispose).toHaveBeenCalledOnce();
      expect((loop as unknown as { workerHost: unknown }).workerHost).toBeNull();
      expect(loop.isUsingSimWorker()).toBe(false);
      expect(loop.getWorld().entities.find((e) => e.id === 1)!.workerBuildingId).toBeUndefined();
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
      getPerformanceSnapshot: () => null,
      dispose: vi.fn(),
      setTickResultHandler: () => {},
      setCommandResultHandler: () => {},
      setWorkerFaultHandler: () => {},
    };
  }
  /**
   * The worker surface the save path touches. `exportSave` is widened off the helper's `Mock` to a
   * plain function so a test can substitute one that only counts calls.
   */
  type FakeHost = Omit<ReturnType<typeof fakeHostReturning>, 'exportSave'> & {
    exportSave: () => Promise<WorldState>;
  };

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

    it('holds worker ticks until the authoritative save export completes', async () => {
      const display = initGame({ villageName: 'Save barrier', seed: 20261029 });
      display.speed = 10;
      display.paused = false;
      const loop = loopWithWorker(display, structuredClone(display));
      const internals = loop as unknown as {
        workerHost: ReturnType<typeof fakeHostReturning> & {
          hasTickInFlight: () => boolean;
          canPipelineTick: () => boolean;
          requestTick: () => boolean;
          setPaused: (paused: boolean) => void;
        };
        running: boolean;
        frame: (time: number) => void;
        saveExportPending: boolean;
      };
      let releaseIdle: () => void = () => {};
      const idle = new Promise<void>((resolve) => { releaseIdle = resolve; });
      const requestTick = vi.fn(() => true);
      internals.workerHost = {
        ...internals.workerHost,
        whenIdle: () => idle,
        hasTickInFlight: () => false,
        canPipelineTick: () => true,
        requestTick,
        setPaused: vi.fn(),
      };
      internals.running = true;
      vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
      try {
        const saving = loop.exportAuthoritativeWorld(1000);
        expect(internals.saveExportPending).toBe(true);
        internals.frame(1000);
        internals.frame(1200);
        expect(requestTick).not.toHaveBeenCalled();

        releaseIdle();
        await saving;
        expect(loop.lastExportWasDegraded()).toBe(false);
        expect(internals.saveExportPending).toBe(false);
        internals.frame(1300);
        expect(requestTick).toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('settles queued worker commands before taking a save snapshot', async () => {
      const display = initGame({ villageName: 'Queued command', seed: 20261029 });
      const loop = loopWithWorker(display, structuredClone(display));
      const internals = loop as unknown as {
        commandChain: Promise<void>;
        workerHost: ReturnType<typeof fakeHostReturning>;
      };
      let finishCommand: () => void = () => {};
      internals.commandChain = new Promise<void>((resolve) => { finishCommand = resolve; });
      const exportSave = internals.workerHost.exportSave;

      const saving = loop.exportAuthoritativeWorld(1000);
      await Promise.resolve();
      expect(exportSave).not.toHaveBeenCalled();
      finishCommand();
      await saving;
      expect(exportSave).toHaveBeenCalledOnce();
      expect(loop.lastExportWasDegraded()).toBe(false);
    });

    it('keeps saves degraded if the worker enters recovery before it confirms the world', async () => {
      const display = initGame({ villageName: 'Interrupted save', seed: 20261029 });
      const loop = loopWithWorker(display, structuredClone(display));
      const internals = loop as unknown as {
        workerHost: ReturnType<typeof fakeHostReturning> | null;
        workerEnabled: boolean;
      };
      let releaseIdle: () => void = () => {};
      internals.workerHost = {
        ...internals.workerHost!,
        whenIdle: () => new Promise<void>((resolve) => { releaseIdle = resolve; }),
      };
      const saving = loop.exportAuthoritativeWorld(1000);
      await Promise.resolve();
      internals.workerHost = null;
      internals.workerEnabled = false;
      releaseIdle();
      expect(await saving).toBe(display);
      expect(loop.lastExportWasDegraded()).toBe(true);
    });

    it('rejects a display-shadow save while worker recovery is pending', async () => {
      const display = initGame({ villageName: 'Recovery pending', seed: 20261029 });
      const loop = loopWithWorker(display, structuredClone(display));
      const internals = loop as unknown as {
        workerEnabled: boolean;
        workerHost: null;
        workerBooting: boolean;
      };
      internals.workerEnabled = false;
      internals.workerHost = null;
      internals.workerBooting = true;
      expect(await loop.exportAuthoritativeWorld(1000)).toBe(display);
      expect(loop.lastExportWasDegraded()).toBe(true);
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

    /**
     * A worker fault during the save window.
     *
     * `fallbackFromWorker` is reachable from the frame loop at any moment and replaces `workerHost`; it
     * does **not** bump `sessionGen`, which is all the post-await re-check used to test. A stall landing
     * while `whenIdle()` was pending therefore left the next line reading a host that was already gone —
     * in the field, `null`, which threw `TypeError: Cannot read properties of null (reading
     * 'exportSave')` into the catch below. The host is captured and identity-checked now, the shape
     * `queueWorkerImport` in the same file already used.
     *
     * The replacement host here is a *different live host*, not `null`, on purpose: the throw from a
     * `null` dereference is swallowed by that catch, so the pre-fix and post-fix paths would both return
     * the display world and the test could not tell them apart. With two hosts, the save either uses the
     * replacement's `exportSave` (pre-fix) or ignores it (post-fix) — and that is observable.
     */
    it('ignores a host that was replaced while the save waited', async () => {
      const display = initGame({ villageName: 'Display', seed: 20260925 });
      const exported = initGame({ villageName: 'Export', seed: 20260925 });
      const loop = loopWithWorker(display, exported);
      const internals = loop as unknown as {
        workerEnabled: boolean;
        workerHost: FakeHost | null;
      };

      const staleHost = internals.workerHost!;
      const calls = { whenIdle: 0, replacementExportSave: 0 };
      const replacement = {
        ...staleHost,
        isReady: () => true,
        exportSave: () => {
          calls.replacementExportSave++;
          return Promise.resolve(exported);
        },
      };
      // The captured host resolves `whenIdle()` only after the swap, so the replacement lands *inside*
      // the await — after the guard at the top of `exportAuthoritativeWorld` has already passed.
      internals.workerHost = {
        ...staleHost,
        whenIdle: () => {
          calls.whenIdle++;
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              internals.workerHost = replacement;
              resolve();
            }, 0);
          });
        },
      };

      const returned = await loop.exportAuthoritativeWorld(1_000);

      // The swap happened mid-await…
      expect(calls.whenIdle).toBe(1);
      // …and the save must not read the authority out of a host it did not start with.
      expect(calls.replacementExportSave).toBe(0);
      // A replaced host's world is not the authority: the display world is what gets persisted.
      expect(returned).toBe(display);
      expect(loop.getWorld()).toBe(display);
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
    it('runs one in-game day every 288 real seconds at 1×', () => {
      expect(BASE_TICKS_PER_SECOND).toBe(1);
      expect(msPerDay(1)).toBeCloseTo(288_000, 6);
    });

    it('gives one in-game hour every twelve real seconds, on a 24 × 12 = 288 tick day', () => {
      expect(TICKS_PER_DAY).toBe(HOURS_PER_DAY * TICKS_PER_HOUR);
      expect(TICKS_PER_HOUR / BASE_TICKS_PER_SECOND).toBe(12);
    });

    it('scales with the speed multipliers', () => {
      expect(msPerDay(0.5)).toBeCloseTo(576_000, 6);
      expect(msPerDay(2)).toBeCloseTo(144_000, 6);
      expect(msPerDay(10)).toBeCloseTo(28_800, 6);
    });

    it('advances part of an in-game hour per four real seconds of the HUD liveness window', () => {
      // The browser tier compares the HUD clock text across a 4 000 ms window (`scripts/browser-smoke.mjs`),
      // which is how the 24 s/day rate was caught: it advanced four in-game hours in four seconds, and the
      // 48 s/day rate advanced two. At 1 tick/s the same window is four ticks — the clock must move, and
      // must not have swept a day.
      const ticksPerWindow = (4000 / 1000) * BASE_TICKS_PER_SECOND;
      expect(ticksPerWindow).toBeCloseTo(4, 9);
      expect(ticksPerWindow).toBeLessThan(TICKS_PER_DAY);
      expect(ticksPerWindow / TICKS_PER_HOUR).toBeGreaterThan(0);
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

/**
 * GameLoop command transport — SIMULATION_AUTHORITY.md §5 worker invariants
 * + Objective 6.
 *
 * The worker processes messages FIFO, so a command dispatched while ticks are
 * in flight applies to the post-tick authoritative state and its result
 * arrives after the older tick deltas — a command result can never be
 * overwritten by a stale tick delta. The one forbidden pattern was
 * `applyCommand` waiting for `whenIdle()` before dispatching: with a
 * continuously pipelined worker (4 ticks in flight) idle may never arrive, so
 * every click would dead-wait. This file pins the fixed behavior:
 *
 *   - commands dispatch immediately to a busy worker (no idle wait);
 *   - the main-thread fallback applies the SAME domain implementation
 *     (`applyWorkerCommand`) as the worker;
 *   - stale building selection is pruned after a command (demolition clears
 *     the inspector).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { GameLoop } from '../src/game/gameLoop';
import { createInitialView } from '../src/game/viewState';
import { applyWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import type { SimTickDelta } from '../src/game/simBuffers/simDelta';

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
    job: JobType.Settler,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

function makeWorld(entities: Entity[], buildings: Building[]): WorldState {
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

/** Let the constructor's async worker-init failure settle (node has no Worker). */
async function settleLoop(loop: GameLoop): Promise<void> {
  (loop as unknown as { running: boolean }).running = true;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('GameLoop command transport', () => {
  it('dispatches to a permanently busy worker WITHOUT waiting for idle', async () => {
    const world = makeWorld([human(1)], [building(4, BuildingType.Church)]);
    const loop = new GameLoop(world, createInitialView(400, 300), () => null);
    await settleLoop(loop);

    const fakeHost = {
      isReady: () => true,
      whenIdle: vi.fn(() => new Promise<void>(() => {})), // never idle — the old dead-wait
      sendCommand: vi.fn(() => Promise.resolve({ tick: 1 } as unknown as SimTickDelta)),
      getAuthoritativeWorld: () => loop.getWorld(),
    };
    (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
    (loop as unknown as { workerHost: unknown }).workerHost = fakeHost;

    const cmdObj = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };
    loop.applyCommand(cmdObj);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(fakeHost.whenIdle).not.toHaveBeenCalled();
    expect(fakeHost.sendCommand).toHaveBeenCalledWith(cmdObj);
  });

  /** Fake worker host that captures the registered result handlers for manual firing. */
  function makeFakeHost(authoritative: WorldState) {
    let tickHandler:
      | ((w: WorldState, d: SimTickDelta | null, r: unknown, c: boolean) => void)
      | null = null;
    let cmdHandler:
      | ((w: WorldState, d: SimTickDelta | null, r: unknown, ok: boolean, reason?: string) => void)
      | null = null;
    let faultHandler: ((source: 'tick' | 'command' | 'export' | 'general', message: string) => void) | null = null;
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
      fireFault: (source: 'tick' | 'command' | 'export' | 'general', message: string) => faultHandler!(source, message),
    };
  }

  it('applies the command OPTIMISTICALLY — instant UI feedback before any worker result', async () => {
    const world = makeWorld([human(1)], [building(4, BuildingType.Church)]);
    const loop = new GameLoop(world, createInitialView(400, 300), () => null);
    await settleLoop(loop);
    const fake = makeFakeHost(structuredClone(world));
    (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
    (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
    (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

    const cmdObj = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };
    loop.applyCommand(cmdObj); // NO await — the click's effect must show NOW

    const priest = loop.getWorld().entities.find((e) => e.id === 1)!;
    expect(priest.homeBuildingId).toBe(4);
    expect(loop.getWorld().buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);

    await new Promise<void>((resolve) => setTimeout(resolve, 0)); // chain microtask
    expect(fake.host.sendCommand).toHaveBeenCalledWith(cmdObj);
  });

  it('tick results do NOT overwrite the optimistic display; the authoritative result replaces it', async () => {
    const world = makeWorld([human(1)], [building(4, BuildingType.Church)]);
    const loop = new GameLoop(world, createInitialView(400, 300), () => null);
    await settleLoop(loop);
    const fake = makeFakeHost(structuredClone(world));
    (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
    (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
    (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

    loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 });

    // A pre-command tick result arrives before the command result — the
    // optimistic display must survive it.
    fake.fireTick(structuredClone(world));
    expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBe(4);

    // The authoritative command result replaces the display.
    const authoritative = structuredClone(world);
    authoritative.entities.find((e) => e.id === 1)!.homeBuildingId = 4;
    authoritative.buildings.find((b) => b.id === 4)!.occupants = [1];
    fake.fireCommandResult(authoritative, true);
    expect(loop.getWorld()).toBe(authoritative);
  });

  it('reverts to the authoritative world when the worker rejects the command', async () => {
    const world = makeWorld([human(1)], [building(4, BuildingType.Church)]);
    const loop = new GameLoop(world, createInitialView(400, 300), () => null);
    await settleLoop(loop);
    const authoritative = structuredClone(world); // worker never applied it
    const fake = makeFakeHost(authoritative);
    (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
    (loop as unknown as { workerHost: unknown }).workerHost = fake.host;
    (loop as unknown as { registerWorkerHandlers: (g: number) => void }).registerWorkerHandlers(0);

    loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 });
    expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBe(4); // optimistic

    fake.fireCommandResult(authoritative, false); // command rejected
    expect(loop.getWorld().entities.find((e) => e.id === 1)!.homeBuildingId).toBeUndefined(); // reverted
  });

  it('main-thread fallback applies the same domain implementation as the worker', async () => {
    const world = makeWorld([human(1)], [building(4, BuildingType.Church)]);
    const loop = new GameLoop(world, createInitialView(400, 300), () => null);
    await settleLoop(loop);
    expect(loop.isUsingSimWorker()).toBe(false); // node fallback active

    const cmdObj = { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 };
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

  it('reverts an optimistic command before disposing a stalled worker', async () => {
    const world = makeWorld([human(1)], [building(4, BuildingType.Church)]);
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
    const optimistic = applyWorkerCommand(structuredClone(world), {
      proto: WORKER_CMD_PROTO,
      op: 'assignWorker',
      buildingId: 4,
      humanId: 1,
    });

    (loop as unknown as { world: WorldState }).world = optimistic;
    (loop as unknown as { workerEnabled: boolean }).workerEnabled = true;
    (loop as unknown as { workerBooting: boolean }).workerBooting = false;
    (loop as unknown as { workerHost: unknown }).workerHost = fakeHost;
    (loop as unknown as { running: boolean }).running = true;
    (loop as unknown as { lastWorkerActivity: number }).lastWorkerActivity = 0;
    (loop as unknown as { optimisticCommand: unknown }).optimisticCommand = {
      cmd: { proto: WORKER_CMD_PROTO, op: 'assignWorker', buildingId: 4, humanId: 1 },
    };

    const now = vi.spyOn(performance, 'now').mockReturnValue(5000);
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
    const world = makeWorld([human(1)], [building(4, BuildingType.Church)]);
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
    const world = makeWorld([human(1)], [building(2, BuildingType.Farm, { occupants: [1] })]);
    const view = createInitialView(400, 300);
    view.selectedBuildingId = 2;
    const loop = new GameLoop(world, view, () => null);
    await settleLoop(loop);

    loop.applyCommand({ proto: WORKER_CMD_PROTO, op: 'demolishBuilding', buildingId: 2 });

    expect(loop.getView().selectedBuildingId).toBeNull();
    expect(loop.getWorld().buildings.some((b) => b.id === 2)).toBe(false);
  });
});

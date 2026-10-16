import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityType, MapSize, type WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/gameEngine';
import { GameLoop } from '../src/game/gameLoop';
import { createInitialView } from '../src/game/viewState';
import { GameWorkerHost, type WorkerTickRender } from '../src/game/simWorker/GameWorkerHost';
import { WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import { packRenderSoA } from '../src/game/simBuffers/packRenderSoA';
import { createRenderSoAReader } from '../src/game/simBuffers/renderSoAReader';
import type { SimTickDelta } from '../src/game/simBuffers/simDelta';

const loops: GameLoop[] = [];

afterEach(() => {
  for (const loop of loops.splice(0)) loop.stop();
});

describe('worker display keeps moving while commands are queued', () => {
  it('rebases optimistic state on fresh worker positions and invalidates the previous reader', () => {
    const world = initGame({ villageName: 'Moving Workers', size: MapSize.Medium, seed: 20 });
    const human = world.entities.find((entity) => entity.type === EntityType.Human);
    if (!human) throw new Error('Seeded settlement has no human to follow');

    const authoritative = structuredClone(world);
    const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);
    loops.push(loop);

    let onTick: ((
      next: WorldState, delta: SimTickDelta, render: WorkerTickRender | null, changed: boolean,
    ) => void) | undefined;

    const host = {
      isReady: () => true,
      getAuthoritativeWorld: () => authoritative,
      whenIdle: () => new Promise<void>(() => {}),
      setTickResultHandler: (handler: typeof onTick) => { onTick = handler; },
      setCommandResultHandler: () => {},
      setWorkerFaultHandler: () => {},
      dispose: () => {},
    };
    const internals = loop as unknown as {
      running: boolean;
      workerEnabled: boolean;
      workerHost: GameWorkerHost | null;
      registerWorkerHandlers: (session: number) => void;
      snapshotCache: unknown;
      renderSoA: unknown;
    };
    internals.running = true;
    internals.workerEnabled = true;
    internals.workerHost = host as unknown as GameWorkerHost;
    internals.registerWorkerHandlers(0);

    loop.applyCommand({
      proto: WORKER_CMD_PROTO, op: 'setVenueSchedule', venue: 'tavern', startHour: 12, endHour: 20,
    });
    expect(loop.getWorld().tavernSchedule).toEqual({ startHour: 12, endHour: 20 });

    const mover = authoritative.entities.find((entity) => entity.id === human.id);
    if (!mover) throw new Error('Authoritative settlement lost its human');
    mover.x += 30;
    mover.y += 12;
    authoritative.tick += 1;
    const reader = createRenderSoAReader(packRenderSoA(authoritative).buffer);
    if (!reader) throw new Error('Worker render buffer failed validation');

    internals.snapshotCache = { tick: world.tick, renderSoA: null };
    if (!onTick) throw new Error('Worker tick callback was not registered');
    onTick(authoritative, {} as SimTickDelta, { reader, metaBySlot: null, scentReader: null }, true);

    const displayed = loop.getWorld().entities.find((entity) => entity.id === human.id);
    expect(displayed?.x).toBe(mover.x);
    expect(displayed?.y).toBe(mover.y);
    expect(loop.getWorld().tick).toBe(authoritative.tick);
    expect(loop.getWorld().tavernSchedule).toEqual({ startHour: 12, endHour: 20 });
    expect(internals.snapshotCache).toBeNull();
    expect(internals.renderSoA).toBe(reader);
  });
});

describe('worker ticks drain before queued player actions', () => {
  it('does not refill the tick pipeline while whenIdle is waiting', async () => {
    const host = new GameWorkerHost();
    const internals = host as unknown as {
      ticksInFlight: number;
      resolveIdleWaiters: () => void;
    };
    internals.ticksInFlight = 2;
    const idle = host.whenIdle();

    expect(host.canPipelineTick()).toBe(false);
    internals.ticksInFlight = 0;
    internals.resolveIdleWaiters();
    await idle;
    expect(host.canPipelineTick()).toBe(true);
    host.dispose();
  });
});

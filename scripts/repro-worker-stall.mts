/**
 * Headless repro for "game worker background is stalling".
 * Drives the REAL worker entry (gameWorker.node.ts) via worker_threads,
 * mimicking GameLoop: pipelined tick requests (MAX_PIPELINE_DEPTH=4),
 * periodic player commands, and a stall watchdog.
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';

const TICKS = 6000;
const HUMANS = 120;
const MAX_IN_FLIGHT = 4;
const STALL_MS = 2500;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  const state = initGame({ villageName: 'Stallville', size: MapSize.Large });
  const cx = state.width / 2;
  const cy = state.height / 2;
  state.nextEntityId = state.nextEntityId ?? 0;
  const rng = mulberry32(7);
  for (let i = 0; i < HUMANS; i++) {
    state.entities.push(
      createEntity(EntityType.Human, cx + (rng() - 0.5) * 400, cy + (rng() - 0.5) * 300, state.nextEntityId++, 250),
    );
  }
  state.humanPopulation = HUMANS;
  const simFocus = getSimFocus(state);

  const workerPath = fileURLToPath(new URL('../src/game/simWorker/gameWorker.node.ts', import.meta.url));
  const worker = new Worker(workerPath, { execArgv: ['--import', 'tsx'] });

  let ready = false;
  let ticksInFlight = 0;
  let ticksRequested = 0;
  let ticksDone = 0;
  let results = 0;
  let errors = 0;
  let lastActivity = performance.now();
  let maxGap = 0;
  let lastTick = -1;
  let pendingCommand: { cmd: unknown; t0: number } | null = null;
  let lastError: string | null = null;
  let stallLoggedAt = -1;
  const commandPending = () => pendingCommand != null;
  const isIdle = () => ticksInFlight === 0 && !commandPending();

  const whenIdle = async (): Promise<void> => {
    while (!isIdle()) await new Promise((r) => setTimeout(r, 5));
  };

  const send = (msg: WorkerRequest): void => {
    worker.postMessage(msg);
  };

  const checkStall = (): void => {
    const now = performance.now();
    const gap = now - lastActivity;
    if (gap > maxGap) maxGap = gap;
    if (ticksInFlight > 0 && gap > STALL_MS && gap - stallLoggedAt > STALL_MS) {
      stallLoggedAt = gap;
      console.error(
        `[STALL] no worker activity for ${Math.round(gap)}ms (ticksInFlight=${ticksInFlight}, requested=${ticksRequested}, done=${ticksDone})`,
      );
    }
  };

  worker.on('message', (msg: WorkerResponse) => {
    lastActivity = performance.now();
    if (!ready) {
      if (msg.type === 'ready') {
        ready = true;
        console.log(`worker ready, buffers=${JSON.stringify(msg.buffers)}`);
      } else if (msg.type === 'error') {
        console.error('[early error]', msg.message);
        errors++;
      }
      return;
    }
    switch (msg.type) {
      case 'tickResult': {
        ticksInFlight = Math.max(0, ticksInFlight - 1);
        results++;
        if (msg.delta) {
          const t = (msg.delta as { tick: number }).tick;
          if (lastTick >= 0 && t !== lastTick + 1) {
            console.error(`[GAP] tick jumped ${lastTick} -> ${t}`);
          }
          lastTick = t;
          ticksDone = Math.max(ticksDone, t);
        }
        break;
      }
      case 'commandResult': {
        pendingCommand = null;
        break;
      }
      case 'error': {
        errors++;
        lastError = msg.message;
        console.error(`[worker error] source=${msg.source} ${msg.message}`);
        if (msg.source === 'tick') ticksInFlight = Math.max(0, ticksInFlight - 1);
        break;
      }
      case 'exportSaveResult':
        break;
    }
  });

  worker.on('error', (err) => {
    console.error('[worker thread error]', err);
    errors++;
  });
  worker.on('exit', (code) => {
    console.log(`worker exited code=${code}`);
  });

  // init
  send({ type: 'init', proto: WORKER_PROTO, world: state, features: ['renderSoA_v1'] });
  const readyDeadline = Date.now() + 15000;
  while (!ready) {
    if (Date.now() > readyDeadline) {
      console.error('[FATAL] worker never became ready');
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  const stallTimer = setInterval(checkStall, 200);

  // pipeline driver — mimic GameLoop.frame: keep up to MAX_IN_FLIGHT ticks queued
  while (ticksDone < TICKS) {
    while (ticksInFlight < MAX_IN_FLIGHT && ticksRequested < TICKS) {
      send({ type: 'tick', proto: WORKER_PROTO, focus: simFocus });
      ticksInFlight++;
      ticksRequested++;
    }
    // periodic command to exercise the command path mid-pipeline
    if (ticksDone > 100 && !commandPending() && ticksDone % 700 === 0) {
      pendingCommand = { cmd: { proto: 1, op: 'autoStaffWorkers' }, t0: performance.now() };
      send({ type: 'command', proto: WORKER_PROTO, cmd: pendingCommand.cmd });
    }
    await new Promise((r) => setTimeout(r, 2));
  }

  // drain
  const drainDeadline = Date.now() + 20000;
  while (!isIdle() && Date.now() < drainDeadline) await new Promise((r) => setTimeout(r, 10));

  clearInterval(stallTimer);
  const finalTick = ticksDone;

  // export check — full-world transfer path
  await whenIdle();
  send({ type: 'exportSave', proto: WORKER_PROTO });
  const exportDeadline = Date.now() + 20000;
  let exported = false;
  while (!exported && Date.now() < exportDeadline) {
    exported = true;
    await new Promise((r) => setTimeout(r, 10));
  }
  worker.terminate();

  console.log('==========================================');
  console.log(`requested=${ticksRequested} results=${results} doneTick=${finalTick}`);
  console.log(`errors=${errors}${lastError ? ` lastError="${lastError}"` : ''}`);
  console.log(`maxGapMs=${Math.round(maxGap)} stallLogged=${stallLoggedAt >= 0}`);
  if (finalTick < TICKS) console.error('[RESULT] STALL: worker did not complete the requested ticks');
  else console.log('[RESULT] no stall observed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

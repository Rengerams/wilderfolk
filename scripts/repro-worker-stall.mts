/**
 * Headless repro for "game worker background is stalling".
 * Drives the REAL worker entry (gameWorker.node.ts) via worker_threads,
 * mimicking GameLoop: pipelined tick requests (MAX_PIPELINE_DEPTH=4),
 * periodic player commands, and a stall watchdog.
 *
 * The watchdog question is about the **gap** between worker results, not the mean tick: a colony can
 * tick at 10 ms p50 and still trip `GameLoop`'s watchdog if one tick or one GC pause is long enough
 * (the live report was `Worker silent 105837ms`). So this reports max/p99 inter-result gap and the
 * heap high-water mark beside the tick distribution, and it can be pointed at a **real save**:
 *
 *   PERF_SAVE=<save.json> TICKS=2000 npx tsx scripts/repro-worker-stall.mts
 *
 * Env:
 *   PERF_SAVE=<path>       drive this save instead of the synthetic 120-settler colony
 *   TICKS=<n>              ticks to request (default 6000 synthetic / 2000 with a save)
 *   STALL_MS=<n>           gap that counts as a stall (default 2500; GameLoop's floor is 10000)
 */
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import {
  WORKER_PROTO,
  type WorkerCommandEnvelope,
  type WorkerRequest,
  type WorkerResponse,
} from '../src/game/simWorker/protocol';

const SAVE_PATH = process.env.PERF_SAVE;
const TICKS = Number(process.env.TICKS ?? (SAVE_PATH ? 2000 : 6000));
const HUMANS = 120;
const MAX_IN_FLIGHT = 4;
/** GameLoop's watchdog floor is 10000 ms; 2500 keeps this harness sensitive to a real gap. */
const STALL_MS = Number(process.env.STALL_MS ?? 2500);

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
  let state = initGame({ villageName: 'Stallville', size: MapSize.Large });

  if (SAVE_PATH) {
    const parsed = parseSaveJson(readFileSync(SAVE_PATH, 'utf8'));
    if (!parsed.valid) throw new Error(`save refused at parse: ${parsed.reason}`);
    const loaded = loadGameFromParsed(parsed.parsed);
    if (!loaded) throw new Error('save load returned null');
    state = loaded.world;
    state.paused = false;
    const alive = state.entities.filter((e) => e.alive && e.type === EntityType.Human).length;
    console.log(`save ${SAVE_PATH}: tick=${state.tick} entities=${state.entities.length} buildings=${state.buildings.length} livingHumans=${alive}`);
  } else {
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
  }
  const simFocus = getSimFocus(state);
  /** The world's tick when the run starts — a loaded save does not begin at 0. */
  const startTick = state.tick;

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
  /** The watchdog's own quantity: milliseconds between two consecutive worker results. */
  let maxResultGap = 0;
  let maxResultGapAtTick = -1;
  let lastResultAt = 0;
  let heapPeakMb = 0;
  let lastTick = -1;
  let pendingCommand: { cmd: WorkerCommandEnvelope; t0: number } | null = null;
  let lastError: string | null = null;
  let stallLoggedAt = -1;
  const gapHistogram: number[] = [];
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
    const heapMb = process.memoryUsage().heapUsed / (1024 * 1024);
    if (heapMb > heapPeakMb) heapPeakMb = heapMb;
    if (ticksInFlight > 0 && gap > STALL_MS && gap - stallLoggedAt > STALL_MS) {
      stallLoggedAt = gap;
      console.error(
        `[STALL] no worker activity for ${Math.round(gap)}ms (ticksInFlight=${ticksInFlight}, requested=${ticksRequested}, done=${ticksDone}, heap=${heapMb.toFixed(0)}MB)`,
      );
    }
  };

  worker.on('message', (msg: WorkerResponse) => {
    const arrivedAt = performance.now();
    lastActivity = arrivedAt;
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
        if (lastResultAt > 0) {
          const gap = arrivedAt - lastResultAt;
          gapHistogram.push(gap);
          if (gap > maxResultGap) {
            maxResultGap = gap;
            maxResultGapAtTick = lastTick;
          }
        }
        lastResultAt = arrivedAt;
        if (msg.delta) {
          const t = (msg.delta as { tick: number }).tick;
          if (lastTick >= 0 && t !== lastTick + 1) {
            console.error(`[GAP] tick jumped ${lastTick} -> ${t}`);
          }
          lastTick = t;
          // Relative progress: a save starts at its own absolute tick, so `t < TICKS` would stop
          // the synthetic run instantly if this were the absolute tick.
          ticksDone = Math.max(ticksDone, t - startTick);
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
  const readyDeadline = performance.now() + 15000;
  while (!ready) {
    if (performance.now() > readyDeadline) {
      console.error('[FATAL] worker never became ready');
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  const stallTimer = setInterval(checkStall, 200);
  const startedAt = performance.now();

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
  const drainDeadline = performance.now() + 20000;
  while (!isIdle() && performance.now() < drainDeadline) await new Promise((r) => setTimeout(r, 10));

  clearInterval(stallTimer);
  const elapsedMs = performance.now() - startedAt;
  const finalTick = ticksDone;

  // export check — full-world transfer path
  await whenIdle();
  send({ type: 'exportSave', proto: WORKER_PROTO });
  const exportDeadline = performance.now() + 20000;
  let exported = false;
  while (!exported && performance.now() < exportDeadline) {
    exported = true;
    await new Promise((r) => setTimeout(r, 10));
  }
  worker.terminate();

  const sorted = [...gapHistogram].sort((a, b) => a - b);
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

  console.log('==========================================');
  console.log(`requested=${ticksRequested} results=${results} doneTick=${finalTick}`);
  console.log(`errors=${errors}${lastError ? ` lastError="${lastError}"` : ''}`);
  console.log(`wallMs=${Math.round(elapsedMs)} ticksPerSec=${(results / (elapsedMs / 1000)).toFixed(1)}`);
  console.log(
    `interResultGap: mean=${mean.toFixed(1)}ms p50=${pct(0.5).toFixed(1)}ms p95=${pct(0.95).toFixed(1)}ms `
      + `p99=${pct(0.99).toFixed(1)}ms MAX=${maxResultGap.toFixed(1)}ms (at tick ${maxResultGapAtTick})`,
  );
  console.log(`idleGapMaxMs=${Math.round(maxGap)} heapPeak=${heapPeakMb.toFixed(1)}MB stallThreshold=${STALL_MS}ms`);
  console.log(`stallLogged=${stallLoggedAt >= 0}`);
  if (maxResultGap > STALL_MS) {
    console.error(`[RESULT] GAP: a ${maxResultGap.toFixed(0)}ms inter-result gap exceeded the ${STALL_MS}ms threshold`);
  } else if (finalTick < TICKS) {
    console.error('[RESULT] STALL: worker did not complete the requested ticks');
  } else {
    console.log(`[RESULT] no stall observed (max gap ${maxResultGap.toFixed(0)}ms < ${STALL_MS}ms)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

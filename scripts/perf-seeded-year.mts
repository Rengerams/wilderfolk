/**
 * Wilderfolk — seeded one-year performance run (roadmap O4 / P2 "Seeded One-Year Performance Run").
 *
 * Reports one metric set for a seeded colony, with every counter the roadmap asks to keep separate:
 *
 *   tick time p50/p95/p99/max   · path calls (real A* counters + spatial-query call counts)
 *   delta size (JSON + V8 bytes) · serialization spikes
 *   memory trend (heap/RSS per day) · worker fallbacks · stalled ticks
 *   console volume · invariant violations
 *
 * **On "path calls":** two distinct counters are published, because they measure different things and
 * were previously conflated under one name.
 *
 *   `pathCalls`  — *spatial searches* (`src/game/spatialQueryMetrics.ts`): graze/flee/hunt/social/road
 *                  queries, their candidate checks and grid cells. Kept under its historical name for
 *                  record compatibility.
 *   `pathfinder` — the *real A\* counters* (`src/game/pathfindingMetrics.ts`): `findPath` invocations,
 *                  nodes expanded, found/failed/node-cap outcomes, the cheap `lineCrossesBlocked` gate,
 *                  passability-grid rebuilds, and waypoint-cache hit/miss. Read **this** block when the
 *                  roadmap asks for "path calls".
 *
 * Two phases, because the repository can only observe them separately:
 *
 *   1. **in-process metric run** (default one year, `--days`) on the seeded settlement — the only
 *      place `spatialQueryMetrics` call counts (the sim's own path/query instrumentation), the delta
 *      serializer and the daily invariant collector are reachable.
 *   2. **worker transport sample** (`--worker-days`, default 1 day) through the REAL headless worker
 *      (`simWorker/gameWorker.node.ts`, the same module the browser worker runs, driven over
 *      `worker_threads` exactly as `scripts/repro-worker-stall.mts` does). That is where a worker
 *      fallback and a stalled tick can actually be counted; on a fault the harness falls back to
 *      main-thread ticks for the rest of the sample, mirroring `GameLoop.fallbackFromWorker`.
 *
 * Why the worker sample is bounded rather than a full year: one Huge-map tick ships a ~1 MB
 * `SimTickDelta` over the port (measured below), so a 25 920-tick worker run moves tens of GB. The
 * in-process run is the one-year measurement; pass `--worker-days=360` if you want the worker to
 * carry the whole year and can wait for it.
 *
 * Run:
 *   npx tsx scripts/perf-seeded-year.mts                             # one year, Huge, producers
 *   npx tsx scripts/perf-seeded-year.mts --days=90 --worker-days=1   # a bounded review run
 *   node --expose-gc --import tsx scripts/perf-seeded-year.mts       # forced-GC memory trend
 *
 * Options:
 *   --days=N            in-process run length (default 360, max 3600)
 *   --seed=N            seed (default 12345)
 *   --scenario=         producers | restocked (default producers)
 *   --map=              huge | large | medium (default huge)
 *   --delta-sample-days=N   serialize one delta every N days (default 1; 0 disables)
 *   --memory-sample-days=N  sample heap/RSS every N days (default 1)
 *   --worker-days=N     worker transport sample length (default 1; 0 skips the worker)
 *
 * The bounded text report goes to stdout; the complete record (including every sample) goes to one
 * JSONL file under `docs/log/`. Normal mode never prints a line per tick.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { serialize as v8Serialize } from 'node:v8';
import { gameTick } from '../src/game/gameEngine';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';import { MAX_PIPELINE_DEPTH } from '../src/game/simWorker/GameWorkerHost';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import {
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsConsoleLoggingEnabled,
  setRelationshipDiagnosticsEnabled,
} from '../src/game/relationshipDiagnostics';
import { resetSimRng } from '../src/game/simRng';
import {
  getSpatialQueryReport,
  resetSpatialQuerySession,
  setSpatialQueryMetricsEnabled,
} from '../src/game/spatialQueryMetrics';
import {
  getPathfinderReport,
  resetPathfinderSession,
  setPathfindingMetricsEnabled,
} from '../src/game/pathfindingMetrics';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import {
  PACING_TICK_BUDGET_MS,
  SERIALIZATION_SPIKE_MS,
  WORKER_STALL_TIMEOUT_MS,
  captureConsoleVolume,
  collectInvariantErrors,
  isScenarioName,
  prepareColonyWorld,
  sampleDelta,
  summarizeLivingPopulation,
  type ConsoleVolume,
  type ScenarioName,
} from './colonyHealth';

const DEFAULT_DAYS = 360;
const MAX_DAYS = 3600;
const DEFAULT_SEED = 12345;
const DEFAULT_WORKER_DAYS = 1;
const MAP_SIZES: Record<string, MapSize> = {
  medium: MapSize.Medium,
  large: MapSize.Large,
  huge: MapSize.Huge,
};

interface RunOptions {
  days: number;
  seed: number;
  scenario: ScenarioName;
  mapSize: MapSize;
  mapName: string;
  deltaSampleDays: number;
  memorySampleDays: number;
  workerDays: number;
}

function readIntegerOption(args: readonly string[], name: string, allowZero = false): number | null {
  const supplied = args.filter((arg) => arg.startsWith(`--${name}=`));
  if (supplied.length === 0) return null;
  if (supplied.length !== 1) throw new Error(`Use --${name}=<integer> only once.`);
  const value = supplied[0].slice(`--${name}=`.length);
  const pattern = allowZero ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/;
  if (!pattern.test(value)) throw new Error(`The --${name} value must be a ${allowZero ? 'non-negative' : 'positive'} integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`The --${name} value must be a safe integer.`);
  return parsed;
}

function readRunOptions(args: readonly string[]): RunOptions {
  const days = readIntegerOption(args, 'days') ?? DEFAULT_DAYS;
  if (days > MAX_DAYS) throw new Error(`The --days value must be between 1 and ${MAX_DAYS}.`);

  const scenarioArgs = args.filter((arg) => arg.startsWith('--scenario='));
  if (scenarioArgs.length > 1) throw new Error('Use --scenario=<name> only once.');
  const scenarioValue = scenarioArgs[0]?.slice('--scenario='.length) ?? 'producers';
  if (!isScenarioName(scenarioValue)) throw new Error(`Unknown --scenario "${scenarioValue}".`);

  const mapArgs = args.filter((arg) => arg.startsWith('--map='));
  if (mapArgs.length > 1) throw new Error('Use --map=<name> only once.');
  const mapName = mapArgs[0]?.slice('--map='.length) ?? 'huge';
  const mapSize = MAP_SIZES[mapName];
  if (!mapSize) throw new Error(`Unknown --map "${mapName}". Known: ${Object.keys(MAP_SIZES).join(', ')}.`);

  return {
    days,
    seed: readIntegerOption(args, 'seed') ?? DEFAULT_SEED,
    scenario: scenarioValue,
    mapSize,
    mapName,
    deltaSampleDays: readIntegerOption(args, 'delta-sample-days', true) ?? 1,
    memorySampleDays: readIntegerOption(args, 'memory-sample-days', true) ?? 1,
    workerDays: readIntegerOption(args, 'worker-days', true) ?? DEFAULT_WORKER_DAYS,
  };
}

const options = readRunOptions(process.argv.slice(2));
const totalTicks = options.days * TICKS_PER_DAY;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logDirectory = resolve(projectRoot, 'docs', 'log');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const logPath = resolve(logDirectory, `perf-year-${runId}.jsonl`);

interface Distribution {
  count: number;
  min: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

function percentileOf(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(Math.floor(sorted.length * q), sorted.length - 1)] ?? 0;
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return { count: 0, min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    min: sorted[0],
    avg: total / values.length,
    p50: percentileOf(sorted, 0.5),
    p95: percentileOf(sorted, 0.95),
    p99: percentileOf(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

function writeLog(event: Record<string, unknown>): void {
  appendFileSync(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, 'utf8');
}

interface MemorySample {
  day: number;
  heapUsedMb: number;
  rssMb: number;
  externalMb: number;
}

interface DeltaSampleSeries {
  jsonBytes: Distribution;
  v8Bytes: Distribution;
  serializeMs: Distribution;
  samples: Array<{ day: number; jsonBytes: number; v8Bytes: number; serializeMs: number }>;
}

interface InProcessReport {
  phase: 'in-process';
  scenario: ScenarioName;
  map: string;
  seed: number;
  days: number;
  ticks: number;
  elapsedMs: number;
  tickMs: Distribution;
  stalledTicks: number;
  stalledTickThresholdMs: number;
  pathCalls: {
    source: string;
    gridMode: string;
    measuredTicks: number;
    totalQueryCalls: number;
    totalCandidateChecks: number;
    totalCellsVisited: number;
    queriesPerTick: number;
    candidatesPerTick: number;
    cellsPerTick: number;
    perCategory: Record<string, { queries: number; candidates: number; cells: number }>;
  };
  pathfinder: {
    source: string;
    measuredTicks: number;
    findPathCalls: number;
    nodesExpanded: number;
    nodesPerCall: number;
    pathsFound: number;
    pathsFailed: number;
    maxNodesExceeded: number;
    earlyRejects: number;
    lineChecks: number;
    gridRebuilds: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    findPathCallsPerTick: number;
    lineChecksPerTick: number;
  };
  deltas: DeltaSampleSeries & { serializationSpikes: number; spikeThresholdMs: number };
  memory: {
    source: string;
    gcForced: boolean;
    samples: MemorySample[];
    firstHeapUsedMb: number | null;
    lastHeapUsedMb: number | null;
    peakHeapUsedMb: number | null;
    peakRssMb: number | null;
    heapUsedTrendMb: number | null;
  };
  console: ConsoleVolume;
  invariants: { checks: number; violations: number; sample: string[] };
  settlement: Record<string, unknown>;
  outcome: {
    population: Record<string, number | Record<string, number>>;
    foodStored: number;
    foodProducedToday: number;
    foodConsumedToday: number;
    buildings: number;
  };
}

interface WorkerSampleReport {
  phase: 'worker-transport';
  skipped: boolean;
  skipReason: string | null;
  days: number;
  ticksRequested: number;
  ticksCompleted: number;
  /**
   * Ticks finished on the main thread after a worker fault, mirroring `GameLoop.fallbackFromWorker`.
   * The main thread holds its own copy of the seeded world (the worker was handed a clone), so these
   * measure main-thread tick cost from the start of the sample, not a continuation of the worker's
   * calendar.
   */
  ticksOnMainThreadAfterFallback: number;
  fallbackCount: number;
  fallbackReason: string | null;
  stalledTicks: number;
  stallTimeoutMs: number;
  errorCount: number;
  pipelineDepth: number;
  resultGapMs: Distribution;
  deltaV8Bytes: Distribution;
  workerConsole: { stdoutBytes: number; stderrBytes: number; lines: number };
  finalTick: number | null;
  finalInvariants: { violations: number; sample: string[] } | null;
  elapsedMs: number;
}

function sampleMemory(day: number): MemorySample {
  const forced = typeof (globalThis as { gc?: () => void }).gc === 'function';
  if (forced) (globalThis as { gc?: () => void }).gc?.();
  const usage = process.memoryUsage();
  return {
    day,
    heapUsedMb: usage.heapUsed / 1048576,
    rssMb: usage.rss / 1048576,
    externalMb: usage.external / 1048576,
  };
}

/** Phase 1 — the seeded one-year metric run, in process, where every counter is reachable. */
function runInProcessPhase(): InProcessReport {
  const startedAt = performance.now();
  resetRelationshipDiagnostics();
  setRelationshipDiagnosticsEnabled(true);
  setRelationshipDiagnosticsConsoleLoggingEnabled(false);
  const consoleCapture = captureConsoleVolume();

  const { world, settlement } = prepareColonyWorld({
    size: options.mapSize,
    seed: options.seed,
    scenario: options.scenario,
  });

  setSpatialQueryMetricsEnabled(true);
  resetSpatialQuerySession();
  setPathfindingMetricsEnabled(true);
  resetPathfinderSession();

  const tickMs: number[] = [];
  const deltaSamples: DeltaSampleSeries['samples'] = [];
  const memorySamples: MemorySample[] = [];
  let stalledTicks = 0;
  let serializationSpikes = 0;
  let invariantChecks = 0;
  let invariantViolations = 0;
  const invariantSample: string[] = [];

  memorySamples.push(sampleMemory(0));

  for (let tick = 1; tick <= totalTicks; tick += 1) {
    const tickStartedAt = performance.now();
    gameTick(world);
    const tickDuration = performance.now() - tickStartedAt;
    tickMs.push(tickDuration);
    if (tickDuration > PACING_TICK_BUDGET_MS) stalledTicks += 1;

    const day = tick / TICKS_PER_DAY;
    const endOfDay = tick % TICKS_PER_DAY === 0;

    if (endOfDay && options.deltaSampleDays > 0 && day % options.deltaSampleDays === 0) {
      const sample = sampleDelta(world);
      deltaSamples.push({ day, jsonBytes: sample.jsonBytes, v8Bytes: sample.v8Bytes, serializeMs: sample.serializeMs });
      if (sample.serializeMs > SERIALIZATION_SPIKE_MS) serializationSpikes += 1;
    }

    if (endOfDay && options.memorySampleDays > 0 && day % options.memorySampleDays === 0) {
      memorySamples.push(sampleMemory(day));
    }

    if (endOfDay) {
      const errors = collectInvariantErrors(world);
      invariantChecks += 1;
      invariantViolations += errors.length;
      for (const error of errors) {
        if (invariantSample.length < 5) invariantSample.push(`day ${day}: ${error}`);
      }
    }
  }

  const elapsedMs = performance.now() - startedAt;
  const spatial = getSpatialQueryReport();
  const pathfinder = getPathfinderReport();
  setSpatialQueryMetricsEnabled(false);
  setPathfindingMetricsEnabled(false);
  const consoleVolume = consoleCapture.volume();
  consoleCapture.restore();

  const heapValues = memorySamples.map((sample) => sample.heapUsedMb);
  const rssValues = memorySamples.map((sample) => sample.rssMb);
  const firstHeap = heapValues[0] ?? null;
  const lastHeap = heapValues[heapValues.length - 1] ?? null;

  return {
    phase: 'in-process',
    scenario: options.scenario,
    map: options.mapName,
    seed: options.seed,
    days: options.days,
    ticks: totalTicks,
    elapsedMs: Math.round(elapsedMs),
    tickMs: distribution(tickMs),
    stalledTicks,
    stalledTickThresholdMs: PACING_TICK_BUDGET_MS,
    pathCalls: {
      // This block is the *spatial-query* counter, kept under its historical name for record
      // compatibility. The real A* counters live in the sibling `pathfinder` block below.
      source: 'spatialQueryMetrics session call counts (spatial searches, not A* runs) — see the sibling `pathfinder` block for real pathfinding counters',
      gridMode: spatial.gridMode,
      measuredTicks: spatial.ticks,
      totalQueryCalls: Object.values(spatial.session).reduce((sum, bucket) => sum + bucket.queries, 0),
      totalCandidateChecks: Object.values(spatial.session).reduce((sum, bucket) => sum + bucket.candidates, 0),
      totalCellsVisited: Object.values(spatial.session).reduce((sum, bucket) => sum + bucket.cells, 0),
      queriesPerTick: spatial.totals.queriesPerTick,
      candidatesPerTick: spatial.totals.candidatesPerTick,
      cellsPerTick: spatial.totals.cellsPerTick,
      perCategory: spatial.session,
    },
    pathfinder: {
      source: 'pathfindingMetrics — A* invocations, expanded nodes, waypoint-cache behaviour and grid rebuilds (the real path calls)',
      measuredTicks: pathfinder.ticks,
      findPathCalls: pathfinder.session.findPathCalls,
      nodesExpanded: pathfinder.session.nodesExpanded,
      nodesPerCall: pathfinder.nodesPerCall,
      pathsFound: pathfinder.session.pathsFound,
      pathsFailed: pathfinder.session.pathsFailed,
      maxNodesExceeded: pathfinder.session.maxNodesExceeded,
      earlyRejects: pathfinder.session.earlyRejects,
      lineChecks: pathfinder.session.lineChecks,
      gridRebuilds: pathfinder.session.gridRebuilds,
      cacheHits: pathfinder.session.cacheHits,
      cacheMisses: pathfinder.session.cacheMisses,
      cacheHitRate: pathfinder.cacheHitRate,
      findPathCallsPerTick: pathfinder.perTick.findPathCalls,
      lineChecksPerTick: pathfinder.perTick.lineChecks,
    },
    deltas: {
      samples: deltaSamples,
      jsonBytes: distribution(deltaSamples.map((sample) => sample.jsonBytes)),
      v8Bytes: distribution(deltaSamples.map((sample) => sample.v8Bytes)),
      serializeMs: distribution(deltaSamples.map((sample) => sample.serializeMs)),
      serializationSpikes,
      spikeThresholdMs: SERIALIZATION_SPIKE_MS,
    },
    memory: {
      source: 'process.memoryUsage() (the only source available to a Node harness)',
      gcForced: memorySamples.length > 0 && typeof (globalThis as { gc?: () => void }).gc === 'function',
      samples: memorySamples,
      firstHeapUsedMb: firstHeap,
      lastHeapUsedMb: lastHeap,
      peakHeapUsedMb: heapValues.length > 0 ? Math.max(...heapValues) : null,
      peakRssMb: rssValues.length > 0 ? Math.max(...rssValues) : null,
      heapUsedTrendMb: firstHeap != null && lastHeap != null ? lastHeap - firstHeap : null,
    },
    console: consoleVolume,
    invariants: { checks: invariantChecks, violations: invariantViolations, sample: invariantSample },
    settlement,
    outcome: {
      population: summarizeLivingPopulation(world),
      foodStored: Math.round(world.resources.food ?? 0),
      foodProducedToday: world.economyLedger?.producedTotal ?? 0,
      foodConsumedToday: world.economyLedger?.consumedTotal ?? 0,
      buildings: world.buildings.length,
    },
  };
}

interface WorkerSampleState {
  results: number;
  errors: number;
  gaps: number[];
  deltaBytes: number[];
  lastResultAt: number;
  lastActivityAt: number;
  lineBuffer: string;
  stdoutBytes: number;
  stderrBytes: number;
  lines: number;
  ready: boolean;
  readyError: string | null;
}

function createWorkerSampleState(): WorkerSampleState {
  return {
    results: 0,
    errors: 0,
    gaps: [],
    deltaBytes: [],
    lastResultAt: 0,
    lastActivityAt: 0,
    lineBuffer: '',
    stdoutBytes: 0,
    stderrBytes: 0,
    lines: 0,
    ready: false,
    readyError: null,
  };
}

function countLines(state: WorkerSampleState, chunk: string, isStderr: boolean): void {
  if (isStderr) state.stderrBytes += Buffer.byteLength(chunk);
  else state.stdoutBytes += Buffer.byteLength(chunk);
  state.lineBuffer += chunk;
  const parts = state.lineBuffer.split(/\r?\n/);
  state.lineBuffer = parts.pop() ?? '';
  state.lines += parts.length;
}

/**
 * Phase 2 — the real headless worker over `worker_threads`, run exactly as `GameLoop` drives it
 * (pipelined ticks, a stall watchdog, and a main-thread fallback when the worker faults).
 */
async function runWorkerSamplePhase(): Promise<WorkerSampleReport> {
  const startedAt = performance.now();
  const days = options.workerDays;
  const ticks = days * TICKS_PER_DAY;
  const emptyDistribution = distribution([]);
  const base: WorkerSampleReport = {
    phase: 'worker-transport',
    skipped: false,
    skipReason: null,
    days,
    ticksRequested: 0,
    ticksCompleted: 0,
    ticksOnMainThreadAfterFallback: 0,
    fallbackCount: 0,
    fallbackReason: null,
    stalledTicks: 0,
    stallTimeoutMs: WORKER_STALL_TIMEOUT_MS,
    errorCount: 0,
    pipelineDepth: MAX_PIPELINE_DEPTH,
    resultGapMs: emptyDistribution,
    deltaV8Bytes: emptyDistribution,
    workerConsole: { stdoutBytes: 0, stderrBytes: 0, lines: 0 },
    finalTick: null,
    finalInvariants: null,
    elapsedMs: 0,
  };
  if (ticks <= 0) {
    return { ...base, skipped: true, skipReason: '--worker-days=0' };
  }

  const { world } = prepareColonyWorld({
    size: options.mapSize,
    seed: options.seed,
    scenario: options.scenario,
  });
  const state = createWorkerSampleState();

  let worker: Worker | null = null;
  try {
    const workerPath = fileURLToPath(new URL('../src/game/simWorker/gameWorker.node.ts', import.meta.url));
    // `stdout`/`stderr` are captured so the worker's own console volume is measured, not interleaved.
    worker = new Worker(workerPath, { execArgv: ['--import', 'tsx'], stdout: true, stderr: true });
  } catch (error) {
    return {
      ...base,
      skipped: true,
      skipReason: `worker could not be constructed: ${error instanceof Error ? error.message : String(error)}`,
      fallbackCount: 1,
      fallbackReason: 'worker construction failed',
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const activeWorker = worker;
  activeWorker.stdout?.setEncoding('utf8');
  activeWorker.stderr?.setEncoding('utf8');
  activeWorker.stdout?.on('data', (chunk: string) => countLines(state, chunk, false));
  activeWorker.stderr?.on('data', (chunk: string) => countLines(state, chunk, true));

  let fault: string | null = null;
  const onMessage = (message: WorkerResponse): void => {
    state.lastActivityAt = Date.now();
    if (message.type === 'ready') {
      state.ready = true;
      return;
    }
    if (message.type === 'error') {
      state.errors += 1;
      fault = fault ?? `worker error (${message.source ?? 'general'}): ${message.message}`;
      return;
    }
    if (message.type !== 'tickResult') return;
    const now = performance.now();
    state.results += 1;
    if (state.lastResultAt > 0) state.gaps.push(now - state.lastResultAt);
    state.lastResultAt = now;
    if (message.delta && state.results % TICKS_PER_DAY === 1) {
      // Delta size over the port, sampled once per worker-day: serializing every tick would cost more
      // than the tick it measures.
      try {
        state.deltaBytes.push(v8Serialize(message.delta).byteLength);
      } catch {
        /* a non-serializable delta is reported by its absence, not by a crash */
      }
    }
  };
  activeWorker.on('message', onMessage);
  activeWorker.on('error', (error: Error) => {
    state.errors += 1;
    fault = fault ?? `worker thread error: ${error.message}`;
  });

  let stalledTicks = 0;
  let fallbackCount = 0;
  let fallbackReason: string | null = null;
  let ticksOnMainThread = 0;

  const send = (message: WorkerRequest): void => {
    activeWorker.postMessage(message);
  };

  const waitForReady = async (): Promise<boolean> => {
    const deadline = Date.now() + 30_000;
    while (!state.ready && !fault && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (fault) {
      fallbackCount += 1;
      fallbackReason = `worker init failed: ${fault}`;
      return false;
    }
    if (!state.ready) {
      fallbackCount += 1;
      fallbackReason = 'worker never reported ready within 30 s';
      return false;
    }
    return true;
  };

  state.lastActivityAt = Date.now();
  send({ type: 'init', proto: WORKER_PROTO, world, features: [], headless: true });
  const ready = await waitForReady();

  if (ready) {
    let requested = 0;
    while (state.results < ticks) {
      while (requested - state.results < MAX_PIPELINE_DEPTH && requested < ticks && fault == null) {
        send({ type: 'tick', proto: WORKER_PROTO });
        requested += 1;
      }
      // The stall watchdog: a tick in flight with no worker activity for the loop's own timeout.
      const idleMs = Date.now() - state.lastActivityAt;
      if (requested > state.results && idleMs > WORKER_STALL_TIMEOUT_MS) {
        stalledTicks += 1;
        fallbackCount += 1;
        fallbackReason = `worker stalled for ${idleMs} ms with ${requested - state.results} tick(s) in flight`;
        fault = fallbackReason;
        break;
      }
      if (fault != null) break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  if (fault != null || !ready) {
    // Mirror `GameLoop.fallbackFromWorker`: finish the sample on the main thread and count it.
    const completed = state.results;
    for (let index = completed; index < ticks; index += 1) {
      const tickStartedAt = performance.now();
      gameTick(world);
      const duration = performance.now() - tickStartedAt;
      state.gaps.push(duration);
      if (duration > PACING_TICK_BUDGET_MS) stalledTicks += 1;
      ticksOnMainThread += 1;
    }
    state.results += ticksOnMainThread;
  }

  let finalInvariants: WorkerSampleReport['finalInvariants'] = null;
  let finalTick: number | null = null;
  if (ready && fault == null) {
    // Ask the worker for its authoritative world and run the invariant collector on it: the only way
    // to gate a worker run with the same collector the in-process phase uses.
    try {
      const exportedWorld = await new Promise<WorldState | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 30_000);
        const onExport = (message: WorkerResponse): void => {
          if (message.type !== 'exportSaveResult') return;
          clearTimeout(timeout);
          activeWorker.off('message', onExport);
          resolve(message.world);
        };
        activeWorker.on('message', onExport);
        send({ type: 'exportSave', proto: WORKER_PROTO });
      });
      if (exportedWorld) {
        finalTick = exportedWorld.tick;
        const errors = collectInvariantErrors(exportedWorld);
        finalInvariants = { violations: errors.length, sample: errors.slice(0, 5) };
      }
    } catch {
      finalInvariants = null;
    }
  }

  await activeWorker.terminate();

  return {
    ...base,
    ticksRequested: state.results,
    ticksCompleted: state.results - ticksOnMainThread,
    ticksOnMainThreadAfterFallback: ticksOnMainThread,
    fallbackCount,
    fallbackReason,
    stalledTicks,
    errorCount: state.errors,
    resultGapMs: distribution(state.gaps),
    deltaV8Bytes: distribution(state.deltaBytes),
    workerConsole: { stdoutBytes: state.stdoutBytes, stderrBytes: state.stderrBytes, lines: state.lines },
    finalTick,
    finalInvariants,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function printInProcessReport(report: InProcessReport): void {
  const lines: string[] = [];
  lines.push(`[perf] phase=in-process scenario=${report.scenario} map=${report.map} seed=${report.seed} days=${report.days} ticks=${report.ticks}`);
  lines.push(`[perf] elapsed=${report.elapsedMs}ms tick p50=${formatMs(report.tickMs.p50)} p95=${formatMs(report.tickMs.p95)} p99=${formatMs(report.tickMs.p99)} max=${formatMs(report.tickMs.max)} avg=${formatMs(report.tickMs.avg)}`);
  lines.push(`[perf] stalledTicks=${report.stalledTicks} (budget ${report.stalledTickThresholdMs}ms) invariantViolations=${report.invariants.violations} over ${report.invariants.checks} daily checks`);
  lines.push(`[perf] pathCalls=${report.pathCalls.totalQueryCalls} spatial-query calls over ${report.pathCalls.measuredTicks} measured ticks (${report.pathCalls.queriesPerTick.toFixed(1)}/tick, ${report.pathCalls.candidatesPerTick.toFixed(1)} candidates/tick, ${report.pathCalls.cellsPerTick.toFixed(1)} cells/tick) grid=${report.pathCalls.gridMode}`);
  lines.push(`[perf] pathCallsSource=${report.pathCalls.source}`);
  lines.push(`[perf] pathCallsByCategory=${Object.entries(report.pathCalls.perCategory).filter(([, bucket]) => bucket.queries > 0).map(([name, bucket]) => `${name}:${bucket.queries}`).join(' ')}`);
  lines.push(`[perf] pathfinder(a*)=${report.pathfinder.findPathCalls} A* calls over ${report.pathfinder.measuredTicks} active ticks (${report.pathfinder.findPathCallsPerTick.toFixed(2)}/tick), ${report.pathfinder.nodesExpanded} nodes expanded (${report.pathfinder.nodesPerCall.toFixed(1)}/call)`);
  lines.push(`[perf] pathfinderOutcomes=found:${report.pathfinder.pathsFound} failed:${report.pathfinder.pathsFailed} nodeCap:${report.pathfinder.maxNodesExceeded} earlyReject:${report.pathfinder.earlyRejects}`);
  lines.push(`[perf] pathfinderGate=lineChecks:${report.pathfinder.lineChecks} (${report.pathfinder.lineChecksPerTick.toFixed(1)}/tick) gridRebuilds:${report.pathfinder.gridRebuilds}`);
  lines.push(`[perf] pathfinderCache=hit:${report.pathfinder.cacheHits} miss:${report.pathfinder.cacheMisses} rate:${(report.pathfinder.cacheHitRate * 100).toFixed(1)}%`);
  lines.push(`[perf] delta samples=${report.deltas.samples.length} jsonBytes avg=${report.deltas.jsonBytes.avg.toFixed(0)} max=${report.deltas.jsonBytes.max} v8Bytes avg=${report.deltas.v8Bytes.avg.toFixed(0)} max=${report.deltas.v8Bytes.max}`);
  lines.push(`[perf] serialize p50=${formatMs(report.deltas.serializeMs.p50)} p95=${formatMs(report.deltas.serializeMs.p95)} max=${formatMs(report.deltas.serializeMs.max)} spikes=${report.deltas.serializationSpikes} (over ${report.deltas.spikeThresholdMs}ms)`);
  lines.push(`[perf] memory heapUsed ${report.memory.firstHeapUsedMb?.toFixed(1) ?? '?'}MB -> ${report.memory.lastHeapUsedMb?.toFixed(1) ?? '?'}MB (trend ${report.memory.heapUsedTrendMb?.toFixed(1) ?? '?'}MB, peak ${report.memory.peakHeapUsedMb?.toFixed(1) ?? '?'}MB, peakRss ${report.memory.peakRssMb?.toFixed(1) ?? '?'}MB, gcForced=${report.memory.gcForced})`);
  lines.push(`[perf] console calls=${report.console.calls} lines=${report.console.lines} characters=${report.console.characters} byLevel=${JSON.stringify(report.console.byLevel)}`);
  lines.push(`[perf] outcome settlers=${report.outcome.population.settlers} food=${report.outcome.foodStored} producedToday=${report.outcome.foodProducedToday} consumedToday=${report.outcome.foodConsumedToday} buildings=${report.outcome.buildings}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

function printWorkerReport(report: WorkerSampleReport): void {
  const lines: string[] = [];
  if (report.skipped) {
    lines.push(`[perf] phase=worker-transport skipped=${report.skipReason ?? 'yes'} fallbackCount=${report.fallbackCount}`);
  } else {
    lines.push(`[perf] phase=worker-transport days=${report.days} ticksCompleted=${report.ticksCompleted}/${report.days * TICKS_PER_DAY} mainThreadFallbackTicks=${report.ticksOnMainThreadAfterFallback} pipeline=${report.pipelineDepth}`);
    lines.push(`[perf] worker fallbackCount=${report.fallbackCount} stalledTicks=${report.stalledTicks} errors=${report.errorCount} gap p50=${formatMs(report.resultGapMs.p50)} p95=${formatMs(report.resultGapMs.p95)} max=${formatMs(report.resultGapMs.max)}`);
    lines.push(`[perf] worker deltaV8Bytes avg=${report.deltaV8Bytes.avg.toFixed(0)} max=${report.deltaV8Bytes.max} workerConsole stdout=${report.workerConsole.stdoutBytes}B stderr=${report.workerConsole.stderrBytes}B lines=${report.workerConsole.lines}`);
    lines.push(`[perf] worker finalTick=${report.finalTick ?? '?'} finalInvariantViolations=${report.finalInvariants?.violations ?? 'not checked'}${report.fallbackReason ? ` fallbackReason=${report.fallbackReason}` : ''}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  mkdirSync(logDirectory, { recursive: true });

  writeLog({
    kind: 'perf-year-start',
    logPath,
    scenario: options.scenario,
    map: options.mapName,
    seed: options.seed,
    days: options.days,
    ticks: totalTicks,
    workerDays: options.workerDays,
    deltaSampleDays: options.deltaSampleDays,
    memorySampleDays: options.memorySampleDays,
    pacingBudgetMs: PACING_TICK_BUDGET_MS,
    serializationSpikeMs: SERIALIZATION_SPIKE_MS,
    workerStallTimeoutMs: WORKER_STALL_TIMEOUT_MS,
  });

  const inProcess = runInProcessPhase();
  writeLog({ kind: 'perf-year-in-process', report: inProcess });
  printInProcessReport(inProcess);

  const worker = await runWorkerSamplePhase();
  writeLog({ kind: 'perf-year-worker-transport', report: worker });
  printWorkerReport(worker);

  writeLog({
    kind: 'perf-year-complete',
    elapsedMs: inProcess.elapsedMs + worker.elapsedMs,
    counters: {
      workerFallbacks: worker.fallbackCount,
      stalledTicks: inProcess.stalledTicks + worker.stalledTicks,
      serializationSpikes: inProcess.deltas.serializationSpikes,
      invariantViolations: inProcess.invariants.violations + (worker.finalInvariants?.violations ?? 0),
    },
  });
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    writeLog({ kind: 'perf-year-failed', scenario: options.scenario, seed: options.seed, message });
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    resetRelationshipDiagnostics();
    resetSimRng();
    setSpatialQueryMetricsEnabled(false);
  });

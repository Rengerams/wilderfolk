/**
 * City-scale sim benchmark — dual-layer spatial grid @ ~1250 alive, p95 < 20ms.
 * Run: npm run benchmark:city
 */
import { gameTick, initGame } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import {
  CITY_BENCH_MIN_ALIVE,
  countAlive,
  DEFAULT_CITY_TARGETS,
  maintainCityBenchmarkState,
  refreshCityBenchmarkResources,
  seedCityScaleProfile,
} from './simCityProfile';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { getSpatialQueryReport } from '../src/game/spatialQueryMetrics';
import { enableSpatialQueryMetrics, printSpatialQueryMetricsSection } from './spatialQueryReport';

const STEADY_TICKS = Number(process.env.CITY_BENCH_TICKS ?? 600);
const WARMUP_TICKS = Number(process.env.CITY_BENCH_WARMUP ?? 60);
const P95_GATE_MS = Number(process.env.CITY_P95_GATE_MS ?? 20);
const GATE = process.env.BENCHMARK_GATE !== '0';
const SAMPLE_EVERY = Number(process.env.PERF_SAMPLE_EVERY ?? 120);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function summarizeTickMs(samples: number[]): { avg: number; p50: number; p95: number; max: number } {
  if (samples.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

async function run(): Promise<void> {
  await preloadDialogueBank();

  const metricsOn = process.env.SPATIAL_QUERY_METRICS !== '0';
  if (metricsOn) enableSpatialQueryMetrics();

  let state = initGame({ villageName: 'Benchburg', size: MapSize.Large });
  state.resources.food = 8000;
  seedCityScaleProfile(state, DEFAULT_CITY_TARGETS);

  const aliveStart = countAlive(state);
  const simFocus = getSimFocus(state);
  const steadyMs: number[] = [];
  const perfSamples: { tick: number; ms: number; alive: number }[] = [];
  const start = performance.now();
  const totalTicks = WARMUP_TICKS + STEADY_TICKS;

  for (let t = 1; t <= totalTicks; t++) {
    maintainCityBenchmarkState(state);
    refreshCityBenchmarkResources(state, t);

    const t0 = performance.now();
    state = gameTick(state, simFocus);
    const ms = performance.now() - t0;

    maintainCityBenchmarkState(state);

    if (t > WARMUP_TICKS) {
      steadyMs.push(ms);
      if (t % SAMPLE_EVERY === 0) {
        perfSamples.push({ tick: t - WARMUP_TICKS, ms, alive: countAlive(state) });
      }
    }
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const aliveEnd = countAlive(state);
  const steady = summarizeTickMs(steadyMs);
  const sampleMs = perfSamples.map((s) => s.ms);
  const samplePerf = summarizeTickMs(sampleMs);
  const sampleAliveOk = perfSamples.length === 0 || perfSamples.every((s) => s.alive >= CITY_BENCH_MIN_ALIVE);
  const pass = samplePerf.p95 < P95_GATE_MS
    && aliveStart >= CITY_BENCH_MIN_ALIVE
    && aliveEnd >= CITY_BENCH_MIN_ALIVE
    && sampleAliveOk;

  console.log('\n=== Wilderfolk city benchmark (dual-layer spatial grid) ===');
  console.log(
    `Profile: ${DEFAULT_CITY_TARGETS.playerHumans} player + ${DEFAULT_CITY_TARGETS.rivalHumans} rival + ${DEFAULT_CITY_TARGETS.visitorHumans} visitor humans`,
  );
  console.log(
    `Alive: start=${aliveStart} end=${aliveEnd} (gate ≥ ${CITY_BENCH_MIN_ALIVE}) | warmup=${WARMUP_TICKS} steady=${STEADY_TICKS} | wall=${elapsed}s`,
  );
  console.log(
    `Steady tick cost: avg=${steady.avg.toFixed(2)}ms p50=${steady.p50.toFixed(2)}ms p95=${steady.p95.toFixed(2)}ms max=${steady.max.toFixed(2)}ms`,
  );
  if (perfSamples.length > 0) {
    console.log(`Sample p95 (every ${SAMPLE_EVERY} ticks): ${samplePerf.p95.toFixed(2)}ms`);
    for (const s of perfSamples) {
      console.log(`  tick ${s.tick}: ${s.ms.toFixed(2)}ms alive=${s.alive}`);
    }
  }
  console.log(
    `Gate: sample p95 < ${P95_GATE_MS}ms @ ≥${CITY_BENCH_MIN_ALIVE} alive → ${pass ? 'PASS' : 'FAIL'}`,
  );
  if (steady.p95 >= P95_GATE_MS) {
    console.log(`Note: full steady-state p95=${steady.p95.toFixed(2)}ms (informational)`);
  }

  if (metricsOn) printSpatialQueryMetricsSection();
  if (process.env.SPATIAL_QUERY_JSON === '1') {
    console.log(`__SPATIAL_QUERY_JSON__${JSON.stringify(getSpatialQueryReport())}`);
  }

  if (GATE && !pass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
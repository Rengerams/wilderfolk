/**
 * Tick cost vs player-human count (instant seed, no logging).
 * Run: npx tsx scripts/perf-at-pop.ts
 *
 * One axis, one code path: every tier is the **city fixture** (`simCityProfile`) seeded at a
 * different `playerHumans` target, and the same targets are handed to the maintainer each tick. The
 * earlier version seeded extra humans and then let `maintainCityBenchmarkState` pull the colony back
 * to `DEFAULT_CITY_TARGETS`, so all six tiers measured the same 300-human city and the "curve" was
 * flat by construction.
 *
 * A **real save** can be measured instead of the fixture (`PERF_SAVE=<save.json>`): it is loaded
 * through the game's own restore path, ticked as it stands, and **not** maintained or restocked —
 * a saved colony is the one measurement the fixture cannot stand in for (jobs, homes and a real
 * relationship graph).
 *
 * Env:
 *   PERF_TICKS=300        post-warmup ticks per tier
 *   PERF_POPS=300,600,976,1200   tiers to measure
 *   PERF_SAVE=<path>      bench this save instead of the tiers
 *   SIM_FULL_SIM=1        disable the viewport focus throttle (the game's worker ticks *with* it)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getHourOfDay, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { isPlayerHuman } from '../src/game/playerHuman';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { loadNames } from '../src/game/nameLoader';
import { loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import {
  countAlive,
  expectedCityAlive,
  maintainCityBenchmarkState,
  refreshCityBenchmarkResources,
  seedCityScaleProfile,
  DEFAULT_CITY_TARGETS,
  type CityProfileTargets,
} from './simCityProfile';

const TICKS = Number(process.env.PERF_TICKS ?? 300);
const WARMUP = Number(process.env.PERF_WARMUP ?? 30);
/** Print every measured tick, with its position in the in-game day — a spike is either a daily layer
 *  (`tick % TICKS_PER_DAY === 0`) or something that happens at any tick. */
const TRACE = process.env.PERF_TRACE === '1';
const TICKS_PER_DAY_TRACE = TICKS_PER_DAY;
const REPORT = process.env.PERF_REPORT;
const BASELINE = process.env.PERF_BASELINE;

type HourRow = { hour: number; ticks: number; avgMs: number; maxMs: number; p95Ms: number };
type BenchmarkReport = { label: string; ticks: number; warmup: number; population: number; alive: number; averageMs: number; p50Ms: number; p95Ms: number; maxMs: number; ticksPerSecond: number; byHour: HourRow[] };
const benchmarkReports: BenchmarkReport[] = [];

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function showComparison(report: BenchmarkReport, baseline: BenchmarkReport): void {
  const change = (before: number, after: number): string => before <= 0 ? 'n/a' : `${((after / before - 1) * 100).toFixed(1)}%`;
  console.log(`  vs baseline: average ${change(baseline.averageMs, report.averageMs)}, p95 ${change(baseline.p95Ms, report.p95Ms)}, max ${change(baseline.maxMs, report.maxMs)} (negative = faster)`);
  for (const row of report.byHour) {
    const old = baseline.byHour.find((h) => h.hour === row.hour);
    if (old && old.ticks > 0) console.log(`    ${String(row.hour).padStart(2, '0')}:00  ${old.avgMs.toFixed(1)} -> ${row.avgMs.toFixed(1)}ms (${change(old.avgMs, row.avgMs)})`);
  }
}

const TIERS = (process.env.PERF_POPS ?? '300,600,976,1200')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

function countPlayerHumans(state: ReturnType<typeof initGame>): number {
  let n = 0;
  for (const e of state.entities) {
    if (e.alive && e.type === EntityType.Human && isPlayerHuman(e)) n++;
  }
  return n;
}

function bench(
  state: ReturnType<typeof initGame>,
  label: string,
  focus: ReturnType<typeof getSimFocus>,
  targets: CityProfileTargets,
  maintain: boolean,
) {
  const ms: number[] = [];
  const cpuMs: number[] = [];
  const hourMs: number[][] = Array.from({ length: 24 }, () => []);
  for (let t = 1; t <= WARMUP + TICKS; t++) {
    // A saved colony is measured as it stands: the fixture maintainer would top its population,
    // buildings and larder back up to the benchmark targets and change what is being measured.
    if (maintain) {
      maintainCityBenchmarkState(state, expectedCityAlive(targets), targets);
      refreshCityBenchmarkResources(state, t);
    }
    const cpu0 = process.cpuUsage();
    const t0 = performance.now();
    state = gameTick(state, focus);
    const dt = performance.now() - t0;
    const cpu = process.cpuUsage(cpu0);
    const cpuForTick = (cpu.user + cpu.system) / 1000;
    if (maintain) maintainCityBenchmarkState(state, expectedCityAlive(targets), targets);
    if (t > WARMUP) {
      ms.push(dt);
      cpuMs.push(cpuForTick);
      hourMs[getHourOfDay(state.tick)]?.push(dt);
      if (TRACE) {
        const dayTick = state.tick % TICKS_PER_DAY_TRACE === 0;
        console.log(
          `  tick ${state.tick} (day-boundary=${dayTick ? 'yes' : 'no'}) wall=${dt.toFixed(1)}ms cpu=${cpuForTick.toFixed(1)}ms`,
        );
      }
    }
  }
  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const avgCpu = cpuMs.reduce((a, b) => a + b, 0) / cpuMs.length;
  const maxCpu = Math.max(...cpuMs);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  console.log(
    `${label}: humans=${countPlayerHumans(state)} alive=${countAlive(state)} | avg=${avg.toFixed(2)}ms p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms | cpu avg=${avgCpu.toFixed(2)}ms max=${maxCpu.toFixed(2)}ms`,
  );
  const report: BenchmarkReport = {
    label, ticks: ms.length, warmup: WARMUP, population: countPlayerHumans(state), alive: countAlive(state),
    averageMs: avg, p50, p95Ms: p95, maxMs: max, ticksPerSecond: ms.length / (ms.reduce((a, b) => a + b, 0) / 1000),
    byHour: hourMs.map((values, hour) => ({ hour, ticks: values.length, avgMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0, maxMs: values.length ? Math.max(...values) : 0, p95Ms: percentile(values, 0.95) })).filter((row) => row.ticks > 0),
  };
  benchmarkReports.push(report);
  console.log(`  throughput=${report.ticksPerSecond.toFixed(2)} ticks/s`);
  console.log('  slowest clock hours: ' + [...report.byHour].sort((a,b) => b.avgMs-a.avgMs).slice(0, 5).map((h) => `${String(h.hour).padStart(2,'0')}:00 ${h.avgMs.toFixed(1)}ms (max ${h.maxMs.toFixed(1)}ms)`).join(' | '));
  if (BASELINE) {
    const data = JSON.parse(readFileSync(BASELINE, 'utf8')) as { reports?: BenchmarkReport[] };
    const old = data.reports?.find((item) => item.label === report.label);
    if (old) showComparison(report, old);
    else console.log(`  No matching baseline label for ${report.label}`);
  }
  return { avg, p95 };
}

function loadSave(path: string): ReturnType<typeof initGame> {
  const parsed = parseSaveJson(readFileSync(path, 'utf8'));
  if (!parsed.valid) throw new Error(`save refused at parse: ${parsed.valid === false ? parsed.reason : ''}`);
  const loaded = loadGameFromParsed(parsed.parsed);
  if (!loaded) throw new Error('save load returned null');
  // A saved game is usually written paused, and `gameTick` short-circuits on `paused` — the first run
  // of this bench measured 0.00 ms because every tick returned the world untouched.
  loaded.world.paused = false;
  return loaded.world;
}

async function main() {
  await preloadDialogueBank();
  // The game loads the census name pool at boot. A bench that skips it pays for it inside the first
  // tick that needs a name — which is a day boundary — and reports that wait as tick cost.
  await loadNames().catch(() => {});
  const fullSim = process.env.SIM_FULL_SIM === '1';
  const savePath = process.env.PERF_SAVE;

  if (savePath) {
    const state = loadSave(savePath);
    // `PERF_DAY_ONE=1` parks the clock one tick before a day boundary, so the first measured tick is
    // the daily one. Profiling the spike then costs one tick instead of waiting up to 72 for it.
    if (process.env.PERF_DAY_ONE === '1') {
      state.tick = Math.ceil(state.tick / TICKS_PER_DAY_TRACE) * TICKS_PER_DAY_TRACE - 1;
    }
    console.log(
      `Ticks=${TICKS} warmup=${WARMUP} | focus=${fullSim ? 'OFF (full sim)' : 'ON (viewport throttle)'} | save=${basename(savePath)} tick=${state.tick}`,
    );
    bench(
      state,
      `Save ${basename(savePath)}`,
      fullSim ? undefined : getSimFocus(state),
      { ...DEFAULT_CITY_TARGETS, playerHumans: countPlayerHumans(state) },
      false,
    );
    if (REPORT) writeFileSync(REPORT, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), save: basename(savePath), reports: benchmarkReports }, null, 2) + '\n');
    return;
  }

  const focus = getSimFocus(initGame({ size: MapSize.Large }));
  console.log(
    `Ticks=${TICKS} warmup=${WARMUP} | focus=${fullSim ? 'OFF (full sim)' : 'ON (viewport throttle)'} | tiers=${TIERS.join(', ')}`,
  );
  console.log('');

  for (const pop of TIERS) {
    const targets: CityProfileTargets = { ...DEFAULT_CITY_TARGETS, playerHumans: pop };
    const state = initGame({ villageName: 'Bench', size: MapSize.Large });
    state.resources.food = 8000;
    seedCityScaleProfile(state, targets);
    bench(state, `City ${pop} player humans`, fullSim ? undefined : focus, targets, true);
  }
  if (REPORT) writeFileSync(REPORT, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), reports: benchmarkReports }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

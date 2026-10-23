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
 *   PERF_RELOCATION=1   daily housing sweep only; PERF_RELOCATION_REFERENCE=1 compares the original loop
 *   PERF_TICKS=300        post-warmup ticks per tier
 *   PERF_POPS=250,750,1800,3000   tiers to measure
 *   PERF_PROFILE=1      include bounded stage timing summaries
 *   PERF_ROUNDTRIP=1    measure save/reload and verify population retention
 *   PERF_SEED=12345     reproducible generated colony seed
 *   PERF_SAVE=<path>      bench this save instead of the tiers
 *   SIM_FULL_SIM=1        disable the viewport focus throttle (the game's worker ticks *with* it)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beginCommuteRoutePass } from '../src/game/commuteReach';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { getPerformanceSnapshot, setPerformanceProfilingEnabled, type PerformanceSnapshot } from '../src/game/performanceProfiler';
import { enableSeededGlobalRandom } from '../src/game/simRng';
import { sampleDelta, collectInvariantErrors, summarizeLivingPopulation, countRelationships } from './colonyHealth';
import { basename } from 'node:path';
import { getHourOfDay, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { gameTick, initGame } from '../src/game/gameEngine';
import { createCompletedBuilding } from './colonyHealth';
import { moveResident, relocateHouseholdsForCommute } from '../src/game/residencyReconciliation';
import { buildHousingUnits, buildResidenceTraits, listPlayerResidences, pickCommuteRelocation } from '../src/game/residencySelection';
import { buildResidenceOccupancy } from '../src/game/residencyOccupancy';
import { setCurrentPathMap, resetPathGridCaches } from '../src/game/pathfinding';
import { BuildingType } from '../src/game/gameTypes';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { isPlayerHuman } from '../src/game/playerHuman';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { loadNames } from '../src/game/nameLoader';
import { createInitialView } from '../src/game/viewState';
import { loadGameFromParsed, parseSaveJson, buildSaveData } from '../src/game/saveLoad';
import {
  countAlive,
  expectedCityAlive,
  maintainCityBenchmarkState,
  refreshCityBenchmarkResources,
  seedCityScaleProfile,
  DEFAULT_CITY_TARGETS,
  type CityProfileTargets,
} from './simCityProfile';

const ROUNDTRIP = process.env.PERF_ROUNDTRIP === '1';
const PROFILE = process.env.PERF_PROFILE === '1';
const SEED = Number(process.env.PERF_SEED ?? 12345);
const TICKS = Number(process.env.PERF_TICKS ?? 300);
const WARMUP = Number(process.env.PERF_WARMUP ?? 30);
/** Print every measured tick, with its position in the in-game day — a spike is either a daily layer
 *  (`tick % TICKS_PER_DAY === 0`) or something that happens at any tick. */
const TRACE = process.env.PERF_TRACE === '1';
const TICKS_PER_DAY_TRACE = TICKS_PER_DAY;
const REPORT = process.env.PERF_REPORT;
const BASELINE = process.env.PERF_BASELINE;

type HourRow = { hour: number; ticks: number; avgMs: number; maxMs: number; p95Ms: number };
type BenchmarkReport = { label: string; ticks: number; warmup: number; population: number; alive: number; averageMs: number; averageCpuMs: number; p50Ms: number; p95Ms: number; p99Ms: number; overBudgetTicks: number; deltaHash: string; populationSummary: ReturnType<typeof summarizeLivingPopulation>; relationships: ReturnType<typeof countRelationships>; roundtrip: { saveMs: number; loadMs: number; bytes: number; population: number; invariantErrors: string[] } | null; invariantErrors: string[]; profile: PerformanceSnapshot | null; maxMs: number; ticksPerSecond: number; byHour: HourRow[] };
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

const TIERS = (process.env.PERF_POPS ?? '250,750,1800,3000')
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
  setPerformanceProfilingEnabled(false);
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
    if (PROFILE && t === WARMUP + 1) setPerformanceProfilingEnabled(true);
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
  const profile = PROFILE ? getPerformanceSnapshot() : null;
  setPerformanceProfilingEnabled(false);
  const populationSummary = summarizeLivingPopulation(state);
  const relationships = countRelationships(state);
  let roundtrip: BenchmarkReport['roundtrip'] = null;
  if (ROUNDTRIP) {
    const saveStart = performance.now();
    const json = JSON.stringify(buildSaveData(state, createInitialView(state.width, state.height)));
    const saveMs = performance.now() - saveStart;
    const loadStart = performance.now();
    const parsed = parseSaveJson(json);
    if (!parsed.valid) throw new Error('roundtrip save was refused');
    const restored = loadGameFromParsed(parsed.parsed);
    if (!restored) throw new Error('roundtrip restore failed');
    const loadMs = performance.now() - loadStart;
    const restoredPopulation = countPlayerHumans(restored.world);
    if (restoredPopulation !== countPlayerHumans(state)) throw new Error('roundtrip changed the player population');
    roundtrip = { saveMs, loadMs, bytes: Buffer.byteLength(json), population: restoredPopulation, invariantErrors: collectInvariantErrors(restored.world) };
  }
  const report: BenchmarkReport = {
    label, ticks: ms.length, warmup: WARMUP, population: countPlayerHumans(state), alive: countAlive(state),
    averageMs: avg, averageCpuMs: avgCpu, p50Ms: p50, p95Ms: p95, p99Ms: percentile(ms, 0.99),
    overBudgetTicks: ms.filter((value) => value > 1000).length,
    deltaHash: sampleDelta(state).jsonHash, populationSummary, relationships, roundtrip, invariantErrors: collectInvariantErrors(state),
    profile, maxMs: max, ticksPerSecond: ms.length / (ms.reduce((a, b) => a + b, 0) / 1000),
    byHour: hourMs.map((values, hour) => ({ hour, ticks: values.length, avgMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0, maxMs: values.length ? Math.max(...values) : 0, p95Ms: percentile(values, 0.95) })).filter((row) => row.ticks > 0),
  };
  setPerformanceProfilingEnabled(false);
  benchmarkReports.push(report);
  // Machine-readable, unrounded result for runtime comparisons; human lines remain unchanged.
  console.log('PERF_RESULT ' + JSON.stringify({ label: report.label, humans: report.population, alive: report.alive, p95Ms: report.p95Ms, averageMs: report.averageMs, deltaHash: report.deltaHash }));
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

/** Repeat the real daily sweep with jobs, pupils, and either zero or spare vacant homes. */
function benchmarkRelocation(population: number, spareHomes: number): void {
  resetPathGridCaches();
  const state = initGame({ size: MapSize.Large, seed: SEED });
  seedCityScaleProfile(state, { ...DEFAULT_CITY_TARGETS, playerHumans: population });
  const humans = state.entities.filter((entity) => entity.alive && isPlayerHuman(entity));
  state.buildings = [];
  for (let i = 0; i < humans.length; i += 3) {
    const x = 200 + (i % 30) * 32;
    const y = 200 + Math.floor(i / 30) * 32;
    const home = createCompletedBuilding(state, BuildingType.House, x, y);
    const job = createCompletedBuilding(state, BuildingType.Farm, x + 300, y);
    const school = createCompletedBuilding(state, BuildingType.School, x + 96, y);
    const family = humans.slice(i, i + 3);
    for (const member of family) {
      member.age = 30;
      member.isJuvenile = false;
      member.partnerId = undefined;
      member.motherId = undefined;
      member.fatherId = undefined;
      member.childrenIds = [];
      member.residenceBuildingId = home.id;
      member.workerBuildingId = job.id;
    }
    if (family.length === 3) {
      family[0].gender = 'female';
      family[1].gender = 'male';
      family[0].partnerId = family[1].id;
      family[1].partnerId = family[0].id;
      family[2].age = 8;
      family[2].isJuvenile = true;
      family[2].motherId = family[0].id;
      family[2].fatherId = family[1].id;
      family[2].workerBuildingId = undefined;
      family[2].schoolBuildingId = school.id;
    }
  }
  for (let i = 0; i < spareHomes; i++) {
    createCompletedBuilding(state, BuildingType.House, 500 + (i % 10) * 48, 200 + Math.floor(i / 10) * 48);
  }
  const residences = listPlayerResidences(state.buildings);
  const assignments = humans.map((human) => human.residenceBuildingId);
  const units = buildHousingUnits(humans);
  const times: number[] = [];
  let moved = 0;
  for (let sample = 0; sample < 12; sample++) {
    humans.forEach((human, i) => { human.residenceBuildingId = assignments[i]; });
    setCurrentPathMap(state.worldMap!, state.buildings);
    const occupancy = buildResidenceOccupancy(humans);
    const traits = buildResidenceTraits(humans);
    const start = performance.now();
    if (process.env.PERF_RELOCATION_REFERENCE === '1') {
      const cache = new Map<string, number>();
      beginCommuteRoutePass();
      for (const unit of units) {
        const target = pickCommuteRelocation(unit, humans, residences, state.buildings, occupancy, cache,
          SPECIES_CONFIG[EntityType.Human].speed);
        if (target === undefined) continue;
        for (const member of unit) moveResident(member, target, 'commute', { occupancy, traits });
      }
    } else {
      relocateHouseholdsForCommute(units, humans, residences, state.buildings, occupancy, traits);
    }
    times.push(performance.now() - start);
    moved = humans.filter((human, i) => human.residenceBuildingId !== assignments[i]).length;
  }
  console.log('RELOCATION_RESULT ' + JSON.stringify({ population, spareHomes, households: units.length,
    reference: process.env.PERF_RELOCATION_REFERENCE === '1',
    coldMs: times[0], warmMedianMs: percentile(times.slice(2), 0.5), p95Ms: percentile(times.slice(2), 0.95), moved,
    assignmentHash: createHash('sha256').update(JSON.stringify(humans.map((human) => [human.id, human.residenceBuildingId]))).digest('hex') }));
}

async function main() {
  enableSeededGlobalRandom();
  await preloadDialogueBank();
  // The game loads the census name pool at boot. A bench that skips it pays for it inside the first
  // tick that needs a name — which is a day boundary — and reports that wait as tick cost.
  await loadNames().catch(() => {});
  if (process.env.PERF_RELOCATION === '1') {
    for (const population of TIERS) {
      benchmarkRelocation(population, 0);
      benchmarkRelocation(population, Math.ceil(population / 30));
    }
    return;
  }
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
    if (REPORT) writeFileSync(REPORT, JSON.stringify({ version: 2, node: process.version, platform: process.platform, arch: process.arch, seed: SEED, fullSim, profiling: PROFILE, createdAt: new Date().toISOString(), save: basename(savePath), reports: benchmarkReports }, null, 2) + '\n');
    return;
  }

  const focus = getSimFocus(initGame({ size: MapSize.Large, seed: SEED }));
  console.log(
    `Ticks=${TICKS} warmup=${WARMUP} | focus=${fullSim ? 'OFF (full sim)' : 'ON (viewport throttle)'} | tiers=${TIERS.join(', ')}`,
  );
  console.log('');

  for (const pop of TIERS) {
    const targets: CityProfileTargets = { ...DEFAULT_CITY_TARGETS, playerHumans: pop };
    const state = initGame({ villageName: 'Bench', size: MapSize.Large, seed: SEED });
    state.resources.food = 8000;
    seedCityScaleProfile(state, targets);
    bench(state, `City ${pop} player humans`, fullSim ? undefined : focus, targets, true);
  }
  if (REPORT) writeFileSync(REPORT, JSON.stringify({ version: 2, node: process.version, platform: process.platform, arch: process.arch, seed: SEED, fullSim, profiling: PROFILE, createdAt: new Date().toISOString(), reports: benchmarkReports }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Headless 30-minute session (~1800 ticks @ 1 tick/s) with village growth + family stats.
 * Run: npx tsx scripts/simulate-30min.ts
 *
 * Env:
 *   SIM_PROFILE=city — 300 player humans + neighbors @ ~1250 alive (spatial grid gate)
 *   BENCHMARK_GATE=1 — exit 1 when city profile p95 >= 20ms or alive < 1200 in samples
 */
import { getSimFocus } from './simFocus';
import {
  initGame,
  gameTick,
  recruitSettler,
  EntityType,
  BuildingType,
} from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { tryPlaceBuilding } from './simBuildUtils';
import type { WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/groupEvents';
import {
  CITY_BENCH_MIN_ALIVE,
  countAlive,
  DEFAULT_CITY_TARGETS,
  maintainCityBenchmarkState,
  refreshCityBenchmarkResources,
  seedCityScaleProfile,
} from './simCityProfile';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { enableSpatialQueryMetrics, printSpatialQueryMetricsSection } from './spatialQueryReport';

const SIM_PROFILE = (process.env.SIM_PROFILE ?? 'village').toLowerCase();
const IS_CITY = SIM_PROFILE === 'city';
const TICKS_PER_REAL_MINUTE = 60;
const SIM_MINUTES = Number(process.env.SIM_MINUTES ?? (IS_CITY ? 10 : 1200));
const TOTAL_TICKS = TICKS_PER_REAL_MINUTE * SIM_MINUTES;
const PERF_SAMPLE_EVERY = Number(process.env.PERF_SAMPLE_EVERY ?? 120);
const P95_GATE_MS = Number(process.env.CITY_P95_GATE_MS ?? 20);
const MIN_ALIVE_SAMPLE = Number(process.env.CITY_MIN_ALIVE ?? CITY_BENCH_MIN_ALIVE);
const BENCHMARK_GATE = process.env.BENCHMARK_GATE !== '0' && IS_CITY;

type PerfSample = {
  tick: number;
  ms: number;
  alive: number;
  humans: number;
  grass: number;
};

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

function tryPlaceNear(state: WorldState, type: BuildingType, cx: number, cy: number): WorldState {
  const { state: next, ok } = tryPlaceBuilding(state, type, cx, cy);
  return ok ? next : state;
}

type ScheduledAction = { at: number; fn: (s: WorldState) => WorldState; label: string };

function buildScenario(cx: number, cy: number): ScheduledAction[] {
  const place = (at: number, label: string, type: BuildingType, ox = 0, oy = 0) => ({
    at,
    label,
    fn: (s: WorldState) => tryPlaceNear(s, type, cx + ox, cy + oy),
  });
  const recruit = (at: number) => ({
    at,
    label: 'Recruit settler',
    fn: (s: WorldState) => recruitSettler(s),
  });

  return [
    place(1, 'House A', BuildingType.House),
    place(24, 'Farm', BuildingType.Farm, 60, 0),
    place(48, 'House B', BuildingType.House, -80, 40),
    place(72, 'Lumber mill', BuildingType.LumberMill, 120, -40),
    place(96, 'Well', BuildingType.Well, -30, -60),
    recruit(120),
    place(150, 'Quarry', BuildingType.Quarry, -140, -30),
    recruit(180),
    place(210, 'House C', BuildingType.House, 20, 100),
    recruit(300),
    place(360, 'Church', BuildingType.Church, -60, 80),
    recruit(420),
    place(480, 'House D', BuildingType.House, 100, 60),
    place(540, 'Silo', BuildingType.Silo, 40, -100),
    recruit(600),
    place(720, 'Barn', BuildingType.Barn, 80, 40),
    recruit(780),
    place(900, 'House E', BuildingType.House, -100, -80),
    recruit(1020),
    place(1080, 'Workshop', BuildingType.Workshop, 140, 20),
    recruit(1200),
    place(1320, 'House F', BuildingType.House, 0, -120),
    recruit(1440),
    recruit(1560),
    recruit(1680),
  ];
}

function countMarriedPairs(humans: ReturnType<typeof initGame>['entities']): number {
  const seen = new Set<number>();
  let pairs = 0;
  for (const h of humans) {
    if (!h.partnerId || seen.has(h.id)) continue;
    const partner = humans.find((p) => p.id === h.partnerId);
    if (partner?.alive) {
      seen.add(h.id);
      seen.add(partner.id);
      pairs++;
    }
  }
  return pairs;
}

async function runSimulation(): Promise<void> {
  await preloadDialogueBank();
  if (IS_CITY) enableSpatialQueryMetrics();

  let state = initGame({
    villageName: IS_CITY ? 'Gridburg' : 'Simville',
    size: IS_CITY ? MapSize.Large : undefined,
  });
  state.resources.wood = 4000;
  state.resources.stone = 2000;
  state.resources.food = IS_CITY ? 8000 : 1200;
  state.resources.gold = 400;

  if (IS_CITY) {
    seedCityScaleProfile(state, DEFAULT_CITY_TARGETS);
  }

  const cx = state.width / 2;
  const cy = state.height / 2;
  const actions = IS_CITY ? [] : buildScenario(cx, cy);
  const milestones: string[] = [];
  const perfSamples: PerfSample[] = [];
  const allTickMs: number[] = [];
  const simFocus = getSimFocus(state);
  const start = performance.now();

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    for (const action of actions) {
      if (action.at === t) {
        const before = state.humanPopulation;
        state = action.fn(state);
        const after = state.humanPopulation;
        const recruited = after > before;
        milestones.push(`tick ${t}: ${action.label}${recruited ? ' (+1 settler)' : ''}`);
      }
    }
    if (IS_CITY) {
      maintainCityBenchmarkState(state, MIN_ALIVE_SAMPLE);
      refreshCityBenchmarkResources(state, t);
    }
    const tickStart = performance.now();
    state = gameTick(state, simFocus);
    const tickMs = performance.now() - tickStart;
    allTickMs.push(tickMs);

    if (IS_CITY) {
      maintainCityBenchmarkState(state, MIN_ALIVE_SAMPLE);
    }

    const alive = countAlive(state);

    if (t % PERF_SAMPLE_EVERY === 0) {
      perfSamples.push({
        tick: t,
        ms: tickMs,
        alive,
        humans: state.humanPopulation,
        grass: state.wildlifeCounts.grass,
      });
      const day = t / 24;
      milestones.push(
        `— day ${day.toFixed(0)}: camp=${state.humanPopulation}, entities=${alive}, grass=${state.wildlifeCounts.grass}, food=${state.resources.food}, year=${state.year}`,
      );
    }
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const children = humans.filter((h) => h.isJuvenile);
  const adults = humans.filter((h) => !h.isJuvenile);
  const singles = adults.filter((h) => h.relationshipStatus === 'single' && !h.pregnant);
  const expecting = adults.filter((h) => h.relationshipStatus === 'expecting' || h.pregnant);
  const marriedPairs = countMarriedPairs(humans);
  const bastardChildren = humans.filter((h) => h.isBastard).length;
  const wildkin = state.entities.filter((e) => e.alive && e.type === EntityType.Wildkin).length;

  const log = state.eventLog;
  const marriages = log.filter((e) => e.type === 'marriage').length;
  const births = log.filter((e) => e.type === 'birth').length;
  const wildkinBirths = log.filter((e) => e.type === 'birth' && e.message.includes('Wildkin')).length;
  const humanBirths = births - wildkinBirths;
  const bastardBirths = log.filter((e) => e.type === 'birth' && e.message.includes('bastard')).length;
  const scandals = log.filter((e) => e.type === 'scandal').length;
  const playerDeaths = log.filter((e) => e.type === 'death').length;

  const completedBuildings = state.buildings.filter((b) => b.completed && b.faction !== 'rival');
  const houses = completedBuildings.filter((b) => b.type === BuildingType.House || b.type === BuildingType.Mansion);

  console.log(`\n=== Wilderfolk ${IS_CITY ? 'city spatial-grid' : '30-minute'} simulation ===`);
  console.log(`Profile: ${SIM_PROFILE} | Ticks: ${TOTAL_TICKS} (~${SIM_MINUTES} min @ 1×) | Wall time: ${elapsed}s`);
  console.log(`Game calendar: Year ${state.year}, Day ${state.dayInYear} (~${Math.floor(state.tick / 24)} total days)`);

  console.log('\n--- Camp population ---');
  console.log(`Total in camp: ${humans.length}`);
  console.log(`  Adults: ${adults.length}`);
  console.log(`  Children (living): ${children.length}`);
  console.log(`  Married couples: ${marriedPairs}`);
  console.log(`  Singles (adults): ${singles.length}`);
  console.log(`  Pregnant / expecting: ${expecting.length}`);
  console.log(`  Living bastards: ${bastardChildren}`);
  console.log(`  Wildkin in valley: ${wildkin}`);

  console.log('\n--- Life events (event log) ---');
  console.log(`Marriages: ${marriages}`);
  console.log(`Births (all): ${births}`);
  console.log(`  Human baby births: ${humanBirths}`);
  console.log(`  Wildkin births: ${wildkinBirths}`);
  console.log(`  Bastard births: ${bastardBirths}`);
  console.log(`Scandals: ${scandals}`);
  console.log(`Death log entries: ${playerDeaths}`);

  console.log('\n--- Village ---');
  console.log(`Completed buildings: ${completedBuildings.length} (${houses.length} houses)`);
  console.log(`Resources: food=${state.resources.food}, wood=${state.resources.wood}, stone=${state.resources.stone}, gold=${state.resources.gold}`);
  console.log(`Reputation: ${state.villageReputation} | Ecosystem: ${state.ecosystemHealth}%`);
  console.log(
    `Wildlife: ${state.wildlifeCounts.rabbits} rabbits, ${state.wildlifeCounts.deer} deer, ${state.wildlifeCounts.wolves} wolves, ${state.wildlifeCounts.grass} grass`,
  );

  const aliveEnd = state.entities.filter((e) => e.alive).length;
  const overall = summarizeTickMs(allTickMs);
  console.log('\n--- Performance ---');
  console.log(`Alive entities (end): ${aliveEnd}`);
  console.log(
    `Tick cost (all ${TOTAL_TICKS} ticks): avg=${overall.avg.toFixed(2)}ms p50=${overall.p50.toFixed(2)}ms p95=${overall.p95.toFixed(2)}ms max=${overall.max.toFixed(2)}ms`,
  );
  console.log(`Budget @ 60fps sim: ${(1000 / 60).toFixed(1)}ms/tick | @ 10× speed: ${(1000 / 600).toFixed(2)}ms/tick`);

  if (perfSamples.length > 0) {
    console.log(`\n--- Perf samples (every ${PERF_SAMPLE_EVERY} ticks) ---`);
    for (const s of perfSamples) {
      console.log(
        `tick ${s.tick}: ${s.ms.toFixed(2)}ms | humans=${s.humans} alive=${s.alive} grass=${s.grass}`,
      );
    }
  }

  if (IS_CITY) {
    const sampleAliveOk = perfSamples.every((s) => s.alive >= MIN_ALIVE_SAMPLE);
    const sampleMs = perfSamples.map((s) => s.ms);
    const samplePerf = summarizeTickMs(sampleMs);
    const perfOk = samplePerf.p95 < P95_GATE_MS && sampleAliveOk;
    console.log('\n--- Spatial grid gate (city profile) ---');
    console.log(`Samples alive ≥ ${MIN_ALIVE_SAMPLE}: ${sampleAliveOk ? 'PASS' : 'FAIL'}`);
    console.log(
      `Sample p95 < ${P95_GATE_MS}ms: ${samplePerf.p95 < P95_GATE_MS ? 'PASS' : 'FAIL'} (${samplePerf.p95.toFixed(2)}ms)`,
    );
    console.log(`Overall tick p95: ${overall.p95.toFixed(2)}ms (informational)`);
    console.log(`Overall: ${perfOk ? 'PASS' : 'FAIL'}`);
    printSpatialQueryMetricsSection();
    if (BENCHMARK_GATE && !perfOk) process.exit(1);
  }

  if (!IS_CITY) {
    console.log('\n--- Milestones (every 5 game-days) ---');
    for (const m of milestones) console.log(m);
  }
}

runSimulation().catch((err) => {
  console.error(err);
  process.exit(1);
});
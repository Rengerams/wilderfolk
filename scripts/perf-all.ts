/**
 * Wilderfolk — consolidated performance benchmark.
 *
 * Runs exactly: 200, 400, 600, 800, 1000, 1200 humans.
 * Every tier reports wall-clock tick timing and spatial-query metrics.
 * The final 1200-human tier additionally reports CPU layer shares and
 * caller-level attribution for radius-query helpers.
 *
 * Run from the project root:
 *   PERF_TICKS=120 PERF_WARMUP=30 SIM_FULL_SIM=1 npx tsx scripts/perf-all.ts
 *
 * Options:
 *   SIM_FULL_SIM=1          run the complete simulation; 0 = focus mode
 *   SIM_STRIP_ECOLOGY=1     remove grass and trees intentionally
 *   USE_SPATIAL_GRID=0      force naive spatial fallback
 *   SIM_SPEED=1             simulated game speed for acceptance budget
 *   SIM_ALL_PROFILE=1       CPU-profile every tier instead of only 1200
 */
import { Session } from 'node:inspector/promises';
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { isPlayerHuman } from '../src/game/groupEvents';
import {
  getSpatialQueryReport,
  resetSpatialQuerySession,
  setSpatialQueryMetricsEnabled,
} from '../src/game/spatialQueryMetrics';

type CpuNode = {
  id: number;
  callFrame: { functionName?: string };
  children?: number[];
};

type CpuProfile = {
  nodes: CpuNode[];
  samples?: number[];
  timeDeltas?: number[];
};

const TIERS = [200, 400, 600, 800, 1000, 1200] as const;
const TICKS = Number(process.env.PERF_TICKS ?? 60);
const WARMUP = Number(process.env.PERF_WARMUP ?? 30);
const FULL_SIM = process.env.SIM_FULL_SIM === '1';
const STRIP_ECOLOGY = process.env.SIM_STRIP_ECOLOGY === '1';
const SIM_SPEED = Number(process.env.SIM_SPEED ?? 1);
const INTERVAL_MS = 1000 / (1.5 * SIM_SPEED);
const PROFILE_ALL = process.env.SIM_ALL_PROFILE === '1';

const QUERY_NAMES = new Set([
  'forEachInRadius',
  'findClosestInRadius',
  'naiveForEachInRadius',
  'naiveFindClosestInRadius',
  'forEachInEntityGrid',
  'findClosestInEntityGrid',
]);

const WRAPPER_NAMES = new Set([...QUERY_NAMES, 'withSpatialQuery']);

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function seedHumans(
  state: ReturnType<typeof initGame>,
  pop: number,
  random: () => number,
): void {
  for (let i = 0; i < pop; i++) {
    const human = createEntity(
      EntityType.Human,
      state.width / 2 + (random() - 0.5) * 400,
      state.height / 2 + (random() - 0.5) * 400,
      state.nextEntityId++,
      300,
    );

    human.name = `S${i}`;
    human.surname = 'Benchmark';
    human.gender = i % 2 === 0 ? 'male' : 'female';
    human.isJuvenile = false;
    human.age = 25;
    state.entities.push(human);
    state.humanPopulation++;
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)] ?? 0;
}

function acceptability(p95: number): string {
  if (p95 <= INTERVAL_MS * 0.5) return 'ACCEPTABLE';
  if (p95 <= INTERVAL_MS) return 'WATCH';
  return 'OVER BUDGET';
}

function parentsOf(profile: CpuProfile): Map<number, number> {
  const parents = new Map<number, number>();

  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parents.set(child, node.id);
    }
  }

  return parents;
}

function nameOf(profile: CpuProfile, id: number): string {
  return profile.nodes.find((node) => node.id === id)?.callFrame.functionName
    || '(anonymous)';
}

function stack(
  profile: CpuProfile,
  sample: number,
  parents: Map<number, number>,
): string[] {
  const result: string[] = [];
  const seen = new Set<number>();
  let id: number | undefined = sample;

  while (id != null && !seen.has(id) && result.length < 25) {
    seen.add(id);
    result.push(nameOf(profile, id));
    id = parents.get(id);
  }

  return result;
}

function queryCaller(
  names: string[],
): { caller: string; query: string } | undefined {
  const queryIndex = names.findIndex((name) => QUERY_NAMES.has(name));
  if (queryIndex < 0) return undefined;

  const caller = names.slice(queryIndex + 1).find((name) =>
    name !== '(anonymous)'
    && !WRAPPER_NAMES.has(name)
    && !['tickHumans', 'tickWildlife', 'gameTick'].includes(name),
  ) ?? '(unresolved)';

  return { caller, query: names[queryIndex] };
}

function sampled(
  profile: CpuProfile,
  names: Set<string>,
): { count: number; ms: number } {
  const ids = new Set(
    profile.nodes
      .filter((node) => names.has(node.callFrame.functionName ?? ''))
      .map((node) => node.id),
  );

  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let count = 0;
  let ms = 0;

  for (let i = 0; i < samples.length; i++) {
    if (ids.has(samples[i])) {
      count++;
      ms += (deltas[i] ?? 0) / 1000;
    }
  }

  return { count, ms };
}

async function runTier(pop: number, detailed: boolean): Promise<void> {
  const state = initGame({ villageName: `AllProfile${pop}`, size: MapSize.Large });
  state.resources.food = 999999;
  state.resources.wood = 99999;
  state.resources.gold = 99999;
  state.resources.iron = 99999;
  state.resources.stone = 99999;

  if (STRIP_ECOLOGY) {
    state.entities = state.entities.filter(
      (entity) => entity.type !== EntityType.Tree && entity.type !== EntityType.Grass,
    );
  }

  // Same population layout for grid and naive runs at the same tier.
  seedHumans(state, pop, seededRandom(0x5eed + pop));

  // Warmup is excluded from both spatial metrics and wall-clock measurements.
  setSpatialQueryMetricsEnabled(false);
  for (let i = 0; i < WARMUP; i++) {
    gameTick(state, FULL_SIM ? undefined : state);
  }

  resetSpatialQuerySession();
  setSpatialQueryMetricsEnabled(true);

  const session = detailed || PROFILE_ALL ? new Session() : undefined;
  if (session) {
    session.connect();
    await session.post('Profiler.enable');
    await session.post('Profiler.start');
  }

  const times: number[] = [];
  const started = performance.now();

  for (let i = 0; i < TICKS; i++) {
    const startedTick = performance.now();
    gameTick(state, FULL_SIM ? undefined : state);
    times.push(performance.now() - startedTick);
  }

  const wall = performance.now() - started;
  const profile = session
    ? (await session.post('Profiler.stop') as unknown as { profile: CpuProfile }).profile
    : undefined;

  session?.disconnect();
  setSpatialQueryMetricsEnabled(false);

  const p95 = percentile(times, 0.95);
  const scenery = new Set([EntityType.Tree, EntityType.Grass]);
  const alive = state.entities.filter(
    (entity) => entity.alive && !scenery.has(entity.type),
  ).length;
  const humans = state.entities.filter(
    (entity) => entity.alive && isPlayerHuman(entity),
  ).length;
  const report = getSpatialQueryReport();

  console.log(
    `\n${pop} humans | avg=${(wall / TICKS).toFixed(2)}ms `
    + `p95=${p95.toFixed(2)}ms | ${acceptability(p95)} `
    + `| alive=${alive} humans=${humans}`,
  );
  console.log(
    `  gridMode=${report.gridMode} metricsTicks=${report.ticks} `
    + `interval=${INTERVAL_MS.toFixed(1)}ms `
    + `targetP95<=${INTERVAL_MS.toFixed(1)}ms`,
  );
  console.log(
    '  spatial category                         '
    + 'queries/tick candidates/tick cells/tick',
  );

  for (const [category, bucket] of Object.entries(report.perTick)) {
    if (bucket.queries || bucket.candidates || bucket.cells) {
      console.log(
        `  ${category.padEnd(38)} `
        + `${bucket.queries.toFixed(1).padStart(11)} `
        + `${bucket.candidates.toFixed(1).padStart(15)} `
        + `${bucket.cells.toFixed(1).padStart(10)}`,
      );
    }
  }

  if (!profile) return;

  const total = profile.samples?.length ?? 0;
  console.log(`  CPU samples=${total}`);

  for (const [label, names] of Object.entries({
    realtime: new Set(['tickLayerRealtime']),
    systems: new Set(['tickLayerSystems']),
    assign: new Set(['tickLayerAssign']),
    daily: new Set(['tickLayerDaily']),
    humans: new Set(['tickHumans']),
  })) {
    const value = sampled(profile, names);
    console.log(
      `  layer ${label.padEnd(9)} `
      + `samples=${String(value.count).padStart(5)} `
      + `share=${(total ? value.count / total * 100 : 0).toFixed(2).padStart(6)}% `
      + `estimated=${value.ms.toFixed(1).padStart(8)}ms`,
    );
  }

  const parents = parentsOf(profile);
  const callers = new Map<string, number>();

  for (const sample of profile.samples ?? []) {
    const hit = queryCaller(stack(profile, sample, parents));
    if (hit) {
      const key = `${hit.caller} | ${hit.query}`;
      callers.set(key, (callers.get(key) ?? 0) + 1);
    }
  }

  const totalCallerSamples = [...callers.values()]
    .reduce((sum, value) => sum + value, 0);

  console.log('  query CPU by nearest caller:');
  for (const [key, count] of [...callers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)) {
    console.log(
      `    ${key.padEnd(65)} `
      + `samples=${String(count).padStart(5)} `
      + `share=${(count / Math.max(1, totalCallerSamples) * 100).toFixed(2)}%`,
    );
  }
}

async function main(): Promise<void> {
  await preloadDialogueBank();

  console.log(
    `WILDERFOLK CONSOLIDATED PERFORMANCE TEST | `
    + `tiers=${TIERS.join(', ')} | ticks=${TICKS} warmup=${WARMUP}`,
  );
  console.log(
    `mode=${FULL_SIM ? 'FULL SIM' : 'focus'} `
    + `ecology=${STRIP_ECOLOGY ? 'stripped' : 'preserved'} `
    + `speed=${SIM_SPEED}x `
    + `grid=${process.env.USE_SPATIAL_GRID === '1'
      ? 'spatial grid on'
      : process.env.USE_SPATIAL_GRID === '0'
        ? 'naive fallback forced'
        : 'spatial grid default-on'}`,
  );
  console.log(
    `acceptability: ACCEPTABLE p95<=${(INTERVAL_MS * 0.5).toFixed(1)}ms; `
    + `WATCH p95<=${INTERVAL_MS.toFixed(1)}ms; `
    + `OVER BUDGET above ${INTERVAL_MS.toFixed(1)}ms.`,
  );

  for (const pop of TIERS) {
    await runTier(pop, pop === 1200 || PROFILE_ALL);
  }

  console.log(
    '\nFINAL INTERPRETATION: use the 1200-human section for the detailed '
    + 'bottleneck. Compare gridMode, spatial candidates, layer shares, '
    + 'and query callers together.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};

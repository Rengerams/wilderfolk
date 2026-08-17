/**
 * External layer profiler — does not modify gameTick or any tick layer.
 *
 * Runs one independent V8 CPU profile per population tier and reports the
 * CPU share of tickLayerRealtime, tickLayerSystems, and tickLayerDaily.
 * Grass and trees remain in the world unless SIM_STRIP_ECOLOGY=1 is supplied.
 *
 * Run:
 *   PERF_TICKS=120 SIM_FULL_SIM=1 npx tsx scripts/perf-layer-profile.ts
 *
 * Optional:
 *   SIM_LAYER_MAX_POP=1200   highest tier, in 200-human increments
 *   PERF_WARMUP=30
 *   SIM_STRIP_ECOLOGY=1      intentionally remove grass and trees
 */
import { Session } from 'node:inspector/promises';
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';

const MAX_POP = Number(process.env.SIM_LAYER_MAX_POP ?? 1200);
const TIERS = Array.from({ length: Math.floor(MAX_POP / 200) + 1 }, (_, index) => index * 200);
const TICKS = Number(process.env.PERF_TICKS ?? 120);
const WARMUP = Number(process.env.PERF_WARMUP ?? 30);
const FULL_SIM = process.env.SIM_FULL_SIM === '1';
const STRIP_ECOLOGY = process.env.SIM_STRIP_ECOLOGY === '1';
const SIM_SPEED = Number(process.env.SIM_SPEED ?? 1);
const BASE_TICKS_PER_SECOND = 1.5;
const TICK_INTERVAL_MS = 1000 / (BASE_TICKS_PER_SECOND * SIM_SPEED);

type CpuNode = {
  id: number;
  callFrame: { functionName?: string; url?: string };
  children?: number[];
};

type CpuProfile = {
  nodes: CpuNode[];
  samples?: number[];
  timeDeltas?: number[];
};

function seedHumans(state: ReturnType<typeof initGame>, pop: number): void {
  for (let i = 0; i < pop; i++) {
    const h = createEntity(
      EntityType.Human,
      state.width / 2 + (Math.random() - 0.5) * 400,
      state.height / 2 + (Math.random() - 0.5) * 400,
      state.nextEntityId++,
      300,
    );
    h.name = `S${i}`;
    h.surname = 'Profile';
    h.gender = i % 2 === 0 ? 'male' : 'female';
    h.isJuvenile = false;
    h.age = 25;
    state.entities.push(h);
    state.humanPopulation++;
  }
}

function findNodeIds(profile: CpuProfile, names: Set<string>): number[] {
  return profile.nodes
    .filter((node) => names.has(node.callFrame.functionName ?? ''))
    .map((node) => node.id);
}

function subtreeIds(profile: CpuProfile, roots: number[]): Set<number> {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const result = new Set<number>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id == null || result.has(id)) continue;
    result.add(id);
    const node = byId.get(id);
    for (const child of node?.children ?? []) pending.push(child);
  }
  return result;
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

function acceptability(p95Ms: number): string {
  if (p95Ms <= TICK_INTERVAL_MS * 0.5) return 'ACCEPTABLE';
  if (p95Ms <= TICK_INTERVAL_MS) return 'WATCH';
  return 'OVER BUDGET';
}

function sampledTimeMs(profile: CpuProfile, ids: Set<number>): { samples: number; ms: number } {
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let count = 0;
  let ms = 0;
  for (let i = 0; i < samples.length; i++) {
    if (!ids.has(samples[i])) continue;
    count++;
    ms += (deltas[i] ?? 0) / 1000;
  }
  return { samples: count, ms };
}

async function profileTier(pop: number): Promise<void> {
  const state = initGame({ villageName: `LayerProfile${pop}`, size: MapSize.Large });
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
  seedHumans(state, pop);
  const focus = FULL_SIM ? undefined : getSimFocus(state);

  for (let i = 0; i < WARMUP; i++) gameTick(state, focus);

  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.start');
  const wallSamples: number[] = [];
  const wallStart = performance.now();
  for (let i = 0; i < TICKS; i++) {
    const tickStart = performance.now();
    gameTick(state, focus);
    wallSamples.push(performance.now() - tickStart);
  }
  const wallMs = performance.now() - wallStart;
  const wallP95 = percentile(wallSamples, 0.95);
  const result = await session.post('Profiler.stop') as unknown as { profile: CpuProfile };
  session.disconnect();

  const profile = result.profile;
  const totalSamples = profile.samples?.length ?? 0;
  const layerNames = {
    realtime: new Set(['tickLayerRealtime']),
    systems: new Set(['tickLayerSystems']),
    daily: new Set(['tickLayerDaily']),
  } as const;

  console.log(`\n${pop} humans | wall=${wallMs.toFixed(1)}ms | avg=${(wallMs / TICKS).toFixed(2)}ms/tick | p95=${wallP95.toFixed(2)}ms | CPU samples=${totalSamples}`);
  console.log(`  acceptability=${acceptability(wallP95)} | speed=${SIM_SPEED}x | tick interval=${TICK_INTERVAL_MS.toFixed(1)}ms | p95 target<=${TICK_INTERVAL_MS.toFixed(1)}ms`);
  for (const [name, functionNames] of Object.entries(layerNames)) {
    const roots = findNodeIds(profile, functionNames);
    const measured = sampledTimeMs(profile, subtreeIds(profile, roots));
    const share = totalSamples > 0 ? (measured.samples / totalSamples) * 100 : 0;
    console.log(
      `  ${name.padEnd(8)} samples=${String(measured.samples).padStart(5)} share=${share.toFixed(1).padStart(5)}% estimated=${measured.ms.toFixed(1).padStart(8)}ms`,
    );
  }
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  console.log(`Layer profiles: ${TIERS.join(', ')} humans | ticks=${TICKS} warmup=${WARMUP} | ${FULL_SIM ? 'FULL SIM' : 'focus throttle'} | ecology=${STRIP_ECOLOGY ? 'stripped' : 'preserved'} | speed=${SIM_SPEED}x`);
  console.log(`Acceptability: ACCEPTABLE p95<=${(TICK_INTERVAL_MS * 0.5).toFixed(1)}ms; WATCH p95<=${TICK_INTERVAL_MS.toFixed(1)}ms; OVER BUDGET p95>${TICK_INTERVAL_MS.toFixed(1)}ms.`);
  for (const pop of TIERS) await profileTier(pop);
  console.log('\nNote: systems and daily run at lower cadence than realtime. Compare total measured time and per-invocation cost separately. CPU-profile estimates are approximate.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};

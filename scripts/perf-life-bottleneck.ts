/**
 * Non-invasive lifeSimulation bottleneck profiler.
 * Does not modify gameTick or any simulation layer.
 *
 * Run:
 *   PERF_TICKS=120 SIM_FULL_SIM=1 npx tsx scripts/perf-life-bottleneck.ts
 */
import { Session } from 'node:inspector/promises';
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';

const POP = Number(process.env.SIM_POP ?? 1200);
const TICKS = Number(process.env.PERF_TICKS ?? 120);
const WARMUP = Number(process.env.PERF_WARMUP ?? 30);
const FULL_SIM = process.env.SIM_FULL_SIM === '1';
const STRIP_ECOLOGY = process.env.SIM_STRIP_ECOLOGY === '1';

type CpuNode = {
  id: number;
  callFrame: { functionName?: string; url?: string; lineNumber?: number; columnNumber?: number };
  children?: number[];
};

type CpuProfile = { nodes: CpuNode[]; samples?: number[]; timeDeltas?: number[] };

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

function sourceName(url: string | undefined): string {
  if (!url) return '';
  const match = url.match(/([^/]+\.ts)(?::\d+)?$/);
  return match?.[1] ?? url;
}

function subtreeIds(profile: CpuProfile, roots: number[]): Set<number> {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const result = new Set<number>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id == null || result.has(id)) continue;
    result.add(id);
    for (const child of byId.get(id)?.children ?? []) pending.push(child);
  }
  return result;
}

function sampleCount(profile: CpuProfile, ids: Set<number>): number {
  let count = 0;
  for (const id of profile.samples ?? []) if (ids.has(id)) count++;
  return count;
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  const state = initGame({ villageName: 'BottleneckProfile', size: MapSize.Large });
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
  seedHumans(state, POP);

  const focus = FULL_SIM ? undefined : undefined;
  for (let i = 0; i < WARMUP; i++) gameTick(state, focus);

  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.start');
  const wallStart = performance.now();
  for (let i = 0; i < TICKS; i++) gameTick(state, focus);
  const wallMs = performance.now() - wallStart;
  const result = await session.post('Profiler.stop') as unknown as { profile: CpuProfile };
  session.disconnect();

  const profile = result.profile;
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const counts = new Map<number, number>();
  for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);

  const lifeRows = profile.nodes
    .filter((node) => sourceName(node.callFrame.url) === 'lifeSimulation.ts')
    .map((node) => ({
      name: node.callFrame.functionName || '(anonymous)',
      line: (node.callFrame.lineNumber ?? -1) + 1,
      samples: counts.get(node.id) ?? 0,
      url: node.callFrame.url,
    }))
    .filter((row) => row.samples > 0)
    .sort((a, b) => b.samples - a.samples);

  const totalSamples = profile.samples?.length ?? 0;
  console.log(`Population=${POP} ticks=${TICKS} warmup=${WARMUP} | ${FULL_SIM ? 'FULL SIM' : 'focus throttle'} | ecology=${STRIP_ECOLOGY ? 'stripped' : 'preserved'}`);
  console.log(`Wall=${wallMs.toFixed(1)}ms avg=${(wallMs / TICKS).toFixed(2)}ms/tick CPU samples=${totalSamples}`);
  console.log('\nTop lifeSimulation leaf samples (approximate CPU hotspots):');
  for (const row of lifeRows.slice(0, 30)) {
    const share = totalSamples > 0 ? (row.samples / totalSamples) * 100 : 0;
    console.log(`${row.name.padEnd(42)} line=${String(row.line).padStart(4)} samples=${String(row.samples).padStart(5)} share=${share.toFixed(2).padStart(6)}%`);
  }

  const targetNames = new Set(['tickHumans', 'tickWildlife', 'tickGrassDaily', 'findCourtshipPartner', 'tryDailyConception', 'tryDailyAffairGossip', 'tryExposeCaughtAffairForPair']);
  console.log('\nTarget function samples (self-only and inclusive descendants):');
  for (const row of lifeRows.filter((candidate) => targetNames.has(candidate.name))) {
    const nodeIds = profile.nodes
      .filter((node) => (node.callFrame.functionName || '(anonymous)') === row.name)
      .map((node) => node.id);
    const inclusive = sampleCount(profile, subtreeIds(profile, nodeIds));
    const share = totalSamples > 0 ? (inclusive / totalSamples) * 100 : 0;
    console.log(`${row.name.padEnd(42)} self=${String(row.samples).padStart(5)} inclusive=${String(inclusive).padStart(5)} share=${share.toFixed(2).padStart(6)}%`);
  }

  const layerRoots = ['tickHumans', 'tickWildlife', 'tickGrassDaily'] as const;
  console.log('\nInclusive layer totals:');
  for (const name of layerRoots) {
    const roots = profile.nodes
      .filter((node) => node.callFrame.functionName === name)
      .map((node) => node.id);
    const samples = sampleCount(profile, subtreeIds(profile, roots));
    const share = totalSamples > 0 ? (samples / totalSamples) * 100 : 0;
    console.log(`${name.padEnd(18)} samples=${String(samples).padStart(5)} share=${share.toFixed(2).padStart(6)}%`);
  }

  void byId;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};

/**
 * A/B spatial query measurement — grid vs naive on city profile.
 * Run: npx tsx scripts/benchmark-spatial-ab.ts
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SpatialQueryReport } from '../src/game/spatialQueryMetrics';
import { formatSpatialQueryComparison } from './spatialQueryReport';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const runner = join(appRoot, 'scripts', 'run-sim.mjs');
const TICKS = Number(process.env.SPATIAL_AB_TICKS ?? 300);

function runMode(mode: 'grid' | 'naive'): SpatialQueryReport | null {
  const env = {
    ...process.env,
    SIM_FORCE: '1',
    SPATIAL_QUERY_METRICS: '1',
    SPATIAL_QUERY_JSON: '1',
    CITY_BENCH_TICKS: String(TICKS),
    CITY_BENCH_WARMUP: '30',
    BENCHMARK_GATE: '0',
    USE_SPATIAL_GRID: mode === 'naive' ? '0' : undefined,
  };
  if (mode === 'grid') delete env.USE_SPATIAL_GRID;

  const result = spawnSync(
    process.execPath,
    [runner, 'scripts/benchmark-city.ts'],
    { cwd: appRoot, env, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  const marker = '__SPATIAL_QUERY_JSON__';
  const line = (result.stdout || '').split('\n').find((l) => l.startsWith(marker));
  if (!line) return null;
  return JSON.parse(line.slice(marker.length)) as SpatialQueryReport;
}

function main(): void {
  console.log(`\n=== Spatial query A/B (${TICKS} steady ticks, city profile) ===`);
  const grid = runMode('grid');
  const naive = runMode('naive');
  if (!grid || !naive) {
    console.error('Missing spatial query JSON from benchmark-city.ts');
    process.exit(1);
  }
  console.log(formatSpatialQueryComparison(grid, naive));
}

main();
import { appendFileSync, readFileSync } from 'node:fs';

const [baselinePath, candidatePath, populationArg, daysArg, baselineResourcesPath, candidateResourcesPath] = process.argv.slice(2);
const population = Number(populationArg);
const days = Number(daysArg);
if (!candidatePath || !Number.isSafeInteger(population) || !Number.isSafeInteger(days) || ![2, 180].includes(days)) {
  throw new Error('Usage: node scripts/compare-population-colony.mjs BASE.json|none PR.json POP DAYS [BASE.resources PR.resources]');
}
function read(path, side) {
  if (!path || path === 'none') return null;
  const r = JSON.parse(readFileSync(path, 'utf8'));
  if (r.version !== 3 || r.scenario !== 'producers-virtual-player' || r.seed !== 12345 ||
      r.populationTarget !== population || r.days !== days || r.ticks !== days * 288 ||
      r.ticksPerHour !== 12 || r.ticksPerDay !== 288 || r.warmup !== 12 ||
      r.viewportFocus !== true || r.initialPopulation !== population ||
      r.invariantErrors !== 0 || !Array.isArray(r.daySnapshots) || !r.daySnapshots.length) {
    throw new Error(side + ': benchmark contract violated');
  }
  for (const key of ['averageMs', 'averageCpuMs', 'p50Ms', 'p95Ms', 'p99Ms', 'maxMs', 'averageBotMs', 'ticksPerSecond']) {
    if (!Number.isFinite(r[key]) || r[key] < 0) throw new Error(side + ': invalid metric ' + key);
  }
  if (!Number.isSafeInteger(r.botActions) || r.botActions <= 0) throw new Error(side + ': VirtualPlayer never acted');
  if (side === 'PR' && (!Number.isSafeInteger(r.creditedDays) || r.creditedDays <= 0)) {
    throw new Error('PR: no new career days despite a simulated working colony');
  }
  return r;
}
function rss(path) {
  if (!path || path === 'none') return null;
  const line = readFileSync(path, 'utf8').split('\n').find((s) => s.startsWith('peak_rss_kib='));
  const n = line === undefined ? NaN : Number(line.slice('peak_rss_kib='.length));
  if (!Number.isFinite(n) || n <= 0) throw new Error('Bad peak RSS report: ' + path);
  return n / 1024;
}
const before = read(baselinePath, 'Baseline');
const after = read(candidatePath, 'PR');
if (before && (before.node !== after.node || before.arch !== after.arch || before.platform !== after.platform)) {
  throw new Error('Mismatched benchmark runtimes');
}
const baseRss = rss(baselineResourcesPath), prRss = rss(candidateResourcesPath);
const format = n => n == null ? '—' : n.toFixed(2);
const delta = (a, b) => a == null || a === 0 ? '—' : ((b / a - 1) * 100).toFixed(1) + '%';
const metrics = [
  ['Average tick (ms)', 'averageMs'],
  ['p50 tick (ms)', 'p50Ms'],
  ['p95 tick (ms)', 'p95Ms'],
  ['p99 tick (ms)', 'p99Ms'],
  ['Maximum tick (ms)', 'maxMs'],
  ['CPU per tick (ms)', 'averageCpuMs'],
  ['VirtualPlayer per tick (ms)', 'averageBotMs'],
  ['Throughput (ticks/s, including bot)', 'ticksPerSecond'],
  ['Process peak RSS (MiB)', null],
];
const markdown = [
  '## Real colony + VirtualPlayer — ' + population + ' residents, ' + days + ' days',
  '',
  '12 ticks/hour · 288 ticks/day · ' + after.ticks + ' measured ticks · 12 warmup · seed 12345 · Huge map · viewport focus on.',
  'Setup uses existing producer-colony, construction, residence and workforce owners; during measurements no population or resource restocking occurs.',
  '',
  '| Metric | Baseline | PR candidate | Change |',
  '| --- | ---: | ---: | ---: |',
  ...metrics.map(([label, key]) => {
    const first = key ? before?.[key] : baseRss;
    const second = key ? after[key] : prRss;
    return '| ' + label + ' | ' + format(first) + ' | ' + format(second) + ' | ' + delta(first, second) + ' |';
  }),
  '',
  'Final population: ' + (before?.finalPopulation ?? '—') + ' → ' + after.finalPopulation +
    ' · final buildings: ' + (before?.finalBuildings ?? '—') + ' → ' + after.finalBuildings,
  'VirtualPlayer actions: ' + (before?.botActions ?? '—') + ' → ' + after.botActions +
    ' · new career day credits (PR): ' + after.creditedDays,
  'Simulation invariant errors: ' + (before?.invariantErrors ?? '—') + ' / ' + after.invariantErrors,
  '',
  days === 180 ? 'Manual half-year stress test: single PR revision, no baseline comparison; long-running and subject to runner limits.'
    : 'One descriptive baseline/PR pair. Shared CI host variance is not a hard timing regression threshold.',
  'Headless simulation only: browser render, worker messaging and GPU are not benchmarked.',
  '',
].join('\n');
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

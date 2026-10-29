import { appendFileSync, readFileSync } from 'node:fs';

const [baselinePath, candidatePath, populationArg, baselineResourcesPath, candidateResourcesPath] = process.argv.slice(2);
const target = Number(populationArg);
if (!baselinePath || !candidatePath || !Number.isSafeInteger(target) || target <= 0) {
  throw new Error('Usage: node scripts/compare-population-benchmarks.mjs BASE.json PR.json POP [BASE.resources PR.resources]');
}

function readBenchmark(path, title) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.version !== 2 || data.seed !== 12345 || data.fullSim !== false || data.profiling !== false) {
    throw new Error(title + ': incompatible benchmark settings');
  }
  if (!Array.isArray(data.reports) || data.reports.length !== 1) {
    throw new Error(title + ': expected exactly one population report');
  }
  const report = data.reports[0];
  if (report.label !== 'City ' + target + ' player humans' || report.population !== target || report.ticks !== 72 || report.warmup !== 12) {
    throw new Error(title + ': wrong population, measured tick count, or warmup');
  }
  for (const field of ['averageMs', 'averageCpuMs', 'p50Ms', 'p95Ms', 'p99Ms', 'maxMs', 'ticksPerSecond']) {
    if (!Number.isFinite(report[field]) || report[field] < 0 || (field === 'ticksPerSecond' && report[field] === 0)) {
      throw new Error(title + ': invalid ' + field);
    }
  }
  if (!Array.isArray(report.invariantErrors)) throw new Error(title + ': missing invariant results');
  if (report.invariantErrors.length !== 0) {
    throw new Error(title + ': ' + report.invariantErrors.length + ' simulation invariants failed: ' + report.invariantErrors.join('; '));
  }
  return { data, report };
}

function resourceValue(path, key) {
  if (!path) return null;
  const line = readFileSync(path, 'utf8').split('\n').find((value) => value.startsWith(key + '='));
  const number = line === undefined ? NaN : Number(line.slice(key.length + 1));
  if (!Number.isFinite(number) || number < 0) throw new Error('Invalid ' + key + ' measurement in ' + path);
  return number;
}

const baseline = readBenchmark(baselinePath, 'Baseline');
const candidate = readBenchmark(candidatePath, 'PR');
if (baseline.data.node !== candidate.data.node || baseline.data.platform !== candidate.data.platform || baseline.data.arch !== candidate.data.arch) {
  throw new Error('Benchmark environments differ');
}
const format = (value) => value.toFixed(2);
const relative = (before, after) => before > 0 ? ((after / before - 1) * 100).toFixed(1) + '%' : 'n/a';
const rows = [
  ['Average tick (ms)', baseline.report.averageMs, candidate.report.averageMs],
  ['p50 tick (ms)', baseline.report.p50Ms, candidate.report.p50Ms],
  ['p95 tick (ms)', baseline.report.p95Ms, candidate.report.p95Ms],
  ['p99 tick (ms)', baseline.report.p99Ms, candidate.report.p99Ms],
  ['Maximum tick (ms)', baseline.report.maxMs, candidate.report.maxMs],
  ['Average CPU per tick (ms)', baseline.report.averageCpuMs, candidate.report.averageCpuMs],
  ['Throughput (ticks/s)', baseline.report.ticksPerSecond, candidate.report.ticksPerSecond],
];
if (baselineResourcesPath && candidateResourcesPath) {
  rows.push(['Peak process RSS (MiB)', resourceValue(baselineResourcesPath, 'peak_rss_kib') / 1024, resourceValue(candidateResourcesPath, 'peak_rss_kib') / 1024]);
  rows.push(['Process elapsed (s)', resourceValue(baselineResourcesPath, 'elapsed_seconds'), resourceValue(candidateResourcesPath, 'elapsed_seconds')]);
}
const sha = (value) => value ? value.slice(0, 12) : 'manual';
const summary = [
  '## Population performance — ' + target + ' player humans',
  '',
  'Baseline: ' + sha(process.env.BASE_SHA) + ' · Candidate: ' + sha(process.env.HEAD_SHA),
  'Node ' + candidate.data.node + '; seed 12345; 12 warmup + 72 measured ticks; viewport focus ON; generated city fixture.',
  '',
  '| Metric | Baseline | PR / candidate | Change |',
  '| --- | ---: | ---: | ---: |',
  ...rows.map(([label, before, after]) => '| ' + label + ' | ' + format(before) + ' | ' + format(after) + ' | ' + relative(before, after) + ' |'),
  '',
  'Invariant errors: baseline ' + baseline.report.invariantErrors.length + ', candidate ' + candidate.report.invariantErrors.length + '.',
  '',
  'Descriptive measurements only; negative tick-time changes mean faster. Shared-runner noise is not a pass/fail regression threshold. Peak RSS includes the benchmark process, not browser/worker rendering.',
  '',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

import { appendFileSync, readFileSync } from 'node:fs';

const [baselinePath, candidatePath, populationArg, daysArg, baselineResourcesPath, candidateResourcesPath] = process.argv.slice(2);
const population = Number(populationArg);
const days = Number(daysArg);
if (!candidatePath || !Number.isSafeInteger(population) || !Number.isSafeInteger(days) ||
    ![2, 180].includes(days)) {
  throw new Error('Usage: node scripts/compare-population-colony.mjs BASE.json|none PR.json POP DAYS [BASE.resources PR.resources]');
}
const sum = values => values.reduce((total, value) => total + value, 0);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const countBy = (rows, key) => {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] ?? 0) + 1;
  return out;
};
const sameCounts = (a, b) => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].every(key => (a[key] ?? 0) === (b[key] ?? 0));
};

function verifyAuditLog(report, path, side) {
  const expectedPath = path.replace(/\.json$/i, '') + '.events.jsonl';
  assert(report.eventLogPath === expectedPath, side + ': unexpected audit log path');
  const lines = readFileSync(expectedPath, 'utf8').trim().split('\n');
  const events = lines.map((line, i) => {
    try { return JSON.parse(line); }
    catch { throw new Error(side + ': invalid audit JSONL line ' + (i + 1)); }
  });
  assert(events[0]?.kind === 'start' && events.at(-1)?.kind === 'finish',
    side + ': missing start/finish audit markers');
  const credits = events.filter(e => e.kind === 'career-workday');
  const bot = events.filter(e => e.kind === 'bot-action');
  const daily = events.filter(e => e.kind === 'daily-summary');
  assert(credits.length === report.careerEventCount && credits.length === report.creditedDays,
    side + ': career event count does not match the stored histories');
  assert(bot.length === report.botActions && daily.length === days,
    side + ': bot or day events do not match benchmark metrics');
  const workerIds = new Set();
  const seenWorkdays = new Set();
  for (const event of credits) {
    assert(Number.isSafeInteger(event.entityId) && event.entityId >= 0 &&
      typeof event.job === 'string' && event.job.length > 0 &&
      Number.isSafeInteger(event.lastDay) && event.lastDay >= 0 &&
      Number.isSafeInteger(event.previousDays) && event.previousDays >= 0 &&
      event.totalDays === event.previousDays + 1 &&
      Number.isSafeInteger(event.workplaceId) && event.workplaceId >= 0 &&
      Number.isFinite(event.observedHours) && event.observedHours > 0,
      side + ': invalid worker/job/site/hours in recorded shift: ' + JSON.stringify(event));
    const id = event.entityId + ':' + event.job + ':' + event.lastDay;
    assert(!seenWorkdays.has(id), side + ': duplicate workday for ' + id);
    seenWorkdays.add(id);
    workerIds.add(event.entityId);
  }
  assert(workerIds.size === report.careerWorkers,
    side + ': number of distinct workers with recorded career days disagrees');
  assert(sameCounts(countBy(credits, 'job'), report.careerByJob),
    side + ': per-profession totals disagree with audit log');
  assert(sameCounts(countBy(bot, 'op'), report.botByOperation),
    side + ': VirtualPlayer command totals disagree with audit log');
  const uniqueDays = new Set();
  for (const [index, snapshot] of report.daySnapshots.entries()) {
    assert(snapshot.day === index + 1 && snapshot.invariantErrors === 0,
      side + ': missing or invalid day ' + (index + 1));
    assert(snapshot.humans > 0 && snapshot.housed >= 0 && snapshot.housed <= snapshot.humans &&
      snapshot.workersAssigned >= 0 && snapshot.workersAssigned <= snapshot.humans,
      side + ': impossible daily colony demographics');
    assert(Number.isFinite(snapshot.averageTickMs) && snapshot.averageTickMs >= 0 &&
      Number.isFinite(snapshot.p95TickMs) && snapshot.p95TickMs >= 0,
      side + ': invalid daily performance sample');
    assert(sum(Object.values(snapshot.newCreditsByJob)) === snapshot.newCreditsToday,
      side + ': daily career totals do not add up');
    assert(sameCounts(snapshot.creditedByJob, index + 1 === days ? report.careerByJob : snapshot.creditedByJob),
      side + ': missing career attribution for final day');
    assert(daily[index].day === snapshot.day &&
      daily[index].creditedDays === snapshot.creditedDays &&
      daily[index].newCreditsToday === snapshot.newCreditsToday,
      side + ': daily JSONL does not match structured report');
    uniqueDays.add(snapshot.day);
  }
  assert(uniqueDays.size === days &&
    sum(report.daySnapshots.map(d => d.newCreditsToday)) === report.careerEventCount &&
    report.daySnapshots.at(-1).creditedDays === report.careerEventCount,
    side + ': daily workday totals do not reconcile');
  return { credits: credits.length, commands: bot.length, days: daily.length };
}

function read(path, side) {
  if (!path || path === 'none') return null;
  const r = JSON.parse(readFileSync(path, 'utf8'));
  assert(r.version === 4 && r.scenario === 'producers-virtual-player' &&
    r.seed === 12345 && r.populationTarget === population && r.days === days &&
    r.ticks === days * 288 && r.ticksPerHour === 12 && r.ticksPerDay === 288 &&
    r.warmup === 12 && r.viewportFocus === true && r.initialPopulation === population &&
    r.invariantErrors === 0 && Array.isArray(r.daySnapshots) &&
    r.daySnapshots.length === days, side + ': incompatible simulation contract');
  for (const key of ['averageMs', 'averageCpuMs', 'p50Ms', 'p95Ms',
    'p99Ms', 'maxMs', 'averageBotMs', 'ticksPerSecond']) {
    assert(Number.isFinite(r[key]) && r[key] >= 0, side + ': invalid metric ' + key);
  }
  assert(Number.isSafeInteger(r.botAttemptHours) && r.botAttemptHours > 0 &&
    Number.isSafeInteger(r.botActions) && r.botActions >= 0 &&
    Number.isSafeInteger(r.botIdleHours) && r.botIdleHours >= 0 &&
    r.botActions + r.botIdleHours === r.botAttemptHours,
    side + ': VirtualPlayer cadence or counters are inconsistent');
  assert(Number.isSafeInteger(r.creditedDays) && r.creditedDays >= 0 &&
    Number.isSafeInteger(r.careerWorkers) && r.careerWorkers >= 0 &&
    Number.isSafeInteger(r.careerEventCount) && r.careerEventCount >= 0,
    side + ': invalid career counters');
  assert(sum(Object.values(r.careerByJob)) === r.creditedDays,
    side + ': job totals do not add up');
  verifyAuditLog(r, path, side);
  if (side === 'PR') {
    assert(r.creditedDays > 0 && r.careerWorkers > 0,
      'PR: no verified career workdays; a simulation without real work cannot pass');
  }
  return r;
}
function rss(path) {
  if (!path || path === 'none') return null;
  const line = readFileSync(path, 'utf8').split('\n').find(s => s.startsWith('peak_rss_kib='));
  const n = line === undefined ? NaN : Number(line.slice('peak_rss_kib='.length));
  assert(Number.isFinite(n) && n > 0, 'Bad peak RSS report: ' + path);
  return n / 1024;
}
const before = read(baselinePath, 'Baseline');
const after = read(candidatePath, 'PR');
if (before) {
  assert(before.node === after.node && before.arch === after.arch &&
    before.platform === after.platform, 'Mismatched benchmark runtimes');
}
const baseRss = rss(baselineResourcesPath), prRss = rss(candidateResourcesPath);
const format = value => value == null ? '—' : value.toFixed(2);
const delta = (a, b) => a == null || a === 0 ? '—' : ((b / a - 1) * 100).toFixed(1) + '%';
const metrics = [
  ['Average simulation tick (ms)', 'averageMs'],
  ['p50 simulation tick (ms)', 'p50Ms'],
  ['p95 simulation tick (ms)', 'p95Ms'],
  ['p99 simulation tick (ms)', 'p99Ms'],
  ['Maximum simulation tick (ms)', 'maxMs'],
  ['CPU per tick incl. bot (ms)', 'averageCpuMs'],
  ['VirtualPlayer per tick (ms)', 'averageBotMs'],
  ['Throughput (ticks/s, sim + bot)', 'ticksPerSecond'],
  ['Peak process RSS (MiB)', null],
];
const markdown = [
  '## Real colony + VirtualPlayer — ' + population + ' residents, ' + days + ' days',
  '',
  '12 ticks/hour · 288 ticks/day · ' + after.ticks +
    ' measured ticks · 12 warmup · seed 12345 · Huge map · viewport focus on.',
  'Real producer, housing, staffing and hour-by-hour VirtualPlayer systems. No restocking after setup.',
  'Timing excludes JSONL logging overhead, browser rendering and worker transport.',
  '',
  '| Metric | Baseline | PR candidate | Change |',
  '| --- | ---: | ---: | ---: |',
  ...metrics.map(([label, key]) => {
    const first = key ? before?.[key] : baseRss;
    const second = key ? after[key] : prRss;
    return '| ' + label + ' | ' + format(first) + ' | ' + format(second) + ' | ' +
      delta(first, second) + ' |';
  }),
  '',
  '| Simulation audit | Baseline | PR |',
  '| --- | ---: | ---: |',
  '| Final population | ' + (before?.finalPopulation ?? '—') + ' | ' + after.finalPopulation + ' |',
  '| Buildings at end | ' + (before?.finalBuildings ?? '—') + ' | ' + after.finalBuildings + ' |',
  '| Bot commands issued | ' + (before?.botActions ?? '—') + ' | ' + after.botActions + ' |',
  '| Bot idle hours | ' + (before?.botIdleHours ?? '—') + ' | ' + after.botIdleHours + ' |',
  '| Recorded workdays | ' + (before?.creditedDays ?? '—') + ' | ' + after.creditedDays + ' |',
  '| Residents with credited workdays | ' + (before?.careerWorkers ?? '—') + ' | ' + after.careerWorkers + ' |',
  '| Invariant errors | ' + (before?.invariantErrors ?? '—') + ' | ' + after.invariantErrors + ' |',
  '',
  'PR new workdays by profession: ' +
    (Object.entries(after.careerByJob).map(([job, count]) => job + ' ' + count).join(', ') || '(none)') + '.',
  'PR bot commands by operation: ' +
    (Object.entries(after.botByOperation).map(([op, count]) => op + ' ' + count).join(', ') || '(none)') + '.',
  '',
  'The uploaded .events.jsonl contains each witnessed shift with entityId, name, profession, workplaceId, hours and day; plus bot commands and daily colony snapshots.',
  days === 180
    ? 'Manual half-year stress test: only the PR revision is run; long-running and subject to runner limits.'
    : 'One descriptive baseline/PR pair. Shared CI host variance is not a hard timing regression threshold.',
  '',
].join('\n');
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

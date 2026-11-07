/**
 * Semantic duplicate ratchet — groups functions by the calls, members and writes they perform,
 * independent of token order. Baselined groups pass; a new group needs a reviewed-distinct entry.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractFact } from './check-function-overlap.mjs';

const ROOT = process.cwd();
const GRAPH = join(ROOT, 'docs', 'tools', 'call-graph.json');
const BASELINE = join(ROOT, 'docs', 'tools', 'semantic-duplicates-baseline.json');
const REVIEW = join(ROOT, 'docs', 'tools', 'semantic-duplicates-reviewed.json');
const UPDATE = process.argv.includes('--update-baseline');
const LIST = process.argv.includes('--list');
const EXPLAIN = process.argv.indexOf('--explain');
const MARK = process.argv.indexOf('--mark');

const CONTROL_WORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new',
  'Number', 'String', 'Boolean', 'Math', 'Map', 'Set', 'Array', 'Object', 'JSON',
]);

function symbolId(fn) {
  return `${fn.file}:${fn.className ? fn.className + '.' : ''}${fn.name}`;
}

function isTestHelper(file) {
  return file.startsWith('src/test/') || file.includes('.test.');
}

function signature(fact) {
  const called = [...new Set(fact.called.filter((name) => !CONTROL_WORDS.has(name)))].sort();
  const members = [...new Set(fact.members)].sort();
  const writes = [...new Set(fact.writes)].sort();
  if (called.length === 0 && members.length === 0 && writes.length === 0) return null;
  if (fact.tokens.length < 12) return null;
  return JSON.stringify({ called, members, writes });
}

function loadData() {
  const graph = JSON.parse(readFileSync(GRAPH, 'utf8'));
  const sources = new Map(
    [...new Set(graph.functions.map((fn) => fn.file))]
      .map((file) => [file, readFileSync(join(ROOT, file), 'utf8')]),
  );
  const groups = new Map();
  for (const fn of graph.functions) {
    if (isTestHelper(fn.file)) continue;
    const fact = extractFact(fn, sources);
    const sig = signature(fact);
    if (!sig) continue;
    const hash = createHash('sha1').update(sig).digest('hex');
    const group = groups.get(hash) ?? [];
    group.push({
      id: symbolId(fn),
      file: fn.file,
      name: fn.name,
      tokens: fact.tokens.length,
      calls: [...new Set(fact.called)].sort(),
      members: [...new Set(fact.members)].sort(),
      writes: [...new Set(fact.writes)].sort(),
      callers: (fn.callers ?? []).map((caller) => `${caller.file}:${caller.line}`),
    });
    groups.set(hash, group);
  }
  return [...groups.entries()]
    .filter(([, functions]) => functions.length > 1)
    .map(([hash, functions]) => ({
      hash,
      count: functions.length,
      functions: functions.sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.functions[0].id.localeCompare(b.functions[0].id));
}

function loadReviews() {
  if (!existsSync(REVIEW)) return { groups: [] };
  const parsed = JSON.parse(readFileSync(REVIEW, 'utf8'));
  return { groups: Array.isArray(parsed.groups) ? parsed.groups : [] };
}

function reviewFor(reviews, hash) {
  return reviews.groups.find((entry) => entry.hash === hash);
}

function groupLabel(group, index) {
  return `#${index + 1} [${group.hash.slice(0, 8)}] ${group.functions.map((fn) => fn.id).join(' ~ ')}`;
}

function findGroup(groups, query) {
  if (!query) return null;
  const byIndex = Number(query);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= groups.length) return groups[byIndex - 1];
  return groups.find((group) => group.hash.startsWith(query))
    ?? groups.find((group) => group.functions.some((fn) => fn.id.includes(query)))
    ?? null;
}

function explain(group, review) {
  console.log(`HASH: ${group.hash}`);
  console.log(`STATUS: ${review?.status ?? 'unreviewed'}`);
  if (review?.reason) console.log(`REASON: ${review.reason}`);
  if (review?.tests?.length) console.log(`TESTS: ${review.tests.join(', ')}`);
  for (const fn of group.functions) {
    console.log(`\n## ${fn.id} (${fn.tokens} tokens)`);
    console.log(`  calls:   ${fn.calls.join(', ') || '—'}`);
    console.log(`  members: ${fn.members.join(', ') || '—'}`);
    console.log(`  writes:  ${fn.writes.join(', ') || '—'}`);
    console.log(`  callers: ${(fn.callers ?? []).join(', ') || '—'}`);
  }
}

function parseMarkArgs() {
  const status = process.argv[MARK + 1];
  const query = process.argv[MARK + 2];
  const reasonIndex = process.argv.indexOf('--reason');
  const testsIndex = process.argv.indexOf('--tests');
  if (!['real', 'distinct'].includes(status) || !query) {
    throw new Error('usage: --mark <real|distinct> <group-index|hash-prefix|function-id> --reason "..." [--tests "tests/a.test.ts,tests/b.test.ts"]');
  }
  const reason = reasonIndex >= 0 ? process.argv[reasonIndex + 1] : '';
  if (!reason || reason.trim().length < 20) throw new Error('--reason must explain the verdict (at least 20 characters)');
  const tests = testsIndex >= 0
    ? process.argv[testsIndex + 1].split(',').map((entry) => entry.trim()).filter(Boolean)
    : [];
  for (const test of tests) {
    if (!existsSync(join(ROOT, test))) throw new Error(`Test file does not exist: ${test}`);
  }
  return { status, query, reason: reason.trim(), tests };
}

function main() {
  const groups = loadData();
  const reviews = loadReviews();

  if (MARK >= 0) {
    const { status, query, reason, tests } = parseMarkArgs();
    const group = findGroup(groups, query);
    if (!group) throw new Error(`No semantic duplicate group matches: ${query}`);
    const next = reviews.groups.filter((entry) => entry.hash !== group.hash);
    next.push({ hash: group.hash, status, reason, tests });
    writeFileSync(REVIEW, JSON.stringify({ groups: next }, null, 2) + '\n');
    console.log(`semantic-duplicates review: ${group.hash.slice(0, 8)} marked ${status}`);
    return 0;
  }

  if (EXPLAIN >= 0) {
    const group = findGroup(groups, process.argv[EXPLAIN + 1]);
    if (!group) throw new Error(`No semantic duplicate group matches: ${process.argv[EXPLAIN + 1] ?? '(missing query)'}`);
    explain(group, reviewFor(reviews, group.hash));
    return 0;
  }

  if (LIST) {
    for (const [index, group] of groups.entries()) {
      const review = reviewFor(reviews, group.hash);
      console.log(`#${index + 1} [${review?.status ?? 'unreviewed'}] ${group.hash.slice(0, 8)}`);
      for (const fn of group.functions) console.log(`  ${fn.id}`);
    }
    console.log(`semantic-duplicates report: ${groups.length} group(s); ${reviews.groups.length} reviewed`);
    return 0;
  }

  if (UPDATE) {
    writeFileSync(BASELINE, JSON.stringify({ generatedAt: new Date().toISOString(), groups }, null, 2) + '\n');
    console.log(`semantic-duplicates baseline updated: ${groups.length} group(s)`);
    return 0;
  }

  if (!existsSync(BASELINE)) {
    console.error('semantic-duplicates baseline missing; run: node scripts/check-semantic-duplicates.mjs --update-baseline');
    return 1;
  }
  const allowed = new Map(JSON.parse(readFileSync(BASELINE, 'utf8')).groups.map((group) => [group.hash, group.count]));
  const findings = [];
  for (const group of groups) {
    const baselineCount = allowed.get(group.hash) ?? 0;
    if (group.count <= baselineCount) continue;
    const review = reviewFor(reviews, group.hash);
    if (baselineCount === 0 && review?.status === 'distinct' && review.reason && review.tests?.length) continue;
    findings.push(group);
  }
  console.log(`semantic-duplicates gate: ${groups.length} group(s); ${findings.length} new/unreviewed group(s)`);
  for (const group of findings.slice(0, 20)) {
    console.error(`NEW SEMANTIC DUPLICATE: ${group.functions.map((fn) => fn.id).join(' ~ ')}`);
  }
  if (findings.length > 20) console.error(`... ${findings.length - 20} more group(s)`);
  if (findings.length > 0) {
    console.error('Refactor the behavior, or review it as distinct with --mark distinct ... --reason "..." --tests "...".');
  }
  return findings.length > 0 ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error('semantic-duplicates gate error: ' + error.message);
  process.exitCode = 2;
}

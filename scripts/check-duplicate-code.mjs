/**
 * Duplicate-code ratchet — baseline today's jscpd clones, fail only new ones.
 *
 * The standard gate already runs jscpd; this wrapper turns that report into a
 * stable fingerprint set so old duplication can be paid down without blocking
 * every PR on a full rewrite.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const BASELINE = join(ROOT, 'docs', 'tools', 'duplicate-code-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
const output = mkdtempSync(join(tmpdir(), 'wilderfolk-jscpd-'));

function runJscpd() {
  const args = [
    'src',
    '--min-lines', '6',
    '--min-tokens', '60',
    '--format', 'typescript,tsx,javascript',
    '--ignore', '**/test/**,**/*.test.ts,**/data/**,src/test/**',
    '--reporters', 'json',
    '--output', output,
  ];
  const result = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'jscpd', 'run-jscpd.js'), ...args], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  if (result.status !== 0) {
    throw new Error(`jscpd failed with exit ${result.status ?? 'unknown'}`);
  }
  const reportPath = join(output, 'jscpd-report.json');
  if (!existsSync(reportPath)) throw new Error('jscpd produced no report');
  return JSON.parse(readFileSync(reportPath, 'utf8')).duplicates ?? [];
}

function sourceName(name) {
  return relative(ROOT, resolve(ROOT, 'src', name)).replaceAll('\\', '/');
}

function fingerprint(clone) {
  const files = [sourceName(clone.firstFile.name), sourceName(clone.secondFile.name)].sort();
  const text = String(clone.fragment ?? '').replace(/\s+/g, ' ').trim();
  const hash = createHash('sha1').update(text).digest('hex');
  return {
    hash,
    fileA: files[0],
    fileB: files[1],
    tokens: Number(clone.tokens ?? 0),
    lines: Number(clone.lines ?? 0),
  };
}

function group(clones) {
  const groups = new Map();
  for (const clone of clones) {
    const item = fingerprint(clone);
    const key = `${item.hash}|${item.fileA}|${item.fileB}`;
    const current = groups.get(key);
    if (current) current.count++;
    else groups.set(key, { ...item, count: 1 });
  }
  return [...groups.values()].sort((a, b) =>
    a.fileA.localeCompare(b.fileA) || a.fileB.localeCompare(b.fileB) || a.hash.localeCompare(b.hash));
}

function main() {
  const clones = runJscpd();
  const current = group(clones);
  if (UPDATE) {
    writeFileSync(BASELINE, JSON.stringify({ generatedAt: new Date().toISOString(), clones: current }, null, 2) + '\n');
    console.log(`duplicate-code baseline updated: ${current.length} groups / ${clones.length} clones`);
    return 0;
  }
  if (!existsSync(BASELINE)) {
    console.error('duplicate-code baseline missing; run: node scripts/check-duplicate-code.mjs --update-baseline');
    return 1;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).clones ?? [];
  const allowed = new Map(baseline.map((entry) => [
    `${entry.hash}|${entry.fileA}|${entry.fileB}`,
    entry.count,
  ]));
  const findings = current.filter((entry) => entry.count > (allowed.get(`${entry.hash}|${entry.fileA}|${entry.fileB}`) ?? 0));
  console.log(`duplicate-code gate: ${clones.length} clones / ${current.length} groups; ${findings.length} new group(s)`);
  for (const finding of findings.slice(0, 20)) {
    console.error(`NEW CLONE (${finding.lines} lines, ${finding.tokens} tokens): ${finding.fileA} ~ ${finding.fileB} (${finding.count}x)`);
  }
  if (findings.length > 20) console.error(`... ${findings.length - 20} more new group(s)`);
  if (findings.length > 0) {
    console.error('Refactor the new duplication, or update the baseline deliberately if it is an approved compatibility copy.');
  }
  return findings.length > 0 ? 1 : 0;
}

try {
  process.exitCode = main();
} finally {
  rmSync(output, { recursive: true, force: true });
}

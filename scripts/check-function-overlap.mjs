#!/usr/bin/env node
/** Review changed functions against the canonical repository call graph. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REVIEW_FILE = 'docs/tools/semantic-overlap-reviewed.json';
const GRAPH_FILE = 'docs/tools/call-graph.json';
const MIN_TOKENS = 12;
const MIN_SCORE = 0.82;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).trimEnd();
}

export function changedLines(diff) {
  const ranges = new Map();
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      if (!ranges.has(file)) ranges.set(file, []);
    } else if (line.startsWith('+++ /dev/null')) {
      file = null;
    } else if (file && line.startsWith('@@ ')) {
      const match = /\+([0-9]+)(?:,([0-9]+))?/.exec(line);
      if (!match) continue;
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      ranges.get(file).push([start, count ? start + count - 1 : start]);
    }
  }
  return ranges;
}

export function lex(source) {
  return source.match(/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b|===|!==|=>|==|!=|\+\+|--|\+=|-=|&&|\|\||\?\?|[^\s])/g) ?? [];
}

export function dice(left, right) {
  if (!left.length || !right.length) return 0;
  const remaining = new Map();
  for (const token of left) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  let common = 0;
  for (const token of right) {
    const count = remaining.get(token) ?? 0;
    if (count > 0) { common++; remaining.set(token, count - 1); }
  }
  return 2 * common / (left.length + right.length);
}

function neighbors(tokens) {
  return tokens.slice(1).map((token, index) => tokens[index] + '\u0000' + token);
}

function extractFact(fn, sources) {
  const src = sources.get(fn.file);
  if (src === undefined) throw new Error('Missing source file in graph: ' + fn.file);
  if (!Number.isInteger(fn.bodyEnd) || !Number.isInteger(fn.bodyStart)) {
    throw new Error('Call graph is stale: regenerate it with bodyStart/bodyEnd fields');
  }
  const lines = src.split('\n');
  const body = lines.slice(fn.line - 1, fn.bodyEnd).join('\n');
  const bodyOnly = lines.slice(fn.bodyStart - 1, fn.bodyEnd).join('\n');
  const tokens = lex(bodyOnly);
  const members = [...bodyOnly.matchAll(/\.\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]);
  const writes = [...bodyOnly.matchAll(/(?:\.|\[)\s*([A-Za-z_$][\w$]*)\s*(?:\]|)?\s*(?:=(?!=)|\+=|-=|\+\+|--)/g)].map(m => m[1]);
  const called = [...bodyOnly.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  const digest = createHash('sha256').update(body.replace(/\s+/g, '')).digest('hex');
  return { fn, tokens, pairs: neighbors(tokens), members, writes, called, digest };
}

export function overlap(a, b) {
  if (a.digest === b.digest || (a.tokens.length === b.tokens.length && a.tokens.every((token, i) => token === b.tokens[i]))) return 1;
  if (Math.min(a.tokens.length, b.tokens.length) < MIN_TOKENS) return 0;
  const token = dice(a.tokens, b.tokens);
  if (token < 0.78) return 0;
  const pair = dice(a.pairs, b.pairs);
  const members = a.members.length || b.members.length ? dice(a.members, b.members) : 1;
  const writes = a.writes.length || b.writes.length ? dice(a.writes, b.writes) : 1;
  const called = a.called.length || b.called.length ? dice(a.called, b.called) : 1;
  return 0.35 * token + 0.25 * pair + 0.15 * members + 0.15 * writes + 0.10 * called;
}

function factKey(f) {
  return f.fn.file + ':' + f.fn.line + ':' + (f.fn.className ? f.fn.className + '.' : '') + f.fn.name;
}

function approvalKey(a, b) {
  return [factKey(a) + '@' + a.digest, factKey(b) + '@' + b.digest].sort().join(' <-> ');
}

export function checkOverlaps(facts, changed, approvals) {
  const passed = new Set(approvals.filter(a => typeof a.reason === 'string' && a.reason.trim().length >= 40 && Array.isArray(a.tests) && a.tests.length > 0).map(a => a.key));
  const findings = [];
  const seen = new Set();
  for (const candidate of changed) {
    for (const other of facts) {
      if (candidate === other || (candidate.fn.file === other.fn.file && candidate.fn.line === other.fn.line)) continue;
      const score = overlap(candidate, other);
      if (score < MIN_SCORE) continue;
      const key = approvalKey(candidate, other);
      if (passed.has(key) || seen.has(key)) continue;
      seen.add(key);
      findings.push({ left: factKey(candidate), right: factKey(other), score: Number(score.toFixed(3)), key });
    }
  }
  return findings.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

function requireTestFile(root, file) {
  try { readFileSync(path.join(root, file)); return true; } catch { return false; }
}

function main() {
  const root = process.cwd();
  const graph = JSON.parse(readFileSync(path.join(root, GRAPH_FILE), 'utf8'));
  const reviewed = JSON.parse(readFileSync(path.join(root, REVIEW_FILE), 'utf8'));
  if (!Array.isArray(reviewed.approvals)) throw new Error('Review file must have an approvals array');
  for (const approval of reviewed.approvals) {
    if (typeof approval.key !== 'string' || typeof approval.reason !== 'string' || approval.reason.trim().length < 40 || !Array.isArray(approval.tests) || approval.tests.length === 0 || !approval.tests.every(t => /^tests\/.+\.test\.[cm]?[jt]sx?$/.test(t) && t.split('/').every(p => p !== '..') && requireTestFile(root, t))) {
      throw new Error('Invalid semantic overlap approval: require key, detailed reason and existing test file(s)');
    }
  }
  const positionalBase = process.argv.indexOf('--base');
  const ref = positionalBase >= 0 ? process.argv[positionalBase + 1] : (process.env.SEMANTIC_BASE_REF || (process.env.GITHUB_BASE_REF ? 'origin/' + process.env.GITHUB_BASE_REF : (process.env.GITHUB_EVENT_NAME === 'push' ? (process.env.GITHUB_EVENT_BEFORE || 'HEAD^') : 'origin/main')));
  if (!ref || ref === '0000000000000000000000000000000000000000') throw new Error('Supply a usable comparison base with --base');
  const base = git('merge-base', 'HEAD', ref);
  const changed = changedLines(git('diff', '--no-ext-diff', '--unified=0', '--find-renames', base, '--', 'src'));
  for (const file of git('ls-files', '--others', '--exclude-standard', '--', 'src').split('\n')) {
    if (file.endsWith('.ts') || file.endsWith('.tsx')) changed.set(file, [[1, Number.MAX_SAFE_INTEGER]]);
  }
  const sources = new Map([...new Set(graph.functions.map(f => f.file))].map(file => [file, readFileSync(path.join(root, file), 'utf8')]));
  const facts = graph.functions.map(fn => extractFact(fn, sources));
  const affected = facts.filter(f => (changed.get(f.fn.file) ?? []).some(([start, end]) => start <= f.fn.bodyEnd && end >= f.fn.line));
  const findings = checkOverlaps(facts, affected, reviewed.approvals);
  console.log('Semantic overlap gate: ' + affected.length + ' modified functions / ' + facts.length + ' indexed / ' + findings.length + ' unresolved matches');
  for (const finding of findings.slice(0, 80)) {
    console.error('POSSIBLE OVERLAP (' + finding.score + '): ' + finding.left + ' ~ ' + finding.right + '\nApproval fingerprint: ' + finding.key);
  }
  if (findings.length > 80) console.error('... ' + (findings.length - 80) + ' more matches');
  if (findings.length) {
    console.error('Review behavior, timing, writes and edge cases. If legitimately distinct, record a fingerprint-pinned approval with evidence tests in ' + REVIEW_FILE);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('Semantic overlap gate error: ' + error.message); process.exitCode = 2; }
}

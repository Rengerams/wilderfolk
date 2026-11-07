#!/usr/bin/env node
/**
 * Changed-file ownership gate: every function whose code changed, and every function in a new
 * source file, must have an explicit OWNERSHIP_OVERVIEW row, not only a module fallback.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const GRAPH = 'docs/tools/call-graph.json';
const ROOT = process.cwd();

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd();
}

function resolveBase() {
  const index = process.argv.indexOf('--base');
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (process.env.OWNERSHIP_BASE_REF) return process.env.OWNERSHIP_BASE_REF;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return 'HEAD';
}

function changedLines(diff) {
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

function commentOnlyLines(text) {
  const lines = text.split(/\r?\n/);
  const commentOnly = new Set();
  let inBlock = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let visible = false;
    let cursor = 0;
    while (cursor < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', cursor);
        if (end < 0) { cursor = line.length; break; }
        inBlock = false;
        cursor = end + 2;
        continue;
      }
      const char = line[cursor];
      if (line.startsWith('//', cursor)) break;
      if (line.startsWith('/*', cursor)) { inBlock = true; cursor += 2; continue; }
      if (char === '"' || char === "'" || char === '`') {
        visible = true;
        const quote = char;
        cursor++;
        while (cursor < line.length) {
          if (line[cursor] === '\\') { cursor += 2; continue; }
          if (line[cursor] === quote) { cursor++; break; }
          cursor++;
        }
        continue;
      }
      if (!/\s/.test(char)) visible = true;
      cursor++;
    }
    if (!visible) commentOnly.add(index + 1);
  }
  return commentOnly;
}

function main() {
  const graph = JSON.parse(readFileSync(path.join(ROOT, GRAPH), 'utf8'));
  if (!Array.isArray(graph.functions)) throw new Error(`${GRAPH} has no functions array`);

  const baseRef = resolveBase();
  let base;
  try {
    base = baseRef === 'HEAD' ? 'HEAD' : git('merge-base', 'HEAD', baseRef);
  } catch {
    throw new Error(`Cannot resolve ownership base "${baseRef}"; pass --base <ref>`);
  }
  const diff = git('diff', '--no-ext-diff', '--unified=0', base, '--', 'src');
  const changed = changedLines(diff);
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'src').split('\n').filter(Boolean);
  for (const file of untracked) changed.set(file, [[1, Number.MAX_SAFE_INTEGER]]);

  const changedFiles = [...changed.keys()].filter((file) => /\.(ts|tsx|mts)$/.test(file));
  if (changedFiles.length === 0) {
    console.log('Changed-file owner gate: no changed source files.');
    return;
  }

  let changedFunctions = 0;
  let explicitFailures = 0;
  let moduleOnlyWarnings = 0;
  const failures = [];

  for (const file of changedFiles) {
    const absolute = path.join(ROOT, file);
    let text;
    try { text = readFileSync(absolute, 'utf8'); } catch { continue; }
    const comments = commentOnlyLines(text);
    const ranges = changed.get(file) ?? [];
    const addedCodeLines = [];
    for (const [start, end] of ranges) {
      for (let line = start; line <= end; line++) if (!comments.has(line)) addedCodeLines.push(line);
    }
    const isNewFile = untracked.includes(file);
    const functions = graph.functions.filter((fn) => fn.file === file);
    for (const fn of functions) {
      const spanStart = fn.line;
      const spanEnd = Number.isInteger(fn.bodyEnd) ? fn.bodyEnd : fn.line;
      const changedCode = isNewFile || addedCodeLines.some((line) => line >= spanStart && line <= spanEnd);
      if (!changedCode) continue;
      changedFunctions++;
      if (fn.ownerKey && fn.ownerHow === 'entry function') continue;
      explicitFailures++;
      failures.push(`${fn.file}:${fn.line} ${fn.name} — ${fn.ownerKey ? `module owner only (${fn.ownerKey})` : 'no owner'}`);
    }
    moduleOnlyWarnings += functions.filter((fn) => fn.ownerKey && fn.ownerHow !== 'entry function').length;
  }

  console.log(`Changed-file owner gate: ${changedFiles.length} changed file(s), ${changedFunctions} changed/new function(s), ${explicitFailures} missing explicit owner(s).`);
  if (moduleOnlyWarnings) {
    console.log(`Warning: ${moduleOnlyWarnings} pre-existing function(s) in changed files rely on module-level ownership only; not failed because their code did not change.`);
  }
  if (failures.length) {
    for (const failure of failures.slice(0, 100)) console.error(`  ${failure}`);
    if (failures.length > 100) console.error(`  … ${failures.length - 100} more`);
    console.error('Add an explicit OWNERSHIP_OVERVIEW row for each changed/new function, or run `npm test -- owners`.');
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`Changed-file owner gate error: ${error.message}`);
  process.exitCode = 2;
}

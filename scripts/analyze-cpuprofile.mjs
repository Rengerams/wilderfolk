/**
 * Rank a V8 `.cpuprofile` by function, file and line: self time, total time, call edges, GC/native/
 * loader shares. Usage: `node scripts/analyze-cpuprofile.mjs <file> [--top=N] [--lines=N] [--json=out]`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const pathArg = args.find((a) => !a.startsWith('--')) ?? 'prof_out/1200.cpuprofile';
const topN = Number((args.find((a) => a.startsWith('--top=')) ?? '--top=25').slice(6));
const linesN = Number((args.find((a) => a.startsWith('--lines=')) ?? '--lines=15').slice(8));
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);

const prof = JSON.parse(readFileSync(pathArg, 'utf8'));
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const selfByNode = new Map();
for (const id of prof.samples ?? []) selfByNode.set(id, (selfByNode.get(id) ?? 0) + 1);

function frameOf(node) {
  return node.callFrame ?? { functionName: '', url: '', lineNumber: -1 };
}

function label(node) {
  const frame = frameOf(node);
  const name = frame.functionName || '(anonymous)';
  const file = (frame.url ?? '').split('/').pop() || '(native)';
  const line = (frame.lineNumber ?? -1) + 1;
  return { name, file, line, key: `${name} — ${file}:${line}` };
}

/** Samples that are not this thread running JavaScript. */
function noiseKind(node) {
  const frame = frameOf(node);
  const name = frame.functionName ?? '';
  const url = frame.url ?? '';
  if (name === '(idle)') return 'idle';
  if (name === '(garbage collector)') return 'gc';
  if (name === '(program)') return 'program';
  if (name === '(root)') return 'root';
  if (url.startsWith('node:') || /^\s*loader:/.test(url) || /(^|\/)module_job|^register-/.test(url)
    || /\/node_modules\/tsx\//.test(url)) return 'loader';
  if (url === 'native' || name === '(native)') return 'native';
  return null;
}

const isNoise = (node) => noiseKind(node) !== null;

/** Resolve a V8 call-frame URL to a readable source path, or null for bundled/native frames. */
function sourcePath(url) {
  if (!url) return null;
  try {
    if (url.startsWith('file:')) return fileURLToPath(url);
  } catch {
    return null;
  }
  return path.isAbsolute(url) ? url : null;
}

const sourceCache = new Map();
function sourceLine(file, line) {
  if (!file || !line || line < 1) return null;
  let lines = sourceCache.get(file);
  if (lines === undefined) {
    try {
      lines = readFileSync(file, 'utf8').split(/\r?\n/);
    } catch {
      lines = null;
    }
    sourceCache.set(file, lines);
  }
  return lines ? (lines[line - 1] ?? '').trim().slice(0, 88) : null;
}

/** Subtree totals via one iterative post-order pass, so a hot call graph cannot blow the stack. */
const subtree = new Map();
const order = [];
const seen = new Set();
const stack = [{ id: prof.nodes[0]?.id ?? 0, phase: 0 }];
while (stack.length > 0) {
  const item = stack.pop();
  if (item.phase === 0) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    stack.push({ id: item.id, phase: 1 });
    for (const child of nodes.get(item.id)?.children ?? []) stack.push({ id: child, phase: 0 });
  } else {
    order.push(item.id);
  }
}
for (const id of order) {
  const node = nodes.get(id);
  let total = selfByNode.get(id) ?? 0;
  for (const child of node?.children ?? []) total += subtree.get(child) ?? 0;
  subtree.set(id, total);
}

const parentByChild = new Map();
for (const node of prof.nodes) {
  for (const child of node.children ?? []) parentByChild.set(child, node.id);
}

const split = { js: 0, native: 0, gc: 0, idle: 0, program: 0, loader: 0, root: 0 };
const byFunction = new Map();
const byFile = new Map();
const edges = new Map();
const lines = new Map();
const chains = new Map();
const childTotals = new Map();

function bump(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

for (const node of prof.nodes) {
  const { key, file, name, line } = label(node);
  const self = selfByNode.get(node.id) ?? 0;
  const total = subtree.get(node.id) ?? 0;
  split[noiseKind(node) ?? 'js'] += self;

  const fn = byFunction.get(key) ?? { name, file, line, key, self: 0, total: 0, nodes: 0, noise: noiseKind(node) };
  fn.self += self;
  fn.total += total;
  fn.nodes += 1;
  byFunction.set(key, fn);
  bump(byFile, file, self);

  const parentId = parentByChild.get(node.id);
  if (parentId !== undefined && self > 0) {
    const edge = `${label(nodes.get(parentId)).key} → ${key}`;
    bump(edges, edge, self);
  }
  if (self > 0) {
    const names = [];
    let cursor = parentByChild.get(node.id);
    while (cursor !== undefined && names.length < 3) {
      const ancestor = label(nodes.get(cursor));
      if (ancestor.name !== '(root)' && !ancestor.name.startsWith('(idle')) names.push(ancestor.name);
      cursor = parentByChild.get(cursor);
    }
    const chainKey = names.length > 0 ? names.join(' ← ') : '(direct)';
    const chainsFor = chains.get(key) ?? new Map();
    bump(chainsFor, chainKey, self);
    chains.set(key, chainsFor);
  }
  for (const child of node.children ?? []) {
    const totals = childTotals.get(key) ?? new Map();
    bump(totals, label(nodes.get(child)).key, subtree.get(child) ?? 0);
    childTotals.set(key, totals);
  }
  for (const position of node.positionTicks ?? []) {
    const linePath = sourcePath(frameOf(node).url);
    if (!linePath) continue;
    const lineKey = `${linePath}:${position.line}`;
    const entry = lines.get(lineKey) ?? { file: linePath, line: position.line, name, ticks: 0 };
    entry.ticks += position.ticks;
    lines.set(lineKey, entry);
  }
}

const totalSamples = (prof.samples ?? []).length;
const ms = (samples) => samples.toFixed(0);
const pct = (samples) => ((samples / totalSamples) * 100).toFixed(1);
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

const ranked = (fn) => (fn.self > 0 || fn.total > 0) && !fn.noise;
const bySelf = [...byFunction.values()].filter((fn) => fn.self > 0 && !fn.noise).sort((a, b) => b.self - a.self);

/** Immediate callers of a ranked function, by the function's own self samples. */
const callersByFunction = new Map();
for (const edge of edges.entries()) {
  const [from, to] = edge[0].split(' → ');
  const callers = callersByFunction.get(to) ?? new Map();
  bump(callers, from, edge[1]);
  callersByFunction.set(to, callers);
}

function viaText(fn) {
  const fnChains = chains.get(fn.key);
  if (!fnChains || fnChains.size === 0) return '';
  const [chain, samples] = [...fnChains.entries()].sort((a, b) => b[1] - a[1])[0];
  return `via ${chain} (${((samples / fn.self) * 100).toFixed(0)}% of self)`;
}

console.log(`profile ${pathArg}`);
console.log(`nodes ${prof.nodes.length} · samples ${totalSamples} (~${ms(totalSamples)} ms of profiled time)`);
const parts = Object.entries(split).filter(([, value]) => value > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([kind, value]) => `${kind} ${ms(value)} (${pct(value)}%)`);
console.log(`time split: ${parts.join(' · ')}`);
if (split.loader > 0) {
  console.log('NOTE: loader time is module loading (tsx/ESM), not colony simulation — start the clock after import when measuring.');
}
if (split.idle > 0) {
  console.log(
    `NOTE: ${pct(split.idle)}% of samples are (idle) — the profiled *thread* was not running JS there. ` +
      `If the work ran in a child process, this profile is the wrapper.`,
  );
}
console.log('');

console.log(`TOP ${topN} BY SELF TIME (the leaf burning the CPU)`);
console.log(`${pad('function', 46)}${num('self', 7)}${num('self%', 7)}${num('total', 8)}${num('tot%', 7)}  where / via`);
for (const fn of bySelf.slice(0, topN)) {
  const via = viaText(fn);
  console.log(
    `${pad(fn.name.slice(0, 45), 46)}${num(ms(fn.self), 7)}${num(pct(fn.self), 7)}${num(ms(fn.total), 8)}${num(pct(fn.total), 7)}  ${fn.file}:${fn.line}${via ? `  ${via}` : ''}`,
  );
}

console.log('');
console.log(`TOP ${topN} BY TOTAL TIME (the step worth fixing)`);
console.log(`${pad('function', 46)}${num('total', 8)}${num('tot%', 7)}${num('self', 7)}${num('self%', 7)}  where`);
for (const fn of [...byFunction.values()].filter((fn) => fn.total > 0 && !fn.noise)
  .sort((a, b) => b.total - a.total).slice(0, topN)) {
  console.log(
    `${pad(fn.name.slice(0, 45), 46)}${num(ms(fn.total), 8)}${num(pct(fn.total), 7)}${num(ms(fn.self), 7)}${num(pct(fn.self), 7)}  ${fn.file}:${fn.line}`,
  );
}

const topTotals = [...byFunction.values()].filter((fn) => fn.total > 0 && !fn.noise)
  .sort((a, b) => b.total - a.total)
  .filter((fn) => (childTotals.get(fn.key)?.size ?? 0) > 1);
const topTotalFn = topTotals[0];
for (const fn of topTotals.slice(0, 3)) {
  const children = [...(childTotals.get(fn.key) ?? new Map())]
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log('');
  console.log(`TOP STEP BREAKDOWN — ${fn.name} (${ms(fn.total)} ms total, ${pct(fn.total)}%)`);
  for (const [key, samples] of children) {
    console.log(`${pad(key.slice(0, 78), 80)}${num(ms(samples), 8)}${num(((samples / fn.total) * 100).toFixed(1), 7)}%`);
  }
}

const lineTicks = [...lines.values()].filter((entry) => entry.ticks > 0).sort((a, b) => b.ticks - a.ticks);
const lineTickSum = lineTicks.reduce((sum, entry) => sum + entry.ticks, 0);
const line1Ticks = lineTicks.filter((entry) => entry.line === 1).reduce((sum, entry) => sum + entry.ticks, 0);
// tsx compiles each module to one line, so V8 cannot attribute ticks to source lines.
const linesUsable = lineTicks.length >= 20 && lineTickSum > 0 && line1Ticks / lineTickSum < 0.5;
if (linesUsable) {
  console.log('');
  console.log(`HOT SOURCE LINES (top ${linesN} by line ticks; V8 records these for optimised code)`);
  for (const entry of lineTicks.slice(0, linesN)) {
    const snippet = sourceLine(entry.file, entry.line) ?? '';
    const where = `${path.relative(process.cwd(), entry.file)}:${entry.line}`;
    console.log(`${pad(`${ms(entry.ticks)}t`, 6)}${pad(where, 44)}${pad(entry.name.slice(0, 26), 28)}${snippet}`);
  }
} else if (lineTicks.length > 0) {
  console.log('');
  console.log('NOTE: line ticks are unavailable — tsx compiles each module to one line, so V8 records line 1 for every function. Use a compiled build (tsc output) when you need per-statement hotspots.');
}

const topEdges = [...edges.entries()].filter(([key]) => !key.startsWith('(root) ')).sort((a, b) => b[1] - a[1]);
if (topEdges.length > 0) {
  console.log('');
  console.log(`CALL EDGES (top ${topN} by callee self time: the callee's own body under that caller)`);
  for (const [edge, samples] of topEdges.slice(0, topN)) {
    console.log(`${pad(edge.slice(0, 96), 98)}${num(ms(samples), 7)}${num(pct(samples), 7)}%`);
  }
}

console.log('');
console.log('BY FILE (self time summed per module)');
for (const [file, samples] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`${pad(file.slice(0, 51), 52)}${num(ms(samples), 8)}${num(pct(samples), 7)}%`);
}

const rootArg = args.find((a) => a.startsWith('--root='))?.slice(7);
if (rootArg) {
  const target = [...byFunction.values()].filter((fn) => fn.name.includes(rootArg))
    .sort((a, b) => b.total - a.total)[0];
  console.log('');
  if (!target) {
    console.log(`ROOT ${rootArg} — no matching function in this profile`);
  } else {
    console.log(`ROOT BREAKDOWN — ${target.key} (${ms(target.total)} ms total, ${ms(target.self)} ms self)`);
    const children = [...(childTotals.get(target.key) ?? new Map())].sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const [key, samples] of children) {
      console.log(`${pad(key.slice(0, 78), 80)}${num(ms(samples), 8)}${num(((samples / target.total) * 100).toFixed(1), 7)}%`);
    }
    console.log(`${pad('(self)', 80)}${num(ms(target.self), 8)}${num(((target.self / target.total) * 100).toFixed(1), 7)}%`);
  }
}

const callersArg = args.find((a) => a.startsWith('--callers='))?.slice(10);
if (callersArg) {
  const byCaller = new Map();
  for (const fn of bySelf) {
    if (!fn.name.includes(callersArg)) continue;
    for (const [caller, samples] of callersByFunction.get(fn.key) ?? []) bump(byCaller, caller, samples);
  }
  console.log('');
  console.log(`CALLERS OF ${callersArg} (its self samples, attributed to the immediate caller)`);
  for (const [key, samples] of [...byCaller.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)) {
    console.log(`${pad(key.slice(0, 70), 72)}${num(ms(samples), 8)}${num(pct(samples), 7)}%`);
  }
}

if (jsonOut) {
  const topChains = [];
  for (const fn of bySelf.slice(0, Math.max(topN, 50))) {
    const [chain, samples] = [...(chains.get(fn.key) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (chain) topChains.push({ function: fn.key, chain, samples });
  }
  const breakdowns = topTotals.slice(0, 3).map((fn) => ({
    function: fn.key,
    total: fn.total,
    breakdown: [...(childTotals.get(fn.key) ?? new Map())].sort((a, b) => b[1] - a[1])
      .slice(0, 20).map(([callee, samples]) => ({ callee, samples })),
  }));
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        path: pathArg,
        totalSamples,
        split,
        linesUsable,
        byFunction: [...byFunction.values()].filter(ranked),
        byFile: Object.fromEntries(byFile),
        hotLines: lineTicks.slice(0, Math.max(linesN, 50)),
        edges: topEdges.slice(0, Math.max(topN, 100)),
        chains: topChains,
        topSteps: breakdowns,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${jsonOut}`);
}

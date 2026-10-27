/**
 * Rank a V8 `.cpuprofile` by **function and by file**, with both self time (samples taken in that
 * function) and total time (samples in it *and* everything it called).
 *
 * Usage:
 *   node scripts/analyze-cpuprofile.mjs prof_out/1200.cpuprofile
 *   node scripts/analyze-cpuprofile.mjs <file> --top=40 --json=out.json
 *
 * Why both columns: self time names the leaf that burns the CPU, total time names the step worth
 * fixing. A daily pass that is 3 % self time but 60 % total is the thing to make cheaper; a small
 * helper that is 40 % self time is the thing to inline or memoise.
 *
 * Samples are 1 ms apart by default, so a sample count reads as milliseconds of CPU on the thread
 * that was profiled. `(idle)` is not CPU: it is the profiler failing to sample a running thread, so
 * a large `(idle)` share means the profile wrapped a process that was waiting (or the work ran in a
 * child process — `tsx` spawns one; profile with `--import tsx`, not the `tsx` CLI).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--')) ?? 'prof_out/1200.cpuprofile';
const topN = Number((args.find((a) => a.startsWith('--top=')) ?? '--top=25').slice(6));
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);

const prof = JSON.parse(readFileSync(path, 'utf8'));
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const selfByNode = new Map();
for (const id of prof.samples ?? []) selfByNode.set(id, (selfByNode.get(id) ?? 0) + 1);

function label(node) {
  const frame = node.callFrame;
  const name = frame.functionName || '(anonymous)';
  const file = (frame.url ?? '').split('/').pop() || '(native)';
  const line = (frame.lineNumber ?? -1) + 1;
  return { name, file, line, key: `${name} — ${file}:${line}` };
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

const byFunction = new Map();
const byFile = new Map();
for (const node of prof.nodes) {
  const { key, file, name } = label(node);
  const self = selfByNode.get(node.id) ?? 0;
  const total = subtree.get(node.id) ?? 0;
  const fn = byFunction.get(key) ?? { name, file, key, self: 0, total: 0, nodes: 0 };
  fn.self += self;
  fn.total += total;
  fn.nodes += 1;
  byFunction.set(key, fn);
  byFile.set(file, (byFile.get(file) ?? 0) + self);
}

const totalSamples = (prof.samples ?? []).length;
const ms = (samples) => samples.toFixed(0);
const pct = (samples) => ((samples / totalSamples) * 100).toFixed(1);

console.log(`profile ${path}`);
console.log(`nodes ${prof.nodes.length} · samples ${totalSamples} (~${ms(totalSamples)} ms of profiled time)`);
const idle = [...byFunction.values()].find((f) => f.name === '(idle)')?.self ?? 0;
if (idle > 0) {
  console.log(
    `NOTE: ${pct(idle)}% of samples are (idle) — the profiled *thread* was not running JS there. ` +
      `If the work ran in a child process, this profile is the wrapper.`,
  );
}
console.log('');

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log(`TOP ${topN} BY TOTAL TIME (the step worth fixing)`);
console.log(`${pad('function', 52)}${num('total', 8)}${num('tot%', 7)}${num('self', 8)}${num('self%', 7)}  where`);
for (const fn of [...byFunction.values()].sort((a, b) => b.total - a.total).slice(0, topN)) {
  console.log(
    `${pad(fn.name.slice(0, 51), 52)}${num(ms(fn.total), 8)}${num(pct(fn.total), 7)}${num(ms(fn.self), 8)}${num(pct(fn.self), 7)}  ${fn.file}:${fn.line}`,
  );
}

console.log('');
console.log(`TOP ${topN} BY SELF TIME (the leaf burning the CPU)`);
console.log(`${pad('function', 52)}${num('self', 8)}${num('self%', 7)}${num('total', 8)}  where`);
for (const fn of [...byFunction.values()].sort((a, b) => b.self - a.self).slice(0, topN)) {
  console.log(
    `${pad(fn.name.slice(0, 51), 52)}${num(ms(fn.self), 8)}${num(pct(fn.self), 7)}${num(ms(fn.total), 8)}  ${fn.file}:${fn.line}`,
  );
}

console.log('');
console.log('BY FILE (self time summed per module)');
for (const [file, samples] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`${pad(file.slice(0, 51), 52)}${num(ms(samples), 8)}${num(pct(samples), 7)}%`);
}

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      { path, totalSamples, idle, byFunction: [...byFunction.values()], byFile: Object.fromEntries(byFile) },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${jsonOut}`);
}

/** Print top self-time functions from a V8 .cpuprofile. Usage: node scripts/analyze-cpuprofile.mjs prof_out/1200.cpuprofile */
import { readFileSync } from 'fs';

const path = process.argv[2] ?? 'prof_out/1200.cpuprofile';
const prof = JSON.parse(readFileSync(path, 'utf8'));
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const self = new Map(); // nodeId → samples
for (const id of prof.samples) {
  const key = String(id);
  self.set(key, (self.get(key) ?? 0) + 1);
}
const totalSamples = prof.samples.length;
const rows = [];
for (const [id, count] of self) {
  const node = nodes.get(Number(id));
  if (!node) continue;
  const name = node.callFrame.functionName || '(anonymous)';
  const url = (node.callFrame.url ?? '').split('/').pop() ?? '';
  const line = node.callFrame.lineNumber ?? 0;
  rows.push({ name, url, line, count, pct: (count / totalSamples) * 100 });
}
rows.sort((a, b) => b.count - a.count);
console.log(`total samples: ${totalSamples}`);
console.log('top 22 self-time:');
for (const r of rows.slice(0, 22)) {
  console.log(`${r.pct.toFixed(1).padStart(5)}%  ${r.count.toString().padStart(6)}  ${r.name}  (${r.url}:${r.line})`);
}

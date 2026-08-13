/**
 * Regenerate src/graph.md: a mermaid dependency graph of every module
 * reachable from src/App.tsx.
 *
 * Run: npm run graph
 *
 * Replaces the former ts_dependency_graph-based script. ts_dependency_graph
 * pinned glob@7, which transitively pulled in the deprecated inflight package;
 * this version uses madge (already a project dependency) and is glob-free.
 */
import { writeFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import madge from 'madge';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const ENTRY = resolve(appRoot, 'src/App.tsx');
const OUT = resolve(appRoot, 'src/graph.md');

// Keep the same node-naming convention as the old tool: node id = basename
// without extension (escaping mermaid's reserved word `graph`), label = the
// module's backslash path relative to the project root.
function nodeIdFor(file) {
  const name = basename(file, extname(file)) || 'unknown';
  return name === 'graph' ? 'graph_xx' : name.replace(/[\[\]]/g, '_');
}
const labelFor = (file) => relative(appRoot, file).replace(/\//g, '\\');
const isSource = (file) => /\.(ts|tsx)$/.test(file);

const res = await madge(ENTRY, { extensions: ['.ts', '.tsx'] });
const obj = res.obj();
const baseDir = dirname(ENTRY);
const abs = (key) => resolve(baseDir, key);

// Only modules resolved by madge are guaranteed to exist; collect the
// reachable .ts/.tsx modules and the edges between them.
const nodes = new Map(); // abs path -> { id, label }
const edgeKeys = new Set(); // "fromAbs|toAbs"
for (const [fromKey, toKeys] of Object.entries(obj)) {
  const from = abs(fromKey);
  if (!isSource(from)) continue;
  nodes.set(from, { id: nodeIdFor(from), label: labelFor(from) });
  for (const toKey of toKeys) {
    const to = abs(toKey);
    if (!isSource(to)) continue;
    edgeKeys.add(`${from}|${to}`);
  }
}

const nodeList = [...nodes.values()].sort((a, b) => a.label.localeCompare(b.label));
const edgeList = [...edgeKeys].sort((a, b) => {
  const [aFrom, aTo] = a.split('|');
  const [bFrom, bTo] = b.split('|');
  return aFrom.localeCompare(bFrom) || aTo.localeCompare(bTo);
});

const lines = ['graph TD'];
for (const node of nodeList) lines.push(`   ${node.id}[${node.label}]`);
for (const edge of edgeList) {
  const [from, to] = edge.split('|');
  lines.push(`         ${nodes.get(from).id} --> ${nodes.get(to).id}`);
}
writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`Regenerated ${relative(appRoot, OUT)} (${nodeList.length} nodes, ${edgeList.length} edges)`);

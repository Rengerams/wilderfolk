import fs from 'node:fs';
const graph = JSON.parse(fs.readFileSync('docs/_current_dependency_graph.json', 'utf8'));
const all = new Map(graph.modules.map((m) => [m.source, m.dependencies.map((d) => ({ target: d.resolved, dynamic: d.dynamic, dependencyTypes: d.dependencyTypes }))]));
function sccCount(removed) {
  const index = new Map(); const low = new Map(); const stack = []; const on = new Set(); let next = 0; const comps = [];
  function visit(node) {
    index.set(node, next); low.set(node, next); next++; stack.push(node); on.add(node);
    for (const dep of all.get(node) ?? []) {
      if (node === removed.source && dep.target === removed.target) continue;
      if (!all.has(dep.target)) continue;
      if (!index.has(dep.target)) { visit(dep.target); low.set(node, Math.min(low.get(node), low.get(dep.target))); }
      else if (on.has(dep.target)) low.set(node, Math.min(low.get(node), index.get(dep.target)));
    }
    if (low.get(node) === index.get(node)) { const c = []; let x; do { x = stack.pop(); on.delete(x); c.push(x); } while (x !== node); if (c.length > 1) comps.push(c); }
  }
  for (const node of all.keys()) if (!index.has(node)) visit(node);
  return comps.sort((a,b)=>b.length-a.length);
}
const candidates = [];
for (const [source, deps] of all) for (const dep of deps) if (all.has(dep.target)) {
  const comps = sccCount({ source, target: dep.target });
  if (comps.length < 2 || comps[0]?.length < 10) candidates.push({ source, target: dep.target, dynamic: dep.dynamic, dependencyTypes: dep.dependencyTypes, sccCountAfter: comps.length, largestAfter: comps[0]?.length ?? 0 });
}
candidates.sort((a,b)=>a.largestAfter-b.largestAfter || a.sccCountAfter-b.sccCountAfter || a.source.localeCompare(b.source));
console.log(JSON.stringify(candidates, null, 2));

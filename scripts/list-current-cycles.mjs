import fs from 'node:fs';

const graph = JSON.parse(fs.readFileSync('docs/_current_dependency_graph.json', 'utf8'));
const modules = new Map(graph.modules.map((m) => [m.source, m.dependencies.map((d) => d.resolved)]));
const index = new Map();
const low = new Map();
const stack = [];
const onStack = new Set();
let next = 0;
const components = [];

function visit(node) {
  index.set(node, next);
  low.set(node, next);
  next += 1;
  stack.push(node);
  onStack.add(node);
  for (const target of modules.get(node) ?? []) {
    if (!modules.has(target)) continue;
    if (!index.has(target)) {
      visit(target);
      low.set(node, Math.min(low.get(node), low.get(target)));
    } else if (onStack.has(target)) {
      low.set(node, Math.min(low.get(node), index.get(target)));
    }
  }
  if (low.get(node) === index.get(node)) {
    const component = [];
    let item;
    do {
      item = stack.pop();
      onStack.delete(item);
      component.push(item);
    } while (item !== node);
    if (component.length > 1) components.push(component.sort());
  }
}

for (const node of modules.keys()) if (!index.has(node)) visit(node);
components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
const edgeReport = components.map((component) => {
  const set = new Set(component);
  return {
    component,
    edges: component.flatMap((source) => {
      const module = graph.modules.find((m) => m.source === source);
      return (module?.dependencies ?? [])
        .filter((dep) => set.has(dep.resolved))
        .map((dep) => ({ source, target: dep.resolved, dynamic: dep.dynamic, dependencyTypes: dep.dependencyTypes }));
    }),
  };
});
console.log(JSON.stringify({ moduleCount: modules.size, sccCount: components.length, components: edgeReport }, null, 2));

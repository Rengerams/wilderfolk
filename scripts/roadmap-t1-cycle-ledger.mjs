import fs from "node:fs";
import path from "node:path";

const snapshotPath = process.argv[2] ?? "docs/_roadmap_t1_dependency_snapshot.json";
const outputPath = process.argv[3] ?? "docs/V0_6_2_2_T1_IMPORT_TRACE_AND_CYCLE_LEDGER.md";
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const modules = snapshot.modules ?? [];
const bySource = new Map(modules.map((module) => [module.source, module]));
const graph = new Map();

for (const module of modules) {
  const edges = (module.dependencies ?? [])
    .map((dependency) => dependency.resolved)
    .filter((resolved) => resolved && bySource.has(resolved));
  graph.set(module.source, [...new Set(edges)]);
}

let index = 0;
const indexes = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();
const components = [];

function connect(node) {
  indexes.set(node, index);
  lowLinks.set(node, index);
  index += 1;
  stack.push(node);
  onStack.add(node);

  for (const next of graph.get(node) ?? []) {
    if (!indexes.has(next)) {
      connect(next);
      lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(next)));
    } else if (onStack.has(next)) {
      lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(next)));
    }
  }

  if (lowLinks.get(node) === indexes.get(node)) {
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    if (component.length > 1 || (graph.get(component[0]) ?? []).includes(component[0])) {
      components.push(component.sort());
    }
  }
}

for (const source of graph.keys()) {
  if (!indexes.has(source)) connect(source);
}

function chunkFor(source) {
  const normalized = source.replaceAll("\\", "/");
  if (normalized.includes("/src/game/renderer.ts") || normalized.includes("/src/game/renderer/") || normalized.includes("/src/game/huntrenderer") || normalized.startsWith("src/game/renderer.ts") || normalized.startsWith("src/game/renderer/") || normalized.startsWith("src/game/huntrenderer")) return "game-render";
  if (normalized.includes("/src/game/") || normalized.includes("/src/audio/") || normalized.startsWith("src/game/") || normalized.startsWith("src/audio/")) return "game";
  return "other";
}

function rel(source) {
  return source.replace(/^src[\\/]/, "src/");
}

const rendererToGame = [];
const gameToRenderer = [];
for (const [source, targets] of graph) {
  for (const target of targets) {
    const fromChunk = chunkFor(source);
    const toChunk = chunkFor(target);
    if (fromChunk === "game-render" && toChunk === "game") rendererToGame.push([source, target]);
    if (fromChunk === "game" && toChunk === "game-render") gameToRenderer.push([source, target]);
  }
}

function edgeDetails(component) {
  const members = new Set(component);
  return component.flatMap((source) => (bySource.get(source)?.dependencies ?? [])
    .filter((dependency) => members.has(dependency.resolved))
    .map((dependency) => ({ source, target: dependency.resolved, types: dependency.dependencyTypes ?? [] })));
}

function classify(component) {
  const edges = edgeDetails(component);
  if (edges.length && edges.every((edge) => edge.types.every((type) => /type/i.test(type)))) return "type-only";
  const joined = component.join(" ").toLowerCase();
  if (joined.includes("renderer") || joined.includes("render")) return "runtime and high-risk (renderer boundary)";
  if (joined.includes("gametick") || joined.includes("daycycle") || joined.includes("workforce") || joined.includes("moonhowler") || joined.includes("gameengine")) return "runtime and high-risk (simulation hub/owner)";
  return "runtime but requires owner review";
}

const lines = [
  "# v0.6.2.2 T1/T2 Import Trace and Cycle Ledger",
  "",
  `- Generated: ${new Date().toISOString().slice(0, 10)}`,
  "- Scope: `src/`, using the repository dependency-cruiser configuration and TypeScript project resolution.",
  "- Purpose: evidence for roadmap tasks T1/T2. This document records measurements and the single approved cycle reduction; it does not change `manualChunks` or simulation cadence.",
  "",
  "## T1 — Renderer/game chunk import trace",
  "",
  "> Baseline production build warning: `game-render -> game -> game-render`. The warning is a build-time chunk topology problem; it is not, by itself, proof that a runtime ownership boundary should be changed.",
  "",
  `The current ` + "`vite.config.ts`" + ` policy assigns renderer modules to ` + "`game-render`" + ` and other ` + "`src/game/`" + ` modules to ` + "`game`" + `. The measured cross-chunk runtime edges are listed below.`,
  "",
  "| Direction | Edge count | Interpretation |",
  "|---|---:|---|",
  `| game-render → game | ${rendererToGame.length} | Renderer modules import runtime game modules under the current chunk policy. |`,
  `| game → game-render | ${gameToRenderer.length} | Game modules import renderer modules under the current chunk policy. |`,
  "",
  "### game-render → game edges",
  "",
  ...(rendererToGame.length ? rendererToGame.map(([source, target]) => "- `" + rel(source) + "` → `" + rel(target) + "`") : ["- None detected in the resolved source graph."]),
  "",
  "### game → game-render edges",
  "",
  ...(gameToRenderer.length ? gameToRenderer.map(([source, target]) => "- `" + rel(source) + "` → `" + rel(target) + "`") : ["- None detected in the resolved source graph."]),
  "",
  "### T1 decision",
  "",
  "The production build warning is reproduced. The import trace is the required first evidence set. No chunk-policy or simulation-import change is made in this task. A boundary change should be a follow-up only after the listed runtime edges are reviewed against the renderer snapshot contract and startup/render measurements.",
  "",
  "## T2 — Dependency-cycle ledger",
  "",
  "The current resolved graph contains **" + components.length + " strongly connected component cycle(s)**. The prior audit recorded 43 warnings, but the current `audit:deps:cycles` command reports no violations because its focused invocation resolves zero modules; the discrepancy is preserved here rather than silently treated as a reduction.",
  "",
  "### Completed reduction",
  "",
  "One high-risk C03 edge was reduced: `src/game/worldEvents.ts` no longer imports runtime helpers through the `gameEngine.ts` compatibility barrel. It now imports `simEffects.ts` and `simHelpers.ts` directly. This preserves the existing world-event owner and cadence while removing the reverse `worldEvents → gameEngine` edge from the measured SCC. The resolved graph decreased from three SCCs to two.",
  "",
  "| ID | Classification | Modules |",
  "|---|---|---|",
  ...(components.length ? components.map((component, i) => `| C${String(i + 1).padStart(2, "0")} | ${classify(component)} | ${component.map((item) => `\`${rel(item)}\``).join(" ↔ ")} |`) : ["| — | No cycle detected by the complete resolved graph snapshot. | — |"]),
  "",
  "## Evidence and follow-up",
  "",
  "The source snapshot is `docs/_roadmap_t1_dependency_snapshot.json`; the baseline build output is `docs/_roadmap_t1_build_baseline.txt`; and the focused cycle command output is `docs/_roadmap_t1_cycles_baseline.txt`. These are local working evidence and should remain uncommitted unless the developer requests otherwise.",
  "",
  "The next engineering decision is to reconcile the historical 43-warning count with the current dependency-cruiser invocation and then select only one additional high-risk cycle reduction at a time. T1 remains unresolved because its renderer chunk edge is a separate build-topology issue.",
  "",
];
fs.writeFileSync(outputPath, lines.join("\n"));
console.log(`Wrote ${outputPath}`);
console.log(`cycles=${components.length} renderToGame=${rendererToGame.length} gameToRenderer=${gameToRenderer.length}`);

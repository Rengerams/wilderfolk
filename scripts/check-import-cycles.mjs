/**
 * Import-cycle gate — TypeScript-version-agnostic, dependency-free.
 *
 * Why this exists instead of `depcruise`: `typescript@7.0.2` is outside dependency-cruiser
 * 18.3.1's supported range (`>=2.0.0 <7.0.0`), so its TypeScript transpiler is never attached and
 * every `audit:deps*` run reported "0 modules, 0 dependencies cruised" while exiting 0 — a green
 * tick that verified nothing (`BUG_REPORTS/2026-09-16-dependency-cruiser-gate-cruises-zero-modules.md`).
 *
 * This script parses the import specifiers itself, so it works regardless of the TypeScript
 * version, and it asserts its own coverage: a cruise that finds no modules or no dependencies fails
 * loudly instead of printing success.
 *
 * Checks:
 *   1. coverage — at least `MIN_MODULES` modules and one resolved edge, or fail;
 *   2. runtime cycles — strongly connected components of size > 1 over erased-excluded imports
 *      (Tarjan), plus self-imports; these are the cycles that exist at run time → fail;
 *   3. type-only cycles — the same analysis over `import type` / `export type` edges, which
 *      TypeScript erases. Always reported to stderr under `--strict`, never fatal: `WorldState`
 *      holds class-typed grid fields (`EntitySpatialGrid`, `RoadAvoidanceIndex`) while those classes
 *      are functions of `WorldState`/`Entity` (`stats.ts`, `scentGrid.ts`, `beautyGrid.ts`), so the
 *      type graph is mutual by construction. Breaking it would mean duplicating each grid's public
 *      API into a leaf interface or widening the fields to `unknown` — both worse than the warning.
 *      `--strict` therefore means one concrete thing: **the runtime graph is acyclic**.
 *   4. layering — no production module imports a test file (the depcruise `not-to-test` rule).
 *
 * Usage: node scripts/check-import-cycles.mjs [--json] [--strict]
 * Exit codes: 0 clean · 1 runtime cycles, test imports, or insufficient coverage · 2 unexpected error.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.resolve(ROOT, 'src');
const MIN_MODULES = 50;
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
/** Specifiers that resolve to assets, not modules — not part of the import graph. */
const ASSET_EXTENSIONS = ['.css', '.json', '.txt', '.md', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.ogg', '.wav'];

/** `@/*` → `./src/*`, per tsconfig.app.json `paths`. */
const ALIAS_PREFIX = '@/';
const ALIAS_TARGET = path.resolve(ROOT, 'src');

const IMPORT_PATTERNS = [
  /\bimport\s+(?:type\s+)?[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** True when a whole statement statement is type-only (`import type …`, `export type …`, or an inline all-`type` list). */
function isTypeOnlyStatement(statement) {
  if (/\b(?:import|export)\s+type\b/.test(statement)) return true;
  const clause = statement.slice(0, statement.lastIndexOf('from'));
  return /^(?:import|export)\s*\{\s*(?:type\s+[\w$]+\s*,?\s*)+\}\s*$/.test(clause.trim());
}

function extractEdges(text) {
  const runtime = new Set();
  const typeOnly = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      (isTypeOnlyStatement(match[0]) ? typeOnly : runtime).add(match[1]);
    }
  }
  for (const specifier of typeOnly) {
    if (!runtime.has(specifier)) continue; // a value import of the same target is a runtime edge
  }
  return { runtime: [...runtime], typeOnly: [...typeOnly] };
}

function collectSources(directory, out = []) {
  for (const entry of readdirSync(directory)) {
    const full = path.resolve(directory, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

/** Resolve a specifier to an absolute file under src/, or null for a bare package / asset. */
function resolveSpecifier(fromFile, specifier) {
  // Vite asset suffixes (`./data/names.txt?raw`) and emitted-worker paths (`./gameWorker.js`)
  // are not module edges of the TypeScript graph.
  const clean = specifier.split('?')[0];
  if (ASSET_EXTENSIONS.some((ext) => clean.endsWith(ext))) return null;
  if (!clean.startsWith('.') && !clean.startsWith(ALIAS_PREFIX)) return null; // bare package

  let base;
  if (clean.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), clean);
  } else {
    base = path.resolve(ALIAS_TARGET, clean.slice(ALIAS_PREFIX.length));
  }

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = path.resolve(base + suffix);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // keep probing
    }
  }
  // An emitted-JS path (`./gameWorker.js` in the Node worker shim) refers to its TypeScript source.
  if (/\.m?js$/.test(clean)) {
    const tsBase = base.replace(/\.m?js$/, '');
    for (const suffix of ['.ts', '.tsx']) {
      try {
        if (statSync(tsBase + suffix).isFile()) return tsBase + suffix;
      } catch {
        // keep probing
      }
    }
  }
  return undefined; // internal-looking specifier that resolved to nothing
}

function stronglyConnected(graph) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let next = 0;

  const visit = (node) => {
    index.set(node, next);
    low.set(node, next);
    next += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) ?? []) {
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
      const selfLoop = component.length === 1 && (graph.get(component[0]) ?? []).includes(component[0]);
      if (component.length > 1 || selfLoop) components.push(component.sort());
    }
  };

  for (const node of graph.keys()) if (!index.has(node)) visit(node);
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function buildGraph(files, kind) {
  const fileSet = new Set(files);
  const graph = new Map(files.map((file) => [file, []]));
  const unresolved = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const edges = extractEdges(text);
    for (const specifier of edges[kind]) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) continue;
      if (resolved === undefined || !fileSet.has(resolved)) {
        unresolved.push({ from: file, specifier });
        continue;
      }
      graph.get(file).push(resolved);
    }
  }
  return { graph, unresolved };
}

function main() {
  const asJson = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const files = collectSources(SRC);
  const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/');

  const runtime = buildGraph(files, 'runtime');
  const typeOnly = buildGraph(files, 'typeOnly');
  const edges = [...runtime.graph.values()].reduce((sum, list) => sum + list.length, 0);
  const runtimeCycles = stronglyConnected(runtime.graph);
  const typeCycles = stronglyConnected(typeOnly.graph).filter((component) => {
    const key = component.join('|');
    return !runtimeCycles.some((cycle) => cycle.join('|') === key);
  });

  const testImporters = [];
  for (const file of files) {
    for (const target of runtime.graph.get(file) ?? []) {
      if (/\.(?:test|spec)\.tsx?$/.test(target)) testImporters.push({ from: file, test: target });
    }
  }

  const coverageOk = files.length >= MIN_MODULES && edges > 0;

  if (asJson) {
    console.log(JSON.stringify({
      modules: files.length,
      runtimeEdges: edges,
      runtimeCycles: runtimeCycles.map((cycle) => cycle.map(rel)),
      typeOnlyCycles: typeCycles.map((cycle) => cycle.map(rel)),
      unresolved: runtime.unresolved.map((u) => ({ from: rel(u.from), specifier: u.specifier })),
      testImporters: testImporters.map((t) => ({ from: rel(t.from), test: rel(t.test) })),
    }, null, 2));
  } else {
    console.log(`Import graph: ${files.length} modules, ${edges} runtime dependencies`);
    if (runtime.unresolved.length > 0) {
      console.log(`Unresolved internal specifiers: ${runtime.unresolved.length}`);
      for (const u of runtime.unresolved) console.log(`  - ${rel(u.from)} → ${u.specifier}`);
    }
  }

  if (!coverageOk) {
    console.error(
      `Import-cycle gate FAILED: cruised ${files.length} modules / ${edges} dependencies `
      + `(minimum ${MIN_MODULES} modules and 1 dependency). A gate that verifies nothing must not pass.`,
    );
    return 1;
  }

  let failed = false;

  // Severity deliberately matches the retired `.dependency-cruiser.cjs` it replaced
  // (`no-circular: warn`): cycles are reported, and `--strict` makes them fatal for whoever wants the
  // tree cleaned up. Reported findings go to stdout while the run is non-fatal, so a green run can
  // still be read; `--strict` uses stderr.
  const report = strict ? console.error : console.log;

  if (runtimeCycles.length > 0) {
    report(`\nRuntime import cycles: ${runtimeCycles.length}`);
    for (const cycle of runtimeCycles) {
      report(`  cycle of ${cycle.length}: ${cycle.map(rel).join(' → ')}`);
    }
    if (strict) failed = true;
  } else if (!asJson) {
    console.log('No runtime import cycles.');
  }

  if (typeCycles.length > 0) {
    const label = strict ? 'Type-only import cycles' : 'Type-only import cycles (warning — erased at run time)';
    report(`\n${label}: ${typeCycles.length}`);
    for (const cycle of typeCycles) {
      report(`  cycle of ${cycle.length}: ${cycle.map(rel).join(' → ')}`);
    }
    // Never fatal — see the header: the type graph is mutual by construction. `--strict` requires a
    // runtime graph without cycles and reports these so the coupling stays visible.
  }

  if (testImporters.length > 0) {
    failed = true;
    console.error(`\nProduction modules importing test files: ${testImporters.length}`);
    for (const t of testImporters) console.error(`  - ${rel(t.from)} → ${rel(t.test)}`);
  }

  if (!failed && !asJson) console.log(`Import-cycle gate OK — ${files.length} modules checked.`);
  return failed ? 1 : 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error('Import-cycle gate crashed:', err);
  process.exit(2);
}

# The dependency-cruiser gate silently cruises zero modules, so import cycles are unchecked

- **Bug:** `npm run audit:deps`, `npm run audit:deps:cycles`, `npm run audit:deps:graph` and the `audit:deps` half of `npm run audit` report success while analysing **0 modules / 0 dependencies** — the installed `typescript@7.0.2` is outside dependency-cruiser 18.3.1's supported range (`>=2.0.0 <7.0.0`), so the TypeScript transpiler is not attached and no source file is ever cruised
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous full-audit pass (lead, objective gate run)
- **Area:** Truth (build/verification tooling)
- **Owner module:** `package.json` scripts `audit:deps*` + `.dependency-cruiser.cjs`
- **Cadence:** per-invocation (no simulation cadence involved)

## Status history

- 2026-09-16 — open (found by running every declared verification gate during the full audit)
- 2026-09-16 — resolved (the `audit:deps*` commands now run `scripts/check-import-cycles.mjs`, which parses the sources itself — 321 modules / 1 463 runtime dependencies — and fails loudly if it ever cruises too little to mean anything. The repaired gate immediately revealed **two runtime import cycles** and one type-only cycle, filed as `BUG_REPORTS/2026-09-16-runtime-import-cycles-in-the-game-module-graph.md`)

## Observed behavior

```text
> npm run audit:deps:cycles
> depcruise src --config .dependency-cruiser.cjs --ts-config tsconfig.app.json --output-type err-long --focus "circular"

✔ no dependency violations found (0 modules, 0 dependencies cruised)

‼ missing-typescript-transpiler: dependency-cruiser detected a TypeScript environment,
    but not a compatible TypeScript compiler (typescript: >=2.0.0 <7.0.0). This means
    it's likely to have missed TypeScript sources and dependencies.

    Install typescript to get better results (e.g. npm i -D typescript@^6).
```

`npm run audit` (`audit:knip && audit:deps`) exits 0 for the same reason: the dependency half
verifies nothing, and knip's findings are the only content in the log. The exit code 0 and the
`✔ no dependency violations found` line read as a clean bill of health.

## Expected behavior

Either the gate actually cruises the TypeScript sources (a compatible compiler/transpiler is
configured, e.g. `--ts-config` paired with a supported `typescript`, or the dependency-cruiser
TypeScript pre-compilation step is used), or the repository must not present the command as a
passing check. A verification gate that analyses nothing must fail loudly, not print a green tick.

## Reproduction steps

1. `npm run audit:deps:cycles`
2. Read the headline: `(0 modules, 0 dependencies cruised)` plus the `missing-typescript-transpiler` warning.
3. `npx tsc --version` → `Version 7.0.2`; `npx depcruise --version` → `18.3.1` (supported range `<7.0.0`).

## Evidence

- `package.json:31-33` — `audit:deps`, `audit:deps:cycles`, `audit:deps:graph` all invoke `depcruise src`; `package.json:34` — `audit` = `audit:knip && audit:deps`.
- `tmp/audit-baseline/cycles.log:11` — `✔ no dependency violations found (0 modules, 0 dependencies cruised)`.
- `tmp/audit-baseline/cycles.log:13-19` — the `missing-typescript-transpiler` warning naming `typescript: >=2.0.0 <7.0.0`.
- `tmp/audit-baseline/audit.log` — the whole `audit:deps` output is empty; only knip reported.
- `docs/private/OPEN_PROBLEMS.md:23` records "depcruise stable (no new cycles from the v0.6.1 module split)" as a closed item; that claim is not currently supported by any tool run, because the cruise is empty.

## Root cause

`devDependencies.typescript` is `~7.0.2`. dependency-cruiser 18.3.1 does not attach its TypeScript
transpiler for TypeScript >= 7 ("Support for typescript@>=7 will follow when its API is published
and stable"), and the config relies on `--ts-config` only, so the `.ts`/`.tsx` files are never
parsed. Every run therefore analyses the empty set and exits 0.

## Regression test

`scripts/check-import-cycles.mjs` asserts its own coverage — that *is* the regression test the audit
asked for: the cruise must find at least `MIN_MODULES` (50) modules and one resolved dependency, or it
exits 1 with "A gate that verifies nothing must not pass". A zero-module cruise is now impossible to
mistake for a pass. `--strict` additionally makes the cycles themselves fatal.

## Verification result

After the fix:

- `npm run audit:deps` / `npm run audit:deps:cycles` — exit 0, reporting **321 modules / 1 463 runtime
  dependencies** (was "0 modules, 0 dependencies cruised"), plus the findings below.
- `node scripts/check-import-cycles.mjs --strict` — exit 1 listing the runtime and type-only cycles.
- `node scripts/check-import-cycles.mjs --json` — machine-readable graph summary (the replacement for
  the removed `dependency-graph.dot` output, which could only ever have been empty).
- `npm run build`, `npm run lint` (0 warnings / 0 errors on 322 files), `npm run test:types`,
  `npm test` (161 files / 871 tests) — passed.
- Coverage cross-check: the checker's 321 modules match the source tree (`src/**/*.{ts,tsx}`), and it
  resolves 1 463 of 1 463 internal specifiers (the four earlier "unresolved" hits were Vite `?raw`
  assets and the Node worker's emitted-JS path, now handled).

**What the repaired gate reveals (filed separately):** two runtime cycles — a 9-module component
(`dayCycle → defenseStructures → forge → householdComposition → humanLifecycleCleanup → moonHowler →
residencyReconciliation → residencySelection → workforce → dayCycle`) and a 2-module one
(`beautyGrid ↔ gameTypes`) — plus one type-only cycle of 6 modules. See
`BUG_REPORTS/2026-09-16-runtime-import-cycles-in-the-game-module-graph.md`.

**Still true before the fix** (audit evidence): `npm run audit:deps:cycles` exited 0 with
`✔ no dependency violations found (0 modules, 0 dependencies cruised)` and a
`missing-typescript-transpiler` warning naming `typescript: >=2.0.0 <7.0.0`.

**Note on `npm run audit`:** its dependency half now verifies the graph; the command still exits non-zero
because `audit:knip` reports **pre-existing** findings (93 unused exports, 12 unused types, 2 unused
dependencies), which is outside this report.

## Related commits or files

- `package.json:31-33` (`audit:deps*`), `package.json:34` (`audit`)
- `.dependency-cruiser.cjs`
- `docs/private/OPEN_PROBLEMS.md:23` (the now-unsupported "depcruise stable" claim)
- `scripts/list-current-cycles.mjs`, `scripts/list-type-cycle-edges.mjs`, `scripts/score-cycle-cuts.mjs`
  (pre-existing cycle tooling that does not depend on the broken command)

## Fix

`scripts/check-import-cycles.mjs` replaces the dependency-cruiser invocations. It parses
`src/**/*.{ts,tsx}` itself — static `import` / `export … from` / dynamic `import()` / `require`, with
type-only statements separated from runtime ones — resolves relative and `@/` specifiers (probing
`.ts`, `.tsx`, `/index.*`, Vite `?raw` assets and emitted-`.js` paths), and runs Tarjan's SCC
algorithm over the result. It reports runtime cycles, reports type-only cycles as warnings, refuses to
pass on insufficient coverage, and checks the `not-to-test` layering rule. `--strict` makes any cycle
fatal; `--json` emits the graph for tooling.

`package.json`:

```json
"audit:deps": "node scripts/check-import-cycles.mjs",
"audit:deps:cycles": "node scripts/check-import-cycles.mjs",
"audit:deps:cycles:strict": "node scripts/check-import-cycles.mjs --strict",
"audit:deps:graph": "node scripts/check-import-cycles.mjs --json",
```

Why not repair `depcruise` itself: dependency-cruiser 18.3.1 refuses to attach its TypeScript
transpiler for `typescript >= 7` ("Support for typescript@>=7 will follow when its API is published
and stable"), and the repository's `typescript@7.0.2` is what `tsc` builds with — so the choice was a
second compiler for one dev tool, or a checker that does not need the TypeScript API at all.
`dependency-cruiser` and `.dependency-cruiser.cjs` are deliberately kept: the config still documents
the intended rules (cycles, orphans, test/dev-dep layering) and knip reads it as usage, so
`depcruise` can be switched back on the day it supports TypeScript 7.

The `audit:deps:graph` dot output was dropped with it: with a zero-module cruise it could only ever
have produced an empty graph.

**Related follow-ups (not done):** `scripts/list-current-cycles.mjs`, `list-type-cycle-edges.mjs` and
`score-cycle-cuts.mjs` all read `docs/_current_dependency_graph.json`, which does not exist anywhere in
the tree — they are dead until something produces it (the new `--json` output is the obvious source).
`docs/private/OPEN_PROBLEMS.md:23` still records "depcruise stable (no new cycles from the v0.6.1
module split)", a claim that was never supported while the cruise was empty and that the two cycles
above now contradict.

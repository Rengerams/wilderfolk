# `npm run graph` fails: `scripts/graph.mjs` imports `madge`, which is not declared or installed

- **Bug:** `npm run graph` aborts with `ERR_MODULE_NOT_FOUND: Cannot find package 'madge'`, because
  `scripts/graph.mjs:14` imports `madge` while `package.json` neither depends on it nor is it present
  in `node_modules`. knip reports the same defect as its only *unlisted* dependency. The script's own
  comment asserts the opposite ("this version uses madge (already a project dependency)")
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous full-audit pass (lead, objective gate run)
- **Area:** Truth (build/developer tooling)
- **Owner module:** `scripts/graph.mjs` + `package.json`

## Status history

- 2026-09-16 — open (found by executing every declared npm script during the full audit)
- 2026-09-16 — resolved (owner decision: delete rather than adopt `madge` — the tool is superseded by dependency-cruiser (`audit:deps*`) and the cycle scripts; both the `graph` npm script and `scripts/graph.mjs` are gone, so `npm run audit:knip` no longer reports an unlisted dependency)

## Observed behavior

```text
> npm run graph
> node scripts/graph.mjs
node:internal/modules/package_json_reader:331
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'madge' imported from C:\Wilderfolk\scripts\graph.mjs
    at ModuleLoader.resolveSync (node:internal/modules/loader:766:17)
```

Exit code 1. `npm run audit:knip` independently reports:

```text
Unlisted dependencies (1)
madge  scripts/graph.mjs:14:19
```

## Expected behavior

A declared npm script either runs to completion with dependencies that the repository actually
declares, or the repository does not ship it. `scripts/graph.mjs`'s header claims madge is
"already a project dependency", so the file's own contract is that the command works.

## Reproduction steps

1. `npm run graph`
2. Observe `ERR_MODULE_NOT_FOUND` for `madge` and exit code 1.
3. `npm run audit:knip` → `Unlisted dependencies (1) madge scripts/graph.mjs:14:19`.

## Evidence

- `scripts/graph.mjs:9` — comment: "this version uses madge (already a project dependency) and is glob-free."
- `scripts/graph.mjs:14` — `import madge from 'madge';`
- `scripts/graph.mjs:31` — `const res = await madge(ENTRY, { extensions: ['.ts', '.tsx'] });`
- `package.json:32` — `"graph": "node scripts/graph.mjs"` is a declared script.
- `package.json` `devDependencies` contains no `madge`; `node_modules/madge` does not exist (checked).
- `tmp/audit-baseline/graph.log:12-14` — the `ERR_MODULE_NOT_FOUND` trace.

## Root cause

`madge` was removed from (or never added to) `package.json` while `scripts/graph.mjs` was kept. The
same audit run shows the graph/cycle tooling has since been replaced by dependency-cruiser
(`audit:deps*`) and by `scripts/list-current-cycles.mjs` / `scripts/list-type-cycle-edges.mjs`, so
`graph.mjs` is most likely a superseded tool left declared.

## Regression test

No test tier covers npm script executability. The cheapest guard is a CI-style smoke that runs each
declared script's `--help`-equivalent, or simply deleting the script and its file. Not yet written.

## Invariants checked

Not applicable. Note the interaction with
`BUG_REPORTS/2026-09-16-dependency-cruiser-gate-cruises-zero-modules.md`: the *replacement* graph
tooling (`depcruise`) is itself a no-op on this tree, so at present **no import-graph command in the
repository produces a graph**.

## Save/migration impact

None.

## Verification result

- `npm run graph` — **failed**, exit 1, `ERR_MODULE_NOT_FOUND: madge`.
- `npm run audit:knip` — reported `madge` as an unlisted dependency.
- `npm run build`, `npm run lint`, `npm run test:standard`, `npm run test:full-year`,
  `npm run test:browser` — all unaffected and green (this is a developer-tooling defect, not a
  runtime one).

## Related commits or files

- `scripts/graph.mjs`
- `package.json:32` (`graph` script)
- `scripts/list-current-cycles.mjs`, `scripts/list-type-cycle-edges.mjs`, `scripts/score-cycle-cuts.mjs`
- `BUG_REPORTS/2026-09-16-dependency-cruiser-gate-cruises-zero-modules.md`

## Fix

The script is superseded tooling, so it was deleted rather than given a dependency: the
`"graph": "node scripts/graph.mjs"` entry is gone from `package.json` and `scripts/graph.mjs` is
removed from the working tree. Import-graph and cycle work now has exactly one declared surface —
dependency-cruiser (`npm run audit:deps`, `audit:deps:cycles`, `audit:deps:graph`) plus
`scripts/list-current-cycles.mjs` / `scripts/list-type-cycle-edges.mjs`. No dependency was added, so
`npm run audit:knip`'s unlisted-dependency list is empty again.

**Follow-up (unchanged by this fix):** the replacement gate currently cruises zero modules — see
`BUG_REPORTS/2026-09-16-dependency-cruiser-gate-cruises-zero-modules.md`, which is still open.

## Verification result

After the deletion:

- `npm test` — passed (check:source, `dup`, and the vitest suite); nothing referenced either removed file (a recursive grep over `*.md`, `*.json`, `*.ts`, `*.tsx`, `*.mjs`, `*.mts` leaves only this report's own quotations).
- `npm run build`, `npm run lint` (0 warnings / 0 errors), `npm run test:types` — passed.
- Before the fix (audit evidence): `npm run graph` exited 1 with `ERR_MODULE_NOT_FOUND: madge`, and `npm run audit:knip` listed `madge scripts/graph.mjs:14:19` as an unlisted dependency.

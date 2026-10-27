# The repaired import-graph gate reveals two runtime import cycles in the game module graph

- **Bug:** the game module graph contains **two runtime import cycles** and one type-only cycle. They were invisible until now because the gate that should report them analysed nothing: `audit:deps*` cruised 0 modules while printing a green tick (`BUG_REPORTS/2026-09-16-dependency-cruiser-gate-cruises-zero-modules.md`). Reporting them is the repaired gate's first finding, not a new regression — the cycles are old, and `docs/private/OPEN_PROBLEMS.md:23` ("depcruise stable (no new cycles from the v0.6.1 module split)") was never supported by a working run
- **Status:** resolved — the runtime graph is acyclic (322 modules, `audit:deps:cycles:strict` exits 0); the type-only component is irreducible and stays a reported warning, by design (see Fix)
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** revealed by `scripts/check-import-cycles.mjs` after the dependency-cruiser gate was repaired
- **Area:** Truth (module architecture)
- **Owner module:** the modules named below
- **Cadence:** not applicable (static)

## Status history

- 2026-09-16 — open (the repaired gate reported them on its first run: 321 modules / 1 463 runtime dependencies cruised, 2 runtime cycles + 1 type-only cycle)
- 2026-09-16 — partially resolved (the 2-module `beautyGrid ↔ gameTypes` runtime cycle is gone: `gameTypes.ts` imported `BeautyGrid` through an inline `import('./beautyGrid')` type, which the extractor read as a runtime edge. It is now a top-level `import type`, matching the file's other type imports. The 9-module runtime component and the type-only component remain — this report stays open for those)
- 2026-09-16 — resolved for the runtime graph. The 9-module component is broken by two changes that remove the two real back-edges into the `dayCycle` hub, not by suppressing the finding: `householdComposition` now takes its housing constant from the module that defines it, and the Moon Howler *form* rules moved below both the policy and the death primitive. `audit:deps:cycles:strict` exits 0 on 322 modules / 1 470 edges with no runtime cycle. The type-only component of 7 is **kept as a reported warning**: `--strict` now means "the runtime graph is acyclic" (see Fix for why the type graph cannot be untangled without weakening types)

## Observed behavior

`npm run audit:deps:cycles` (non-fatal mode — the severity the old config used, `no-circular: warn`)
reports:

```text
Runtime import cycles: 1
  cycle of 9: src/game/dayCycle.ts → src/game/defenseStructures.ts → src/game/forge.ts
            → src/game/householdComposition.ts → src/game/humanLifecycleCleanup.ts
            → src/game/moonHowler.ts → src/game/residencyReconciliation.ts
            → src/game/residencySelection.ts → src/game/workforce.ts → src/game/dayCycle.ts

Type-only import cycles (warning — erased at run time): 1
  cycle of 7: src/game/adjacencyIndex.ts → src/game/beautyGrid.ts → src/game/challenges.ts
            → src/game/gameTypes.ts → src/game/scentGrid.ts → src/game/spatialGrid.ts
            → src/game/stats.ts → src/game/adjacencyIndex.ts
```

(The 2-module `beautyGrid ↔ gameTypes` runtime pair that the first run reported is fixed — see the
status history. `beautyGrid.ts` still reaches `gameTypes` through *both* a value import and a
`import type`, which is why it now sits inside the type-only component.)

(`node scripts/check-import-cycles.mjs --strict` exits 1 with the same lists.)

## Expected behavior

The runtime graph is acyclic: no value import path returns to its own module. Type-only cycles are
tolerated (TypeScript erases them) but reported, because the old config's `tsPreCompilationDeps: true`
counted them.

## Reproduction steps

1. `npm run audit:deps:cycles` — prints the three components above (exit 0, warning severity).
2. `node scripts/check-import-cycles.mjs --strict` — same lists, exit 1.
3. `node scripts/check-import-cycles.mjs --json` — the same components as machine-readable arrays.

## Evidence

- `scripts/check-import-cycles.mjs` — parser + Tarjan SCC over `src/**/*.{ts,tsx}`; 321 modules, 1 463
  runtime edges, every internal specifier resolved (Vite `?raw` assets and the Node worker's emitted-JS
  path handled explicitly).
- The 2-module cycle is a value-level pair: `beautyGrid.ts` imports a runtime symbol from
  `gameTypes.ts` while `gameTypes.ts` imports `beautyGrid`'s; the 9-module component runs through
  `dayCycle` → … → `workforce` and back.
- `docs/private/OPEN_PROBLEMS.md:23` — the unsupported "no new cycles" claim.
- Exact per-module edges for every component are available from `--json`; they are deliberately not
  hand-copied here so the report cannot drift from the gate.

## Root cause

`dayCycle.ts` is a facade: besides owning the clock and the age constants, it re-exports from
`dayCycleClock`, `humanSchedule`, `residencyOccupancy`, `householdComposition`, `residencySelection`,
`residencyReconciliation` and `humanLifecycleCleanup`. Importing three different owners through one
module hides the true dependency graph, so two edges that had always existed were invisible until the
gate could see them:

1. **A constant fetched through the hub.** `householdComposition.ts` imported `HUMAN_MOVE_OUT_MIN_AGE`
   from `dayCycle`, which re-exports it from `residencyOccupancy.ts` — the module that defines it. The
   hub import added `householdComposition → dayCycle` to a graph where `dayCycle → householdComposition`
   also exists, closing the residency branch (`dayCycle → residencySelection → householdComposition →
   dayCycle`, and the longer variants through `residencyReconciliation` and `workforce`).
2. **Policy and primitive importing each other.** `humanLifecycleCleanup.ts` (the death primitive,
   called from every death path) needed `finalizeMoonHowlerDeath` and `isSettlerRelationshipEntity`
   from `moonHowler.ts`, while `moonHowler.ts` kills the exorcising priest through `killHuman` — which it
   reached through the `dayCycle` facade. `dayCycle → humanLifecycleCleanup → moonHowler → dayCycle`
   was therefore a genuine mutual dependency, not an artefact.

## Regression test

The gate itself is the regression test: `scripts/check-import-cycles.mjs` runs on every
`npm run audit:deps`, prints every component, asserts its own coverage, and `audit:deps:cycles:strict`
is now the fatal form (`--strict` → runtime cycles, test imports and lost coverage exit 1).

## Invariants checked

`npm run test:full-year` and `npm test` — green before and after the fix (the cycles were a structural
property, not a runtime fault), with identical full-year totals, which is what makes the relocation
provably behaviour-preserving.

## Save/migration impact

None.

## Verification result

- `node scripts/check-import-cycles.mjs` — 322 modules / 1 470 runtime dependencies, **no runtime
  import cycles**, one type-only component reported, exit 0.
- `node scripts/check-import-cycles.mjs --strict` (and `npm run audit:deps:cycles:strict`) — exit 0;
  the type-only component is still printed to stderr.
- `npm run build` — passed. `npm run test:types` — exit 0. `npm run lint` — 0 warnings / 0 errors.
- `npm test` — 163 files / 883 tests passed. `npm run test:full-year` (360 days / 25 920 ticks, seed
  12345) — exit 0 with the same totals as before the relocation: settlers 69, births 27, marriages 48,
  divorces 33, scandal events 183.
- `npm run graph:calls` — 322 files / 2 428 functions, 100 % of them matched to a recorded owner
  (`moonHowlerForm.ts` functions map to the `moonHowler` decision row), 0 ambiguous call sites.

## Related commits or files

- `scripts/check-import-cycles.mjs` (the gate that reports them)
- `src/game/moonHowlerForm.ts` (new owner of the Moon Howler form rules)
- `src/game/moonHowler.ts`, `src/game/humanLifecycleCleanup.ts`, `src/game/humanTick.ts`,
  `src/game/simulation/simulationInvariants.ts`, `src/game/householdComposition.ts`,
  `src/game/simulation/decisionRegistry.ts`
- `BUG_REPORTS/2026-09-16-dependency-cruiser-gate-cruises-zero-modules.md` (why they were invisible)
- `.dependency-cruiser.cjs` (`no-circular: warn`, `tsPreCompilationDeps: true`)
- `docs/private/OPEN_PROBLEMS.md:23`

## Fix

**Done (2026-09-16):** the 2-module cycle. `gameTypes.ts` declared `beautyGrid?: import('./beautyGrid').BeautyGrid`; the inline `import()` type is a type-only edge at run time, but it read as a value import, closing a cycle with `beautyGrid.ts`'s value import from `gameTypes`. It is now a top-level `import type { BeautyGrid } from './beautyGrid';`, the same style as the file's other type imports. The runtime graph lost that pair; the gate went from 2 runtime cycles to 1.

**Done (2026-09-16):** the 9-module runtime component, from the two root causes above.

1. `householdComposition.ts` now imports `HUMAN_MOVE_OUT_MIN_AGE` from `residencyOccupancy.ts`, the
   module that defines it. The `dayCycle` re-export stays for other callers, so no caller outside the
   cycle changes; the hub's `dayCycle → householdComposition` edge is unaffected and now one-way, which
   also takes `residencySelection`, `residencyReconciliation` and `workforce` out of the component.
2. New `src/game/moonHowlerForm.ts` owns the Moon Howler **form** rules and nothing else: `HUMAN_FORM`,
   `RevertToHumanFormOptions`, `revertToHumanForm`, `finalizeMoonHowlerDeath`,
   `isSettlerRelationshipEntity` and the two private prison helpers that only `revertToHumanForm` uses.
   `moonHowler.ts` keeps the policy (curse, full-moon cycle, exorcism, sync) and imports the form
   module; `humanLifecycleCleanup.ts`, `humanTick.ts` and `simulationInvariants.ts` import the two
   predicates from the form module instead of from the policy. The dependency now points one way —
   policy and primitive both depend on the form rules — and `moonHowler → killHuman` is no longer a
   return trip. The Moon Howler registry row in `decisionRegistry.ts` names `moonHowlerForm.ts` so the
   moved functions stay owned. This is a pure relocation: `npm run test:full-year` on seed 12345 ends
   with the same totals as before the move (settlers 69, births 27, marriages 48, divorces 33, scandal
   events 183), and the six Moon Howler test files pass unchanged except for the import path of
   `revertToHumanForm` in `tests/moonHowler.staleLeaderOccupation.test.ts`.

**Not fixed, deliberately reported:** the 7-module **type-only** component
(`adjacencyIndex → beautyGrid → challenges → gameTypes → scentGrid → spatialGrid → stats`). It is a
star through `gameTypes.ts`: `WorldState` holds class-typed grid fields (`EntitySpatialGrid`,
`RoadAvoidanceIndex`) and `BeautyGrid`/`ScentGrid`/`AdjacencyIndex`, while every one of those modules
takes `WorldState`/`Entity`/`Building` back. The spoke cannot be cut from the grid side (the classes
are functions of the world) nor from the `gameTypes` side without either duplicating each grid's whole
public API into a leaf interface or widening the fields to `unknown` — both strictly worse than the
mutual type reference TypeScript erases anyway. `scripts/check-import-cycles.mjs --strict` therefore
fails on runtime cycles, test imports and lost coverage, and always prints the type-only component to
stderr without failing. That matches this report's own expected behaviour and `.dependency-cruiser.cjs`
(`no-circular: warn`).

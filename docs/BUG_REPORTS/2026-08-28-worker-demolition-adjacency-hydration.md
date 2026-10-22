# Bug: Worker-backed demolition crashes when optimistic display adjacency is a plain object

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer-provided browser console log
- Area: Truth | worker | command | UI
- Owner module: Optimistic command display hydration, adjacency owner, and worker-recovery path
- Cadence: Player command; worker snapshot and command-result reconciliation

## Status history

- 2026-08-28 — investigating: browser console showed `TypeError: adjacency?.removeById is not a function` from the local optimistic demolition path, followed by worker fallback/restart failures and repeated invalid commands.
- 2026-09-09 — resolved: no code calls methods directly on `world.adjacency`; `demolishBuilding` routes through `unindexAdjacency` → `ensureAdjacencyIndex`, whose `instanceof AdjacencyIndex` guard rebuilds a real index from plain structuredClone/deserialized objects and no-ops when no cache exists; optimistic display worlds are hydrated with adjacency stripped (`worldRuntimeCaches`). Fix commits de98bd6/681eaf2/d9afba6 (08-29), 312ccef, 07cc936, 01a9119. Regression: `demolish.roundtrip.test.ts`, `gameLoop.commandDispatch.test.ts`, `workerCommand.roundtrip.test.ts`.

## Observed behavior

With the simulation worker active, demolishing a building causes the main-thread optimistic display command to call an adjacency method on a plain deserialized object. The command throws, worker fallback is triggered despite a short observed tick time, automatic worker recovery repeatedly fails to start, and later commands are reported invalid.

## Expected behavior

The optimistic display world must be hydrated with usable adjacency methods before any domain command runs, or the domain transition must defensively accept its serialized representation. A failed display prediction must not corrupt worker state, cause repeated restarts, or produce a command storm. The authoritative worker command result must remain the sole truth.

## Reproduction steps

1. Run a worker-backed game with an imported, restored, or worker-snapshot display state.
2. Select an eligible player building and issue Demolish.
3. Observe the optimistic command application and browser console.
4. Verify that no adjacency method error, worker fallback loop, or invalid-command flood occurs.

## Evidence

Developer-provided browser console log on 2026-08-28. The stack traces `onDemolish` through `applyCommandLocal` and reports `adjacency?.removeById is not a function`.

## Root cause

Resolved 2026-09-13 (this section previously read "Pending investigation"). A world
that arrives from a save or a worker snapshot carries `adjacency` as a **plain
serialized object**, not the live index class. Demolition called a method through
the optional chain (`adjacency?.removeById(...)`), which is exactly the reported
`adjacency?.removeById is not a function`: the field existed, so `?.` did not save
it, and the plain object had no method.

## Fix

Shipped (verified in the current tree):

- `adjacencyIndex.ts:159-168` — `ensureAdjacencyIndex` rebuilds when the field is
  not an `AdjacencyIndex` (`if (existing instanceof AdjacencyIndex) return existing;`)
  instead of trusting it, so a hydrated world repairs itself on first use.
- `adjacencyIndex.ts:180-189` — `unindexAdjacency` returns early when `state.adjacency`
  is absent and otherwise goes through `ensureAdjacencyIndex(state).removeById(...)`,
  never through a raw method call on the stored value.
- `buildingMaintenanceActions.ts:139-140` — `demolishBuilding` unindexes, then sets
  `state.adjacency = undefined`, so no stale index survives the transition;
  `commands.ts:346-347` routes the demolition through the shared worker command.
- `worldRuntimeCaches.ts:28` — `invalidateWorldRuntimeCaches` strips `adjacency`,
  and both `hydrateWorldRuntimeCaches` (`:35-42`) and `createOptimisticDisplayWorld`
  (`:48-56`) go through it, so optimistic display prediction never starts from a
  stale index.

## Regression test

`tests/demolition.adjacencyHydration.test.ts` (2 cases) — exactly the scenario this
section used to mark pending:

1. a world whose `adjacency` is a plain serialized object (`{ cells: [], version: 1 }`)
   is demolished through `applyWorkerCommand`; asserted not to throw, the building is
   gone, and no stale index survives;
2. `createOptimisticDisplayWorld` of that hydrated world strips the stale index and
   still accepts a following demolition command.

`tests/demolish.roundtrip.test.ts`, `tests/gameLoop.commandDispatch.test.ts`, and
`tests/workerCommand.roundtrip.test.ts` cover the surrounding transitions.

## Invariants checked

Command result cannot be overwritten by an older tick; worker state remains authoritative; a demolished building is removed cleanly; stale selection and adjacency references are cleared; display prediction never writes back to the worker.

## Save/migration impact

None — hydration compatibility and command execution resilience only. No save field
was added, removed, or reinterpreted.

## Verification result

Verified 2026-09-13: `tests/demolition.adjacencyHydration.test.ts` 2/2, `tsc -b` 0,
`oxlint --type-aware --type-check` 0 warnings / 0 errors on 320 files, full local
suite 100 files / 531 tests passing. No direct method call on the `adjacency` field
remains (all `.adjacency` references are plain assignments/reads).

## Related files

- `src/game/simWorker/commands.ts`
- command/display reconciliation and worker recovery code
- adjacency owner and building demolition transition
- save/load or view-state hydration code

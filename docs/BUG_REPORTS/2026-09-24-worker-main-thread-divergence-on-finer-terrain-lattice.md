# 2026-09-24

- Bug: `workerMainThread.parity` fails intermittently when the terrain lattice is changed
- Status: open
- Date discovered: 2026-09-24
- Version/build: 0.6.5 working tree
- Reporter: terrain-resolution pass
- Area: worker
- Owner module: `src/game/simWorker/**`, `tests/workerMainThread.parity.test.ts`
- Cadence: unknown — it has not been made to fail on demand

## Status history

- 2026-09-24 — open (seen once during a wider full-suite run; **not** reproducible in isolation,
  see Evidence — so this is recorded as an intermittent observation, not a diagnosed defect)

## Observed behavior

During a full `npm run test:standard` run in which `TERRAIN_CELL` was temporarily `48`, three
tests failed. One of them was `workerMainThread.parity`, reporting that the worker's persisted
payload and the main thread's persisted payload were not deeply equal:

```
FAIL tests/workerMainThread.parity.test.ts > seeded worker versus main-thread parity >
persists the same colony whether the ticks ran in the worker or on the main thread
AssertionError: expected { entities: [ …(480) ], …(104) } to deeply equal { entities: [ …(480) ], …(104) }
❯ tests/workerMainThread.parity.test.ts:114:27
```

A previous, separate observation in the same session reported a position pair differing by
≈ 6 × 10⁻⁵ world units. **That number could not be confirmed afterwards** and should not be
treated as evidence; it is recorded here only so a future reader does not re-derive it from
nothing.

## Expected behavior

Same seed + same tick count must produce the same colony in both realms, as
`Roadmap_V0_6.5.MD` states under "The load-bearing engineering facts": *determinism from `simRng`
owner streams — same seed, same world, across save/load and worker hand-off.*

## Reproduction steps

**Not reproducible.** What was tried, in order:

1. `TERRAIN_CELL = 48`, `npx vitest run tests/workerMainThread.parity.test.ts` — **passes.**
2. `TERRAIN_CELL = 16` (the shipping value in the tree today), the same command — **passes.**
3. A purpose-built interleaved diagnostic (`TERRAIN_CELL = 16`): generate the world in two module
   registries via `vi.resetModules()`, compare a hash of `elevation`/`moisture`/`temperature`/
   `riverDist`/`terrain`/`pathGrid`, then tick both worlds side by side for 240 ticks and compare
   the **full save payload** (`_savedAt` excluded, as the real test excludes it) after every tick.
   Result: identical map hash, identical tick-0 hash, **no divergence at any of the 240 ticks.**
   The only field that ever differed was `_savedAt`, which is a wall-clock stamp rather than state.

The one run that failed was a whole-suite run. The leading hypothesis is therefore
**cross-test interference** — module-level state shared between test files in the same worker
(`vitest.config.ts` sets `environment: 'node'` with default isolation, but module-level caches in
`terrainGrid`'s `WeakMap`, `pathfinding`'s grid caches, `entityTypeCache`'s per-world `WeakMap` and
`simRng`'s stream table are all process-global). That is a hypothesis, not a finding: it has not
been demonstrated, and a reproduction is the first step for whoever picks this up.

## Evidence

The full-suite run that failed, with `TERRAIN_CELL = 48`:

```
Test Files  3 failed | 263 passed (266)
Tests  3 failed | 1456 passed | 2 skipped (1461)
 FAIL  tests/medium-N4-campAnchor.test.ts > camp anchor inside the human loop (N4) …
 FAIL  tests/pathfinding.test.ts > pathfinding > snaps a blocked start or goal to the nearest walkable tile
 FAIL  tests/workerMainThread.parity.test.ts > seeded worker versus main-thread parity …
```

The other two failures in that run are **expected and understood**: both pin terrain by cell
coordinate, so a different lattice moves what they assert about. Those were addressed by making
the resolution change safe a different way (the water layer was split onto its own lattice first),
not by touching the fixtures.

## Root cause

**Not established.** Failed approach: reading the parity test and reasoning about which float
could differ. The reasoning produced a specific claim (a ≈ 6 × 10⁻⁵ drift, "accumulating") that
the diagnostic then falsified for the shipping constants, so it was withdrawn rather than left in
the record as a fact.

The productive next step is a reproduction: run the acceptance suite with `--sequence.shuffle` and
a fixed seed to see whether the failure follows the file order rather than the terrain, and if it
does, find which module-global outlives its test file.

## Related commits or files

- `tests/workerMainThread.parity.test.ts` — the detector
- `src/game/terrain/terrainGrid.ts` — `TERRAIN_CELL`; it was `48` in the failing run and is `16` now
- `src/game/pathfinding.ts`, `src/game/entityTypeCache.ts`, `src/game/simRng.ts` — module-global
  caches that a neighbouring test file could leave in a non-default state

# Name of file: 2026-10-02

- Bug: The day rollover burns 53–63 s of CPU in residency assignment, freezing the colony for a minute at every new day
- Status: investigating (first fix measured: 58.5 s → 17.7 s; still above the 10 s watchdog, so the day-start stall is shorter but real)
- Date discovered: 2026-10-02
- Version/build: 0.6.5.0, the owner's own save (`New Frontier`, Y2 D189, Huge 256×192, tick 39567)
- Reporter: owner ("it happens when the new day starts", "logic because on 00:00 a lot of processes happen") + agent measurement
- Area: performance
- Owner module: `src/game/residencySelection.ts`, `src/game/residencyReconciliation.ts` (called from `tickLayerAssign` and from the immigration path in `tickLayerDaily`)
- Cadence: every in-game day (`tick % TICKS_PER_DAY === 0`), i.e. every 72 ticks

## Status history

- 2026-10-02 — open (save loaded through the game's own restore path; the day-boundary tick profiled; the hot functions and the O(families × residences × humans) shape identified)

## Observed behavior

The owner's colony freezes for about a minute at the start of every new day. Measured on the real save
in Node (`tsx scripts/perf-at-pop.ts`, `PERF_SAVE=<save>`), one tick at a time:

```text
tick 39599 (day-boundary=no)    76.4ms wall
tick 39600 (day-boundary=yes) 58470.4ms wall  52609.0ms CPU
tick 39601 (day-boundary=no)    84.6ms wall
```

Repeated runs put the boundary tick at **63.7 s and 80.1 s of wall time** (52.6–63.7 s of that is CPU,
not waiting), against a normal tick of 68–310 ms. In the game this one tick exceeds the loop's 10 s
worker watchdog, so the watchdog tears the worker down mid-day (`gameLoop` → `fallbackFromWorker`), the
sim moves onto the render thread, and the catch-up burst runs up to 20 more of them per frame — which is
why the frame rate collapses to 0–5 fps and the CPU still looks idle (one core of eight is 12 %).

## Expected behavior

A day boundary should cost roughly what a normal tick costs. `PACING_TICK_BUDGET_MS` is 1000 ms
(`scripts/colonyHealth.ts:58`), and the day-boundary work is ~60× that.

## Reproduction steps

1. Load the owner's 982-human save (or any colony of a few hundred to a thousand settlers).
2. Tick it 72 times, or park the clock one tick before a boundary.
3. Measure each tick's wall **and** CPU time — wall alone cannot tell a slow tick from a starved one.
   `PERF_SAVE=<save> PERF_DAY_ONE=1 PERF_TICKS=2 PERF_TRACE=1 npx tsx scripts/perf-at-pop.ts`

## Evidence

Profiled the boundary tick in-process (`NODE_OPTIONS="--import tsx --cpu-prof …"` — **not** the `tsx`
CLI, which profiles the wrapper and reports `(idle)` for everything). 49 861 samples ≈ 49.9 s of CPU,
`(idle)` **0.0 %**.

Total time (the step worth fixing):

| function | total ms | % | self ms | self % |
|---|---|---|---|---|
| `assignMissingResidences` | 48 117 | 96.5 | 380 | 0.8 |
| `assignFamilyToResidence` | 42 660 | 85.6 | 6 395 | 12.8 |
| `pickResidenceForFamily` | 36 259 | 72.7 | 3 372 | 6.8 |
| `(anonymous)` in `residencySelection.ts` | 36 046 | 72.3 | **17 532** | **35.2** |
| `residenceHostsOnlySingles` | 32 702 | 65.6 | 1 232 | 2.5 |
| `residenceHasMinorOccupants` | 21 931 | 44.0 | 1 049 | 2.1 |
| `tickLayerDaily` → `tickLayerAssign` | 17 725 / 17 577 | 35.5 / 35.3 | — | — |
| `tickImmigration` | 17 467 | 35.0 | — | — |
| `isPlayerHuman` | 16 026 | 32.1 | **16 026** | **32.1** |

Self time by module: **`residencySelection.ts` 50.0 % + `playerHuman.ts` 32.1 % +
`residencyReconciliation.ts` 13.7 % = 96 %** of the day-boundary CPU.

## Root cause

The three per-residence predicates each re-scan the **whole colony** per call, and they are called per
candidate residence inside a per-family loop:

- `residencySelection.ts:617`, `:636`, `:642` — `humans.filter((h) => h.alive && isPlayerHuman(h) && h.residenceBuildingId === residenceId …)`, once per call;
- `residencySelection.ts:640` `residenceHostsOnlySingles`, `:634` `residenceHasMinorOccupants`, `:616` `residenceHostsCouple` — the callers of those filters;
- `residencySelection.ts:661` `pickResidenceForFamily` — iterates the residences and calls them;
- `residencyReconciliation.ts:138` `assignFamilyToResidence` and `:199` `assignMissingResidences` — call that per family.

So one day-boundary pass is `families × residences × humans` (982 × 694 × ~1550) filter steps, and a
predicate as cheap as `isPlayerHuman` accounts for 16 s of the 50 s. The same pass is reached twice per
boundary — once from `tickLayerAssign`, once from `tickImmigration` → `assignMissingResidences`.

## Proposed fix (not applied — owner's call)

Build the occupancy facts **once per pass** instead of once per call: a
`Map<residenceId, { occupants, adults, minors, hostsCouple, onlySingles, openBeds, count }>` computed in
one walk over `humans`, and have `residenceHostsCouple` / `residenceHasMinorOccupants` /
`residenceHostsOnlySingles` / `anyOpenBeds` read it. Also hoist `alive`, `humansById` and
`listPlayerResidences(buildings)` out of the loops that rebuild them. Behaviour must stay identical:
same predicates, same `id`-sorted iteration order, same residence choice for the same world.

## Regression test

`tests/residency*.test.ts` / `tests/housingUnits.composition.test.ts` pin the behaviour; the perf guard
is the harness above with `PERF_DAY_ONE=1`, which turns a 60 s regression into a one-tick measurement.

## Invariants checked

- *"A tick fits its 1000 ms budget"* — violated by ~60× at a day boundary. `[verified]`
- *"The worker is only torn down when it is broken"* — violated: a slow-but-progressing tick is treated
  as a stall, and the fallback makes the frame rate worse than the stall did. `[verified]`

## Save/migration impact

None — the save round-trips through the game's own load path.

## Verification result

- Measured: boundary tick 58.5 s wall / 52.6 s CPU; normal ticks 68–310 ms wall (owner's save, this box).
- Profiled: 96 % of that CPU in the three residency modules, top self time `isPlayerHuman` (32.1 %).
- Not run: no fix, so no before/after yet. Fixing it needs a re-run of the same harness plus the unit
  suite (the profiling and bench knobs used here live in the harness, not in a throwaway probe).

## Related commits or files

- `src/game/residencySelection.ts` — `residenceHostsCouple` (:616), `residenceHasMinorOccupants` (:634),
  `residenceHostsOnlySingles` (:640), `anyOpenBeds` (:649), `pickResidenceForFamily` (:661)
- `src/game/residencyReconciliation.ts` — `assignFamilyToResidence` (:138), `assignMissingResidences` (:199)
- `src/game/dailyPopulation.ts:120` — immigration calls `assignMissingResidences` on the same tick
- `src/game/tickLayerDaily.ts`, `src/game/tickLayerAssign.ts`
- `src/game/gameLoop.ts` — the 10 s stall watchdog and the main-thread fallback that turn this into a freeze
- `scripts/perf-at-pop.ts` (save + `PERF_DAY_ONE` + CPU-time trace), `scripts/analyze-cpuprofile.mjs`
  (function/file ranking with self **and** total time)

## Fix

**First pass applied (2026-10-02) — 58.5 s → 17.7 s, not yet enough.** The three per-residence
predicates used to re-filter the whole colony on every call; they now read a `ResidenceTraits` map
(`adults`, `hasMinor`, `hasCouple`) built in one walk over `humans` in `pickResidenceForFamily`, and
`hasSinglesOnlyResidenceWithRoom` threads one map through its residence loop. Measured on the same save
with the same harness (`PERF_DAY_ONE=1`, one boundary tick):

| | before | after |
|---|---|---|
| boundary tick, wall | 58 470 ms | **17 684 ms** |
| boundary tick, CPU | 52 609 ms | **17 844 ms** |
| normal tick | 76–310 ms | 107 ms |

`tsconfig.app.json` clean, lint 0 errors, `tests/residency*` + `tests/housing*` 6 files / 16 tests pass.
**Still open:** 17.7 s is above the loop's 10 s watchdog, so a day boundary still tears the worker down;
the remaining cost is that the traits map is rebuilt per *pick* (~12 000 picks per boundary, two colony
walks each). The exact-equivalent next step is to fold the traits into `ResidenceOccupancy` — the module
that already owns the per-residence count — so `occupancyMove` updates them in O(1) alongside the count,
with no staleness and no rebuild. That is a signature change across its call sites, so it is the next
piece of work rather than a rushed edit.

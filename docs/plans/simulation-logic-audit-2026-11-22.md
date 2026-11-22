# Simulation-logic audit — 2026-11-22

- **Branch / commit:** `audit-simulation-logic` @ `ecd9866c`
- **Build inspected:** package `0.6.5.1` (development target `0.6.5.2`)
- **Scope:** the simulation pipeline only — `gameTick` orchestration, the four tick layers, the
  calendar/day-phase gates, wildlife and ecology, housing/workforce assignment, raids, save/load
  compatibility, and the gates that guard them.
- **Method:** code trace of the scheduled lanes, every local gate in `scripts/test.mjs` that fits the
  environment, the targeted simulation test suite, and the full-year harness on two seeds.
- **Verdict:** the pipeline is structurally sound — fixed layer order, one owner per scheduled
  decision, deterministic rolls, clean invariants across 360 simulated days — but two issues need
  work: predator/prey ceilings live in two owners and settle into a **prey-collapse** equilibrium,
  and the `knip` gate keeps `npm run audit` red.

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| `node scripts/test.mjs check` | **PASS** | docs, comments, dialogue and shadow-file checks clean (4 dialogue cue WARNs, exit 0) |
| `build-call-graph.mjs --verify-owners` | **PASS** | 399 files, 3,420 functions, 481 decisions, 0 without recorded owner |
| `check-function-overlap.mjs` | **PASS** | 0 modified functions / 3,420 indexed / 0 unresolved — only after regenerating the graph (F-06) |
| `check-import-cycles.mjs` | **PASS** | 399 modules, 2,401 runtime edges, no runtime cycle |
| `check-duplicate-code.mjs` | **PASS** | 4 clones / 4 groups, 0 new |
| `test.mjs lint` | **PASS** | 0 warnings, 0 errors, 400 files |
| `tsc -p tsconfig.app.json` | **PASS** | no diagnostics |
| `npm run build` | **PASS** | exit 0; lint + dup + `vite build` all green (2.1 s bundle) |
| `knip` | **FAIL** | 225 unused exports across 120 files + 1 unresolved import (F-02) |
| Unit suite (all files) | **NOT COMPLETED** | exceeded the 260 s command budget in this environment |
| Targeted simulation suite | **PASS** | 14 files / 120 tests: layer order, dedupe, decision registry, sim invariants, commute/herd, calendar phase, 4 raid suites, housing pipeline, workforce, herd migration, immigration grid |
| 360-day full-year harness | **PASS** | seed 12345, 103,680 ticks, `invariantViolations=0`, `stalledTicks=0`, 234 event-log entries |
| 90-day harness, seeds 12345 and 777 | **PASS** | `invariantViolations=0`, `stalledTicks=0` on both |

## Findings

### F-01 — Predator ceiling collapses the prey base (medium)

Breeding capacity and the replenishment floor are owned by two different modules and disagree:

- `tickLayerSystems.ts:772-781` hardcodes the breeding ceiling inline: rabbit **120**, deer **60**,
  wolf **25**, everything else **35**.
- `worldGen.ts:359-367` owns the replenishment thresholds: rabbit target **150**, deer **45**,
  wolf target **10**, spawning up to `MAX_PREY_SPAWN_PER_PULSE = 16` rabbits per pulse
  (`worldGen.ts:363`, `402`), triggered every third day from `dailyWorldEvents.ts:181-182`.

Two consequences:

1. The rabbit replenishment target (150) sits **above** the breeding ceiling (120), so recovery
   overshoots the ecology ceiling and breeding then stalls until attrition brings the herd back
   under 120. Wolves are the opposite case: they breed to 25 while replenishment considers 10 a
   full pack, so the predator population settles at 2.5× the number the floor was designed for.
2. Measured outcome, passive 90-day harness (no hunters, restocked food):

   | Seed | Rabbits | Deer | Wolves | Foxes | Grass |
   |---|---|---|---|---|---|
   | 12345 | **0** | 7 | **25** (cap) | 1 | 136 |
   | 777 | **0** | 1 | **25** (cap) | 2 | 127 |

   The 16-rabbit floor every three days is consumed faster than it is replenished, so the map
   carries no rabbits for most of the year and deer are nearly gone, while the wolf pack sits
   exactly on its breeding cap. Hunting spots then have no rabbits to hunt, and the ecology stage
   reads a collapsed prey base.

This violates the one-owner rule (`AGENTS.md` §1/§4): a population limit decided in two places.
Suggested fix: move both the ceiling and the replenishment target into `speciesConfig.ts`, keep
`target ≤ cap`, and let predator breeding scale with the actual prey count (the same
`capacityFactor` applied to the food base) so a pack cannot saturate beyond what the map feeds.

Tracked as `docs/bug_report/2026-11-22-wildlife-predator-ceiling-collapses-prey.md`.

### F-02 — `npm run audit` is red on `knip` (medium)

`knip` exits 1 with **225 unused exports across 120 files** plus one unresolved import. The
unresolved import (`/tests/browser/villagePortraitUI.tsx` from `scripts/browser-smoke.mjs:351`) is a
false positive — the browser imports a URL path that knip cannot resolve; the file exists.

The unused-export surface is real drift, not noise: `src/game/rivalDiplomacy.ts` (13),
`scentGrid.ts` (10), `dashboardData.ts` (10), `economy.ts` (9), `housingPipeline.ts` (8),
`hotelStay.ts` (8) head the list. `knip.ts` carries a hand-maintained `ignoreIssues` baseline with
`[A]/[B]/[C]` labels per file, so the accepted set is documented — but it no longer covers the
current tree. The gate ordering itself is correct (`audit` = `cycles → owners → knip`), so a knip
finding no longer masks the cycle check.

Suggested fix: prune the dead exports or regenerate the `ignoreIssues` baseline in one mechanical
pass, and ignore the browser URL import so `npm run audit` is meaningful again.

### F-03 — Retired visitor camps still appear live in documentation and dead reads (low)

On-map visitor camps were retired: `tickVisitorGroups`, `spawnVisitorGroup`,
`tryMidYearVisitorEvent` and `tryFirstWeekVisitor` (`groupEvents.ts:257, 336, 1000, 1014`) have **no
caller anywhere in `src/`**, save loading drops the groups (`saveLoad.ts:1529`) and their actors
(`saveLoad.ts:1549`), and the decision registry states no visitor camp or actor is spawned.

Yet the retired feature is still described as running:

- `ARCHITECTURE.md:114` — the daily layer "00:00 visitors, idle skills, year rollover…".
- `OWNERSHIP_OVERVIEW.md:910` — lists `tickVisitorGroups` as a live writer of the food ledger
  (`gift`) "on each inflow".
- `docs/bug_report/2026-11-07-visitor-groups-never-depart.md` — status **resolved**, describing a
  fix that moved the lifecycle call to 00:00; that call has since been deleted.
- `humanTick.ts:481` and `humanTick.ts:1355` still read `state.visitorGroups` for festival
  performers and courtship, branches that can never be true.

No runtime defect (the data is always empty), but a substantial dead subsystem and its `groupEvents`
RNG stream remain, and the documentation asserts behaviour that no longer exists.

Tracked as `docs/bug_report/2026-11-22-architecture-doc-still-schedules-retired-visitors.md`.

### F-04 — Tick-layer documentation drift (low)

- `tickLayerAssign.ts:52` documents the layer as called when `world.tick % LAYER_ASSIGN_INTERVAL === 0`.
  `gameTick.ts:256` calls it when `world.tick % LAYER_ASSIGN_INTERVAL === LAYER_ASSIGN_PHASE_TICK`,
  i.e. 03:00, 09:00, 15:00 and 21:00 — never at 00:00.
- `ARCHITECTURE.md:114` lists the daily phases 00:00 / 06:00 / 12:00 / 18:00 and omits the 23:00
  construction close that `tickLayerDaily.ts:119-123` and `gameTick.ts:283` both implement.

### F-05 — The weekly full-year gate is demographically inert (info)

At the default seed the 360-day gate runs a colony that never changes shape: 3 settlers from day 30
to day 360, `marriedPairs=0`, `conceptions=0`, `births=0`, `deaths=0`, `producedToday=0`. Seed 777
over 90 days does form one marriage but still logs 0 conceptions. The gate therefore proves
invariants and stall-freedom on movement/ecology/calendar paths, but exercises **no** family,
pregnancy, birth, mortality or housing-churn path. A non-vacuity assertion (a seeded household that
must marry and conceive, or the existing `--bot` run) would give the gate teeth for those subsystems.

### F-05 — Committed call-graph artifacts lag the source (info)

`docs/tools/call-graph.json` still indexes the deleted `src/game/factionWander.ts`, so running
`node scripts/check-function-overlap.mjs` on its own aborts with
`ENOENT: /app/src/game/factionWander.ts`. `npm run build` and `test:standard` regenerate the graph
first and pass; only the standalone invocation fails. Regenerate the two tracked artifacts, or
document that the graph must be rebuilt first.

## Verified clean

- **Same-stroke placement overlap** — accepted footprints are pushed into `budgetState.buildings`
  and carried into the next segment's authoritative check
  (`buildingPlacementActions.ts:265-283`), so two pieces of one stroke cannot overlap.
- **Visitor day count and departure** — arrival day is a grace day, `daysLeft` decrements at each
  following midnight, and the departure block runs on the tick the counter reaches 0
  (`groupEvents.ts:348-411`). The arithmetic is correct; the function is simply unreachable (F-03).
- **Daily person rolls** — one `personDayRoll(id, tick, salt)` per decision with a distinct salt per
  decision (`simRng.ts:82-118`); the earlier "coarse RNG" concern no longer applies.
- **Raid casualty application** — guarded by `event.battleCasualtiesApplied`
  (`frontierCombat.ts:1219-1224`), so the half-battle and battle-end passes cannot apply losses twice.
- **Determinism** — no `Math.random` in simulation code; `Date.now`/`performance.now` appear only in
  presentation (hunt visuals, profiler, worker host), and `huntVisuals` is not saved.
- **Counts** — `countWorkingAndIdleSettlers` filters dead and imprisoned settlers, so a settler who
  dies mid-tick cannot linger in the workforce numbers; population counts are recomputed after the
  daily layer when it can change the roster.
- **Save compatibility** — retired visitor groups, visitor actors and visitor-sourced village
  requests are stripped on load; the legacy `spawnedAtCalendarDay` backfill remains for older saves.

## Recommended order of work

1. **F-01** — designer decision on the predator/prey numbers, then one owner in `speciesConfig.ts`.
2. **F-02** — restore a green `npm run audit`.
3. **F-03 / F-04** — delete the retired visitor surface or mark it legacy in the docs; fix the two
   cadence descriptions.
4. **F-05** — add a non-vacuity assertion to the weekly gate.

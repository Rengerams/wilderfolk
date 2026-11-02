# Handover — housing plan/apply pipeline — 2026-11-02

**Branch:** `main` · **Status:** P0a–P7 and T0–T4 complete (two documented exceptions) ·
**Last commit:** `219714d5` · **Suite:** 34 files / 166 tests · **Target:** V.0.6.5.2

## What is done

The five residence modules were merged into three, then one decision path was introduced and every
scheduled housing phase was routed through it.

| Stage | Result | Key commits |
| :--- | :--- | :--- |
| P0a | `residencyOccupancy` + `householdComposition` → `housingModel`; `residencySelection` + `residencyReconciliation` → `housingPipeline`; `housingDiagnostics` kept | `d37efff9` |
| P0/P1 | `planRelocation` / `applyRelocation`, homeless need, contract tests, `HousingReport.stats`, seven review reports filed | `98c0f393`, `029ef61f` |
| Audit round 1 | repair-pass regression fixed; refused destinations retried to exhaustion; report origin; shared `isCompletedPlayerBuilding`; `settled` vs `shortage` | `508c1f2f`, `029ef61f` |
| P2 | custody, custodian, capacity and surplus needs; capacity ranks/retries; surplus only when no destination; adoption/custodian placement planned | `6cc9a80c`, `185f6205` |
| P3 | leave-home planned (L1 minor household, L7 vacancy refresh); commute planned; public `housingUnitNeedsReassignment` retired (private `unitNeedsMove`) | `fd63ad00`, `e010fcdd`, `2e88a4a2` |
| P4 | marriage (couple need); leader death clears the office while the family stays in the manor; divorce keeps the betrayed spouse + children and the cheater leaves alone; one-hop reshuffle removed; manor seating documented as event-driven | `71e46a77`, `acea0183`, `c4d2ce6b` |
| P5 | `isAssignableHome` gates every picker/list/diagnostic/population read; rival literals removed from housing paths; diagnostics/population import owners; single `MANOR_MOVE_REASONS`; L3 traits/beds, L5 protection counted once, L9 pair count; T3 test retirement | `b99458c3`, `3743c065` |
| P6 | full tick measured at 600/1 200/2 400 (25/98/422 ms avg); `stats.passes` 1 on the stuck fixture; F6 accepted as the 2× predicate cost | `abaf9b0d`, `31d759ae` |
| P7 | benchmark numbers in the architecture, registers, changelog, relocation hash identical at 600/1 200 | `31d759ae` |
| T0–T4 | invariants + generator; plan-level predicate tests; internal tests retired (35→34 files, 171→166 tests); ceiling moved to `PERF_DAY_BOUNDARY`; 30/360-day report; T1 end-to-end refusal via the resume-ledger seam | `219714d5` |

**Behaviour now:** homeless, custody, custodian, capacity, surplus, leave-home, commute and couple
plans go through `planRelocation`; `applyRelocation` is the write; manor seating is event-driven only.
Divorce follows infidelity (betrayed keeps home + minors, cheater leaves alone); amicable divorce
follows the custody hash. A dead leader's office is cleared immediately, family stays until the election.

## Verification

- 34 housing files / **166 tests** green; types, lint, build (0 overlaps, 0 new duplicate groups),
  audit (no runtime cycles), `check:source`.
- Full tick, seed 12345, 120 ticks: 600 avg 25.4 / p95 50.1; 1 200 avg 97.5 / p95 196.8;
  2 400 avg 422.3 / p95 795.2 ms.
- 30/360-day report: 30 d 9 moves / 0 homeless-days / 0 repeat; 360 d 283 moves / 1 920 homeless-days /
  117 repeat / 13.48 moves per household-year.
- Relocation sweep assignment hash identical between reference and production at 600 and 1 200.

## Acceptance scorecard (test plan §6)

| Item | State |
| :--- | :--- |
| Every new file asserts observable settlement; no private predicate import | **done** — planner contract, invariants, T1 drive public entrypoints; no `unitNeedsMove` import |
| No wall-clock assertion in a unit test | **done** — the 5 s ceiling is `PERF_DAY_BOUNDARY` |
| Policy tables include no-legal-destination, shortage and custody-split | **partial** — the contract suite covers all three; the planned `housingPolicies.*` tables do not exist |
| Mutation checklist run by hand and recorded | **partial** — 4 of 8 run and recorded in the test plan, not a PR; `familyFitsInResidence` is caught by the authority capacity case, not the invariants |
| Fast housing set (all but `residency.dayBoundary.budget`) under 8 s | **fails** — 33 files / 160 tests = **15.5 s** |
| No expected-fail cases; the seed-2 retry stays a normal test | **done** — seed 2 is in the invariants; T1 is a normal test |

## §7 naming note — "adult" has three spellings

Measured 2026-11-02 in `src` + `tests`: **28** `isMinorChild(` calls, **229** `.isJuvenile` mentions,
**92** `HUMAN_ADULT_MIN_AGE` mentions, and **28 hand-rolled** adult comparisons in `src`
(`age >= HUMAN_ADULT_MIN_AGE` / `!isJuvenile && age >= …`, e.g. `listVillageSingleAdults`,
`apprenticeships`, `dailyScheduleFatigue`). `isMinorChild` is not a pure alias — it emancipates a
partnered minor — but "adult" still has three spellings. **Open P5 item:** add one `isMinor`/`isAdult`
owner in the household model, replace the hand-rolled comparisons, and make tests call the owner.
The test plan's original 27/236/92/16 counts have drifted; these are the current numbers.

## Documented exceptions / accepted costs

1. **`dayCycle` barrel re-export** still forwards the housing names. Removing it means repointing the
   remaining importers (`SelectedBuildingPanel`, worker/diagnostics paths); it is the established
   compatibility boundary.
2. **F6** — the sort and the planner each evaluate `unitNeedsMove` (2× common path). The plan-based
   sort experiment broke three invariants (lawful, input order, idempotent) because plans computed
   before earlier moves go stale; the safe fix is the P6 occupancy-version design, deliberately not
   taken. Do not re-attempt the naive plan-reuse version.
3. **T3 mutation mapping** — `familyFitsInResidence` is caught by the authority capacity case, not the
   invariants (they never attempt an overfill). The capacity policy table / overfill invariant is still
   missing; the full eight-mutation checklist was not run.
4. **`assignMissingResidences(..., existingLedger?)`** is a deliberate resume seam added for T1. It is
   the only test-facing API addition; production still starts a fresh ledger.

## Open bugs / follow-ups

- **Open:** [capacity surplus evicts a whole unit](bug_report/2026-11-02-housing-surplus-evicts-whole-unit.md)
  (7 people in 6 beds → 3 unhoused, 2 beds left). Fix by selecting only the excess, or re-planning
  after the loop.
- **Churn:** 13.48 moves/household-year and 117 repeat moves at 360 days is high; the T4 harness is the
  place to investigate (event triggers vs capacity refill).
- **T3 capacity table:** add the overfill row (or an invariant) so the `familyFitsInResidence` mutation is
  caught by the invariants, then run the remaining mutation checklist items (prisoner count, visited
  check, sync skip).

## Where to continue

1. **P5 barrel cleanup** — remove the housing re-exports from `src/game/dayCycle.ts`, repoint importers,
   keep the import-cycle gate green.
2. **P6 occupancy version** (optional) — version the occupancy/move counter, invalidate affected plans,
   and re-run the plan-based sort experiment with a differential test; only then claim F6.
3. **Capacity excess eviction** (open report) — the smallest user-visible defect left.
4. **Churn investigation** — use `scripts/run-full-year.mts` (30/360 report) and `PERF_RELOCATION=1`.
5. **T3 capacity table + remaining mutations.**

## Files to read first

- `docs/plans/housing-relocation-pipeline-2026-11-02.md` — status, WBS, gates (P0a–P7).
- `docs/plans/housing-tests-2026-11-02.md` — T0–T4, mutation checklist, baselines.
- `docs/HOUSING_ARCHITECTURE.md` — plan contract, phase rules, benchmark numbers.
- `src/game/housingPipeline.ts`, `src/game/housingModel.ts`, `src/game/housingDiagnostics.ts`.
- `OWNERSHIP_OVERVIEW.md` housing rows, `src/game/simulation/decisionRegistry.ts` `housing`.

## Cleanup

No scratch files created; `tmp/` is empty. The full-year runs wrote gitignored logs under `docs/log/`.

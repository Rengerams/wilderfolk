# Handover — housing plan/apply pipeline — 2026-11-02

**Branch:** `main` · **Status:** P0a–P7 and T0–T4 complete ✅; all follow-ups closed except churn; the
<8 s fast-set target is still open (F6 accepted by design) ·
**Last commit:** `35893a82` · **Suite:** 36 housing files / 179 tests; full unit suite 459 files / 2 973 tests · **Target:** V.0.6.5.2

## What is done

The five residence modules were merged into three, then one decision path was introduced and every
scheduled housing phase was routed through it.

| Stage | Result | Key commits |
| :--- | :--- | :--- |
| P0a ✅ | `residencyOccupancy` + `householdComposition` → `housingModel`; `residencySelection` + `residencyReconciliation` → `housingPipeline`; `housingDiagnostics` kept | `d37efff9` |
| P0/P1 ✅ | `planRelocation` / `applyRelocation`, homeless need, contract tests, `HousingReport.stats`, seven review reports filed | `98c0f393`, `029ef61f` |
| Audit round 1 ✅ | repair-pass regression fixed; refused destinations retried to exhaustion; report origin; shared `isCompletedPlayerBuilding`; `settled` vs `shortage` | `508c1f2f`, `029ef61f` |
| P2 ✅ | custody, custodian, capacity and surplus needs; capacity ranks/retries; surplus only when no destination; adoption/custodian placement planned | `6cc9a80c`, `185f6205` |
| P3 ✅ | leave-home planned (L1 minor household, L7 vacancy refresh); commute planned; public `housingUnitNeedsReassignment` retired (private `unitNeedsMove`) | `fd63ad00`, `e010fcdd`, `2e88a4a2` |
| P4 ✅ | marriage (couple need); leader death clears the office while the family stays in the manor; divorce keeps the betrayed spouse + children and the cheater leaves alone; one-hop reshuffle removed; manor seating documented as event-driven | `71e46a77`, `acea0183`, `c4d2ce6b` |
| P5 ✅ | `isAssignableHome` gates every picker/list/diagnostic/population read; rival literals removed from housing paths; diagnostics/population import owners; single `MANOR_MOVE_REASONS`; L3/L5/L9; T3 test retirement; the `dayCycle` housing barrel was removed concurrently in `71422ede`; §7 `isMinor`/`isAdult` owner replaced the 28 hand-rolled comparisons | `b99458c3`, `3743c065`, `71422ede`, `4339c94b` |
| P6 ✅ | full tick measured at 600/1 200/2 400 (25/98/422 ms avg); `stats.passes` 1 on the stuck fixture; F6 accepted as the 2× predicate cost | `abaf9b0d`, `31d759ae` |
| P7 ✅ | benchmark numbers in the architecture, registers, changelog, relocation hash identical at 600/1 200 | `31d759ae` |
| T0–T4 ✅ | invariants + generator; plan-level predicate tests; internal tests retired (35→34 files, 171→166 tests); ceiling moved to `PERF_DAY_BOUNDARY`; 30/360-day report; T1 end-to-end refusal via the resume-ledger seam | `219714d5` |
| Follow-ups ✅ | capacity surplus sheds only the excess (7 in 6 beds → 6 housed, 1 unhoused); L4 core-anchor rename; capacity behaviour table + no-overfill invariant; all eight mutation checks caught | `b29d2b48`, `c702701d`, `35893a82`, `e6da03dc` |

**Behaviour now:** homeless, custody, custodian, capacity, surplus, leave-home, commute and couple
plans go through `planRelocation`; `applyRelocation` is the write; manor seating is event-driven only.
Divorce follows infidelity (betrayed keeps home + minors, cheater leaves alone); amicable divorce
follows the custody hash. A dead leader's office is cleared immediately, family stays until the election.

## Verification

- 36 housing files / **179 tests** green; full unit suite 459 files / 2 973 passed (2 skipped); types, lint,
  build (0 overlaps, 0 new duplicate groups), audit (no runtime cycles), `check:source`.
- Full tick, seed 12345, 120 ticks: 600 avg 25.4 / p95 50.1; 1 200 avg 97.5 / p95 196.8;
  2 400 avg 422.3 / p95 795.2 ms.
- 30/360-day report: 30 d 9 moves / 0 homeless-days / 0 repeat; 360 d 283 moves / 1 920 homeless-days /
  117 repeat / 13.48 moves per household-year.
- Relocation sweep assignment hash identical between reference and production at 600 and 1 200.

## Acceptance scorecard (test plan §6)

| Item | State |
| :--- | :--- |
| Every new file asserts observable settlement; no private predicate import | **✅ finished** — planner contract, invariants, T1 drive public entrypoints; no `unitNeedsMove` import |
| No wall-clock assertion in a unit test | **✅ finished** — the 5 s ceiling is `PERF_DAY_BOUNDARY` |
| Policy tables include no-legal-destination, shortage and custody-split | **✅ finished** — the contract suite covers all three; the separate `housingPolicies.*` files were not created |
| Mutation checklist run by hand and recorded | **✅ finished** — 8 of 8 caught and recorded in the test plan; `familyFitsInResidence` is now pinned by the capacity table and the no-overfill invariant |
| Fast housing set (all but `residency.dayBoundary.budget`) under 8 s | **OPEN — fails**: 35 files / 173 tests take **11.1 s** |
| No expected-fail cases; the seed-2 retry stays a normal test | **✅ finished** — seed 2 is in the invariants; T1 is a normal test |

## §7 naming note — "adult" has three spellings — ✅ finished

**✅ finished (2026-11-02, `4339c94b`):** `isMinor`/`isAdult` now live in `housingModel` as the one age
rule; the 28 hand-rolled comparisons call it, `isMinorChild` keeps the partnered-minor emancipation, and
`tests/housingModel.adultRule.test.ts` pins the stale-flag and emancipation cases.

Before-state: measured 2026-11-02 in `src` + `tests`: **28** `isMinorChild(` calls, **229** `.isJuvenile`
mentions, **92** `HUMAN_ADULT_MIN_AGE` mentions, and **28 hand-rolled** adult comparisons in `src`
(`age >= HUMAN_ADULT_MIN_AGE` / `!isJuvenile && age >= …`, e.g. `listVillageSingleAdults`,
`apprenticeships`, `dailyScheduleFatigue`). The item was: add one `isMinor`/`isAdult` owner, replace the
hand-rolled comparisons, and make tests call the owner. The test plan's original 27/236/92/16 counts had
drifted; these were the numbers at the time.

## Documented exceptions / accepted costs

1. **`dayCycle` barrel — ✅ finished.** `71422ede` removed the housing re-exports and repointed the 28
   affected files; no longer an exception.
2. **F6 — accepted by design (open, not a defect).** The sort and the planner each evaluate `unitNeedsMove`
   (2× common path). The plan-based sort experiment broke three invariants (lawful, input order,
   idempotent) because plans computed before earlier moves go stale; the safe fix is the P6
   occupancy-version design, deliberately not taken. Do not re-attempt the naive plan-reuse version.
3. **T3 mutation mapping — ✅ finished (2026-11-02, `35893a82`).** The capacity behaviour table and the
   no-overfill invariant pin `familyFitsInResidence`; all eight mutation checks were run by hand and caught.
4. **`assignMissingResidences(..., existingLedger?)` — ✅ accepted (no work).** It is a deliberate resume
   seam added for T1, the only test-facing API addition; production still starts a fresh ledger.

## Open bugs / follow-ups

- **✅ resolved (2026-11-02, `b29d2b48`):** [capacity surplus evicts a whole unit](bug_report/2026-11-02-housing-surplus-evicts-whole-unit.md)
  (7 people in 6 beds → 6 housed, 1 unhoused). `selectSurplusMembers` sheds only the excess, adults before
  partners, never a minor or a remaining minor's custodian.
- **OPEN — Churn:** 13.48 moves/household-year and 117 repeat moves at 360 days is high; the T4 harness is
  the place to investigate (event triggers vs capacity refill).
- **✅ finished (2026-11-02, `35893a82`):** T3 capacity table — the behaviour table
  (`tests/housingCapacity.table.test.ts`) and the no-overfill invariant pin the mutation; the remaining
  checklist items (prisoner count, visited check, sync skip) were run and caught.

## Where to continue

1. **§7 adult owner — ✅ finished** (`4339c94b`): `isMinor`/`isAdult` in the household model, 28 hand-rolled
   comparisons replaced, tests call the owner.
2. **Capacity excess eviction — ✅ finished** (`b29d2b48`): only the excess is unhoused; regression added.
3. **P6 occupancy version — OPEN (optional):** version the occupancy/move counter, invalidate affected
   plans, and re-run the plan-based sort experiment with a differential test; only then claim F6.
4. **Churn investigation — OPEN:** use `scripts/run-full-year.mts` (30/360 report) and `PERF_RELOCATION=1`.
5. **T3 capacity table + remaining mutations — ✅ finished** (`35893a82`).

## Files to read first

- `docs/plans/housing-relocation-pipeline-2026-11-02.md` — status, WBS, gates (P0a–P7).
- `docs/plans/housing-tests-2026-11-02.md` — T0–T4, mutation checklist, baselines.
- `docs/HOUSING_ARCHITECTURE.md` — plan contract, phase rules, benchmark numbers.
- `src/game/housingPipeline.ts`, `src/game/housingModel.ts`, `src/game/housingDiagnostics.ts`.
- `OWNERSHIP_OVERVIEW.md` housing rows, `src/game/simulation/decisionRegistry.ts` `housing`.

## Cleanup

No scratch files created; `tmp/` is empty. The full-year runs wrote gitignored logs under `docs/log/`.

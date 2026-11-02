# Housing test suite — critical review and replacement plan — 2026-11-02

**Status:** P0a is committed as `d37efff9`; P1 as `98c0f393`; the audit fixes (fill regression,
exhaustive retry, report origin, shared building predicate, shortage semantics, stats) and the
contract suite are in the working tree. Everything else is scheduled against the pipeline plan.
**Baseline:** 34 housing files / 165 tests on the P5 tree (T3 retirement). T4 harness: 600-settler max tick 107.6 ms; 360-day churn 13.48 moves/household-year. T0 `95ca783a` — 34 files / 148 tests,
15.73 s. Pre-T0 `58ca1793` — 33 files / 141 tests, 19.33 s.

---

## Mini-RFC

**Problem.** The 141 tests are numerous but not adversarial: they are hand-built scenarios, many of
which assert *how* the pipeline computes a decision (calling private predicates and ledger helpers)
rather than *what the world looks like afterwards*. Whole defect classes — a family left outside
while beds exist, a roster drifting from the links, a refusal that silently ends an attempt — are not
represented at all, because every fixture is small and already lawful.

**Change.** Layer the suite: generated-colony invariants, behaviour tables per policy, a small
contract/atomicity layer on the public API, and projections. Move timing assertions to the harness.
Delete implementation-coupled tests only as the pipeline refactor replaces the internals they pin.

**Risk-impact.** No production change. The old tests stay as the migration net until P3/P5 retire the
symbols they import. One new open bug report (see below).

---

## 1. What the suite actually pins today

| File | Tests | Layer | Verdict |
| :--- | ---: | :--- | :--- |
| `housingAuthority.pipeline` | 9 | contract (some internals) | **keep**, rewrite the two `isHousingUnitProtected` cases to observe moves |
| `housingHouseholdAtomic` | 7 | contract | **keep** |
| `housingArchitecture.completion` | 13 | behaviour + 1 equivalence | **keep**, move the indexed-selection equivalence to the migration layer |
| `residencyCapacity.writers` | 8 | behaviour | **keep**, drop the fixture-premise test |
| `leaderHouse.*` (8 files) | 26 | behaviour, single scenarios | **merge** into 3 tables: entitlement, succession, prison/moon-form |
| `residenceCommuteRelocation` | 6 | behaviour (policy margins) | **keep** |
| `divorceHousing.custody` | 6 | behaviour | **keep**, table the six scenarios |
| `adoption.leaderHouse` | 4 | behaviour | **merge** into the guardianship table |
| `prisonStay.holdsHomeAndPost` | 8 | behaviour | **keep** |
| `housingUnits.composition` | 4 | behaviour | **merge** into the custody table |
| `residency.blendedCustody`, `residencyCapacity.excludedResidents`, `residencyCapacity.prisonReservedBeds`, `prisonerHousing.assign`, `leaderHouse.jailedResident`, `leaderHouse.pipelineStability`, `leaderHouse.settledDescendants` | 1 each | behaviour, one scenario | **merge** into their policy table |
| `residenceCoupleSharing` | 4 | behaviour | **keep** |
| `residenceBestFit.owner` | 4 | pure-owner tie-breaks | **keep** as ranking tests |
| `residency.dayBoundary.budget` | 6 | behaviour + timing | **move** the ms ceiling to the perf harness; keep cadence/fixed-point |
| `housingDiagnostics` | 3 | projection | **keep**, add threshold boundaries |
| `priorityAlerts.housing` | 4 | projection | **keep** |
| `villa.housing` | 5 | capacity rule | **keep** |
| `residencyReconciliation.occupantOrder` | 4 | **implementation** (single-pass bucketing) | **rewrite**: keep the roster-order contract, drop "one pass" |
| `cacheAnchorHousing.regression` | 8 | **misplaced** (6 housing entitlement cases inside a renderer file) | **split** the housing cases into the entitlement table |
| `residenceMoonHowler.marriedGrandchild`, `leaderRemarriage.residency` | 2+3 | behaviour | **merge** into the moon-form/remarriage tables |

Nothing in the suite is mock-heavy (no `vi.mock`/`vi.spyOn` in these files) — that is a real strength
worth keeping.

## 2. Findings

1. **Six files assert idempotency** with their own fixture, and the pipeline is *not* idempotent on
   generated colonies (§4). One property, one home.
2. **Timing in unit tests**: `residency.dayBoundary.budget` asserts a 5 s ceiling inside a 120 s test
   and spends ~11 s of the suite's 19 s. A loaded machine or CI can make it flaky while still
   allowing a large regression through. Perf belongs in `scripts/perf-at-pop.ts`.
3. **Implementation coupling**: tests import `housingUnitNeedsReassignment`, `buildResidenceTraits`,
   `housingUnitBucket`, `standaloneMoveContext`, `createHousingLedger`, `sortHousingUnitsForAssignment`.
   These are exactly the symbols the pipeline refactor deletes or moves, so each one has a scheduled
   rewrite (P3/P5), not a silent deletion.
4. **One-scenario sprawl**: eight `leaderHouse.*` files and four one-test files pin ~1 scenario each.
   They read as a bug log, not a policy; table them.
5. **Misplaced tests**: `cacheAnchorHousing.regression` mixes camera/viewport assertions with six
   manor-entitlement cases.
6. **Missing behaviours** (now added or scheduled): every changed settler reported; the resident
   roster equals the links; no manor resident without entitlement; a prisoner's bed counted; a
   refused destination must not end the attempt; order/content determinism.
7. **Assertions on relocation counts** (`relocations.length`) encode internal ordering. Prefer the
   observable home assignment; count only for quota tests where the count *is* the policy.

## 3. The replacement architecture

| Layer | What it asserts | Home |
| :--- | :--- | :--- |
| **Invariants (new)** | generated colonies: capacity, links, rosters, audit, report coverage, prisoners, idempotency | `tests/housingPipeline.invariants.test.ts` + `src/test/housingColony.ts` |
| **Behaviour tables (new)** | one row per policy case: fixture → expected settlement | `tests/housingPolicies.dsl.test.ts` (guardianship/capacity/couple/adult-child) and `tests/housingPolicies.manor.test.ts` |
| **Contract / atomicity** | whole-household or nothing, protection, no re-entry, idempotency | existing `housingAuthority.pipeline` + `housingHouseholdAtomic`, rewritten to public API |
| **Projection** | diagnostics, alerts, dashboard counts | existing three files |
| **Performance / long run** | boundary cost, churn, a full year | `scripts/perf-at-pop.ts`, `scripts/run-full-year.mts` (no wall-clock in unit tests) |

### 3.1 Meaningfulness check (mutation checklist)

A behaviour test is only worth its runtime if it can fail. For each rule, temporarily break the owner
and require a red test (run by hand, never committed):

| Mutation | Must be caught by |
| :--- | :--- |
| `custodianTravelsAlong` returns `true` always | housingAuthority "keeps a dependent child with their custodian"; custody table |
| `familyFitsInResidence` ignores capacity | invariants "lawful"; capacity table |
| `relocateHousehold` allows the manor for `assignment` | housingAuthority "never puts an ordinary household in the Leader's House" |
| `countResidentsInBuilding` ignores prisoners | prisoner bed tests; invariants |
| `householdMayMove` drops the `visited` check | housingAuthority idempotency (may now pass *more*; watch for re-entry) |
| `syncResidenceOccupants` skips a residence | invariants roster check; occupant-order test |
| commute margin raised to 0 | residenceCommuteRelocation "ignores a trivial improvement" |
| `addResidenceOccupant` counts `pairs` once | no reader changes (`> 0`) — proves the test must assert the *predicate*, not the count |

## 4. What the new suite already found

`buildHousingColony(2)`: the capacity phase evicts one member of a split family from house #100; the
refill re-picks #100, which the run's ledger has already marked visited; `relocateHousehold` refuses
and `assignFamilyToResidence` tried no alternative, so the family stayed outside while beds existed.
The second run housed them (fresh ledger), so the pipeline was not idempotent for this colony.

Fixed in the current code, not deferred to the planner: `relocateFamily` retries the ranking past a
refused destination (bounded). Against the original fixture the two cases flipped from failing to
passing (2 → 0). The fixture later moved to the `simRng` factory, which changes the sequence, so that
seed no longer reproduces the refusal; an owner-level exclusion test now pins the mechanism, and T1
rebuilds the end-to-end fixture. Report: `docs/bug_report/2026-11-02-housing-refill-proposes-visited-home.md`.

**Second finding, fixed the same day:** the order property showed the same colony settling into
different homes when the settler array was reversed — 18–30 settlers per seed. `sortHousingUnitsForAssignment`
ordered units by need and size only, so equal units competed in arrival order. A stable
lowest-member-id tie-break now orders the pass; the property passes on six seeds (0 differing
settlers on twelve checked by hand). Report: `docs/bug_report/2026-11-02-housing-settlement-input-order.md`.

## 5. Schedule (ties into the pipeline plan)

| Stage | With | Work | Gate |
| :--- | :--- | :--- | :--- |
| **T0 — committed** | `95ca783a` | invariants suite + fixture generator + bug report + the retry fix; the write counter shares `residencyReconciliation.ts` with another agent's change | 34 suites / 148 tests pass; types/lint/build/source pass |
| **T1** | P0a done; P1 contract landed | rebuild the end-to-end refused-destination fixture lost when the generator moved to `simRng` (the planner-level refusal case is landed) | 35 suites / 154 tests green; seed-independent refusal fixture passes; input-order property landed |
| **T2** | P3 | delete the `housingUnitNeedsReassignment` tests (3 files) and rewrite them as plan-level cases | invariants + contract green |
| **T3** | P5 | retired the ledger/protection/purity assertions and the occupant-order reference diff; roster order is one observable table case in `housingAuthority.pipeline` | suite 35→**34** files / 171→**165** tests. Mutations run: custodian-travels, unlimited-capacity, manor-allowed and commute-margin all caught; `familyFitsInResidence` is caught by the capacity contract case, **not** the invariants (they never attempt an overfill); `pairs` stays intentionally uncaught (readers test `> 0`) |
| **T4** | P6/P7 | moved the ceiling to `PERF_DAY_BOUNDARY` (max tick ≤ 5 000 ms); `run-full-year` prints moves/household-year, homeless-days and repeat moves every 30 days | 30 d: 9 moves / 0 homeless-days / 0 repeat; 360 d: 283 moves / 1 920 homeless-days / 117 repeat / 13.48 moves per household-year; 600-settler max tick **107.6 ms** |

## 6. Acceptance for the replacement

- Every new file asserts observable settlement or a projection; no import of a private predicate.
- No wall-clock assertion in a unit test.
- Each policy table includes the "no legal destination" case, the shortage case, and the
  custody-split case.
- The mutation checklist above is run once by hand and recorded in the PR description (not committed).
- The fast housing set (everything except `residency.dayBoundary.budget`) runs in **< 8 s**.
- No expected-fail cases remain; the seed-2 regression (refused destination retried) stays as a
  normal test, and a future regression fails it rather than being re-pinned.

## 7. Naming note — the "adult" rule has three spellings

Measured in `src` and `tests`: 27 `isMinorChild(` calls, 236 `.isJuvenile` mentions, 92
`HUMAN_ADULT_MIN_AGE` mentions, and **16 hand-rolled `age >= HUMAN_ADULT_MIN_AGE` / `!isJuvenile &&
age >= …` comparisons** (e.g. `listVillageSingleAdults`, `apprenticeships`, `dailyScheduleFatigue`).
`isMinorChild` is not a pure alias — it also emancipates a partnered minor — but "adult" is expressed
three ways. One owner (`isMinor`/`isAdult` in the household model) should replace the hand-rolled
comparisons in P5; the new tests must call the owner, never the field.

# Full Codebase Audit — 2026-08-20

## Scope and method

This audit used the `wilderfolk-simulation-audit` workflow after reading `docs/AGENTS.md`, `SIMULATION_AUTHORITY.md`, `REGRESSION_PROOFING_PLAN.md`, `NEXT_AGENT_OBJECTIVES.md`, `Objective_Generation_Protocol.md`, and `BUG REPORTS/Readme.md`. It covered repository state, package scripts, open reports, the decision registry, game-loop orchestration, movement, lifecycle, worker boundaries, static dependency analysis, and the full automated suite.

## Baseline

The connected repository reports a green baseline of **51 test files and 334 tests** before the movement-owner consolidation. TypeScript and ESLint passed. The static audits reported 31 unused files, one unused dependency, 557 unused exports, six duplicate exports, and 43 dependency-cycle warnings. These static findings are audit signals, not proof that every listed export or cycle is a defect.

## Confirmed finding repaired

The project had duplicate human-movement implementations. Runtime code and focused tests use `src/game/simulation/humanMovement.ts`, while `src/game/humanMovement.ts` was a parallel copy reported as unused. The root module has now been converted to an explicit compatibility re-export, preserving older import paths while enforcing a single implementation.

The associated report is `BUG REPORTS/2026-08-20-duplicate-movement-owner.md`. Focused movement, pathfinding, and invariant tests passed **38/38** after the repair. The full suite passed **51 files / 335 tests**; TypeScript and ESLint also passed. The post-fix static audit no longer reports `src/game/humanMovement.ts` as unused.

## Ownership and cadence findings

`gameTick.ts` remains a thin orchestrator with the documented fixed order of realtime, systems, assignment, and daily layers. The worker command boundary remains separate from the authoritative simulation update. `decisionRegistry.ts` correctly functions as a static ownership table rather than a runtime manager or event bus. `simulationInvariants.ts` is a read-only governance collector, while the separate `simInvariants.ts` is an older runtime sanity checker and remains unused; this is now a follow-up consolidation objective rather than an automatic deletion.

The lifecycle owner remains `src/game/simulation/humanLifecycle.ts`. No duplicate birth owner or missing pregnancy call path was confirmed in this audit. However, direct lifecycle golden coverage is weaker than the authority requires, especially for constructor-created pregnancies, due-progress validity, same-tick newborn indexing, stillbirth, and lineage outcomes.

## Open architectural findings

The dependency audit reports 43 cycles. The most important clusters involve `gameTypes.ts`, `dayCycle.ts`, `moonHowler.ts`, `workforce.ts`, `simEffects.ts`, `gameTick.ts`, and `worldEvents.ts`. The tool reports warnings rather than errors, and many may be type-only or accepted legacy cycles. No broad cycle-breaking refactor should begin until runtime cycles are classified and one highest-risk boundary is selected.

The browser-worker test configuration references missing test paths, so the standard Node suite does not prove the browser `Worker` startup and fallback transport. Command round-trip tests pass, but a real browser-worker integration surface remains a gap.

Knip reports a large static-audit debt: 30 unused files remain after the movement re-export, including `src/game/simulation/simInvariants.ts` and several profiling/tooling scripts, plus 564 unused exports and one unused dependency. This should be triaged in small batches rather than mass-deleted.

## Objective status

| Objective | Status | Evidence |
|---|---|---|
| A — Consolidate duplicate runtime owners | Partially verified | Movement duplicate resolved; legacy `simInvariants.ts` remains for follow-up |
| B — Establish dependency-cycle reduction boundary | Proposed | 43 dependency-cycle warnings |
| C — Add direct lifecycle golden contracts | Proposed | No dedicated lifecycle test file covering all authority contracts |
| D — Restore real worker-transport tests | Proposed | Browser-worker config references missing paths |
| E — Triage static-audit debt | Proposed | 30 unused files, 564 unused exports, one unused dependency |

The complete objective definitions are in `docs/OBJECTIVE_PLAN_FULL_AUDIT_2026-08-20.md`.

## Simulation Change Record

- **Owner module:** `src/game/humanMovement.ts` compatibility boundary; authoritative logic remains `src/game/simulation/humanMovement.ts`
- **Decision changed:** Module ownership only; no gameplay rule changed
- **Cadence:** Realtime behavior preserved
- **State fields written:** None by the compatibility re-export
- **Why the change is needed:** Prevent duplicate movement implementations from drifting and causing stale imports
- **Player-visible behavior before:** Runtime movement used the simulation module; legacy imports could use a separate copy
- **Player-visible behavior after:** Both import paths resolve to the same implementation
- **Performance impact:** Removes duplicate source and preserves the tile-stable runtime path cache
- **New or updated tests:** Legacy compatibility import assertion added to `tests/humanMovement.test.ts`
- **Invariants checked:** One movement owner, fixed tick-layer order, unchanged movement cadence, valid path cache behavior
- **Save/migration impact:** None
- **Rollback plan:** Restore the prior root file only if a traced external import requires an additional explicitly documented compatibility export

## Final assessment

The project is behaviorally green but not yet architecturally clean. The highest-value next work is not a broad refactor: add direct lifecycle golden tests, restore browser-worker transport coverage, classify dependency cycles, and reduce static-audit noise in measured batches. The repaired movement boundary demonstrates the intended process: evidence, governed report, smallest owner-local change, focused tests, full validation, and explicit remaining risk.

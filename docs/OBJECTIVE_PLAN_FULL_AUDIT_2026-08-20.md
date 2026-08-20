# Full-Codebase Audit Objective Plan — 2026-08-20

This plan was generated after applying `wilderfolk-simulation-audit` to the connected `C:\wilderfolk` repository and reading the project authority, regression-proofing plan, objective-generation protocol, bug-report README, architecture notes, package scripts, test baseline, and static-audit outputs.

## Objective A — Consolidate duplicate runtime owners

- **Status:** proposed
- **Evidence:** `npm run audit:knip` reports unused `src/game/humanMovement.ts` and `src/game/simulation/simInvariants.ts`; runtime movement uses `src/game/simulation/humanMovement.ts`, while two implementations remain in the tree. The connected full suite is green, so this is an architectural regression risk rather than a currently failing behavior.
- **Area:** Truth | performance
- **Owner module:** movement and invariant module boundaries
- **Cadence:** n/a; module ownership
- **Scope:** Trace every import, then remove or convert stale duplicates into explicit compatibility re-exports without changing runtime behavior.
- **Non-goals:** No movement-speed change, no tick-cadence change, no ECS rewrite.
- **Dependencies:** Import graph and TypeScript validation.
- **Acceptance criteria:** Exactly one authoritative runtime implementation exists for each audited decision; no stale duplicate is executable; focused movement and invariant tests remain green.
- **Required tests:** movement, pathfinding, invariant, TypeScript, full suite.
- **Required bug report:** Update the connected movement-module drift report with verified status, or create a separate duplicate-owner report if the invariant duplicate is distinct.
- **Performance measurement:** Compare path-cache behavior before/after and ensure no new imports or bundle regressions.
- **Save/migration impact:** None.

## Objective B — Establish a dependency-cycle reduction boundary

- **Status:** proposed
- **Evidence:** `npm run audit:deps` reports 43 circular dependency warnings across workforce, dayCycle, moonHowler, gameTypes, effects, world events, and gameTick. The audit currently returns warnings rather than errors, but the cycles make ownership drift and module initialization failures harder to detect.
- **Area:** Truth | performance
- **Owner module:** dependency boundaries around `gameTypes.ts`, `dayCycle.ts`, `simEffects.ts`, `moonHowler.ts`, and `gameTick.ts`
- **Cadence:** n/a; module graph
- **Scope:** Classify cycles into harmless type-only cycles, runtime cycles, and owner-boundary violations; break only one measured high-risk cycle at a time.
- **Non-goals:** No broad rewrite or new event bus; no gameplay rule movement without authority update.
- **Dependencies:** Dependency-cruiser output, runtime import analysis, focused tests.
- **Acceptance criteria:** At least the highest-risk runtime cycle is removed or formally documented as accepted with evidence; no new circular dependency is introduced.
- **Required tests:** Full TypeScript, full suite, worker import smoke test, and dependency audit.
- **Required bug report:** One report per confirmed runtime-cycle defect; warnings that are type-only or accepted need a documented rationale, not fake bug reports.
- **Performance measurement:** Startup/import time and worker initialization stability.
- **Save/migration impact:** None unless a runtime initialization defect is found.

## Objective C — Add direct lifecycle golden contracts

- **Status:** proposed
- **Evidence:** The full suite passes 51 files / 334 tests, but the connected test inventory lacks a focused `humanLifecycle.test.ts`. The authority and regression plan require direct golden coverage for conception, pregnancy progression, birth, due-progress validity, parent links, and same-tick newborn indexing. Existing diagnostics tests do not fully prove the birth owner’s state transitions.
- **Area:** Truth | Play
- **Owner module:** `src/game/simulation/humanLifecycle.ts` and `src/game/entityFactory.ts`
- **Cadence:** pregnancy-progress and entity construction
- **Scope:** Add deterministic fixtures for ordinary birth, stillbirth with injectable randomness, Wildkin birth, bastard lineage, cooldown/state clearing, and immigrant pregnancy construction.
- **Non-goals:** No pregnancy-duration or conception-rate tuning.
- **Dependencies:** Existing `TickContext`, invariant checker, entity factory, relationship diagnostics.
- **Acceptance criteria:** Every birth path leaves valid pregnancy invariants, creates or records the expected outcome, updates parents and indexes in the same tick, and keeps diagnostics semantically distinct.
- **Required tests:** New lifecycle golden tests plus invariants, relationship diagnostics, TypeScript, and full suite.
- **Required bug report:** Verify or update `2026-08-20-immigrant-pregnancy-missing-due-progress.md` if the constructor path is still open; otherwise record it as verified with evidence.
- **Performance measurement:** No full-population scan added; measure fixture runtime only and preserve normal tick cost.
- **Save/migration impact:** None unless constructor compatibility changes.

## Objective D — Restore a real worker-transport test surface

- **Status:** proposed
- **Evidence:** The repository contains `vitest.browser-worker.config.ts` references to `src/test/game/simWorker/gameLoop.worker.test.ts` and `gameWorkerHost.test.ts`, but those paths are absent and the standard Node suite does not exercise the browser `Worker` transport. Worker command tests cover domain round trips but not the actual browser-worker startup/reconciliation path.
- **Area:** worker | Play
- **Owner module:** `GameWorkerHost`, `gameLoop`, worker test configuration
- **Cadence:** n/a; transport integration
- **Scope:** Restore or replace the missing browser-worker integration fixtures and make the test command explicit and runnable in the supported environment.
- **Non-goals:** No worker architecture rewrite and no change to command semantics.
- **Dependencies:** Browser test runner availability and existing worker shim.
- **Acceptance criteria:** A real worker transport test proves startup, tick delivery, command dispatch, authoritative result reconciliation, and fallback behavior; the configured test path exists and is documented.
- **Required tests:** Browser-worker integration plus current command, worker round-trip, and game-loop tests.
- **Required bug report:** Create a report if the missing test surface masks a reproducible transport defect; otherwise record the test-surface gap as an architecture finding.
- **Performance measurement:** Worker startup and command round-trip latency.
- **Save/migration impact:** None.

## Objective E — Triage static-audit debt without speculative cleanup

- **Status:** proposed
- **Evidence:** `npm run audit:knip` reports 31 unused files, one unused dependency, 557 unused exports, and six duplicate exports. Many may be intentional public/test/tooling exports, but the volume reduces the audit signal and can hide stale owners.
- **Area:** performance | Truth | developer workflow
- **Owner module:** repository-level export and tooling boundaries
- **Cadence:** n/a; build/audit tooling
- **Scope:** Classify findings into intentional public APIs, test/tooling entry points, stale duplicates, and safe removals; remove only confirmed dead code in small batches.
- **Non-goals:** No mass deletion based solely on Knip output; no removal of renderer/audio exports without import tracing.
- **Dependencies:** Import graph, build, tests, and owner registry.
- **Acceptance criteria:** The audit output becomes actionable, confirmed stale modules are removed or documented, and all behavior tests remain green.
- **Required tests:** Full suite, TypeScript, lint, build, and static audit.
- **Required bug report:** Only for confirmed defects or stale-owner regressions; use an audit/change record for intentional debt triage.
- **Performance measurement:** Build time and bundle-size comparison where removals affect production output.
- **Save/migration impact:** None.

## Objective Plan Change

- **Date:** 2026-08-20
- **Previous objective:** Ad hoc movement/lifecycle audit and skill-application review.
- **New objective:** Five evidence-driven full-codebase audit objectives A–E.
- **Change type:** replaced and expanded
- **Evidence requiring the change:** Full repository status, 51-file/334-test green baseline, 31 unused files, 557 unused exports, 43 dependency-cycle warnings, duplicate runtime movement/invariant modules, and missing browser-worker test paths.
- **What the previous objective failed to account for:** It focused on movement and lifecycle defects but did not examine the complete module graph, static audit signal, or actual worker-transport test surface.
- **Owner and cadence of new objectives:** Module ownership/objective-specific; no production cadence change proposed.
- **Player-visible impact:** No immediate gameplay change; the plan targets correctness, auditability, and future regression prevention.
- **Tests or measurements required:** Defined under each objective.
- **Developer approval required:** No for investigation and test-only work. Approval is required before changing save compatibility, production cadence, public pregnancy duration, adding a tick layer, or accepting a materially player-facing defect as deferred.
- **Developer approval/status:** Pending execution.

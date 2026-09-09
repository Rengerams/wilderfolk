# Wilderfolk Roadmap — v0.6.4.1

Status: development working tree (2026-09-08)

This roadmap carries forward the completed v0.6.3 work and turns the whole-game audit into a focused next step: make the living valley easier to understand, easier to verify, and richer in meaningful decisions without adding duplicate simulation owners or changing the established cadence.

## 6.4.1 large-file decommissioning update

The first decommissioning wave is complete for `buildingActions.ts`, `App.tsx`, `tickLayerDaily.ts`, and `residency.ts`. Their major responsibilities now live behind focused domain modules while existing public entry points, worker command paths, save/load boundaries, cadence ownership, and compatibility re-exports remain intact.

The residency split is complete: `residencySelection.ts` owns candidate scoring, home choice, empty-home preference, shared-housing logic, and overcrowding/rebalance selection; `residencyReconciliation.ts` owns occupant synchronization, partner transitions, and event, death, recruitment, import, and load reconciliation; and `residency.ts` is retained only as the public compatibility facade. Governance and write-ownership tests were updated to prevent a secondary residency owner from returning.

The work is validated by TypeScript checks, Oxlint, targeted residency and ownership tests, deterministic long-run simulation coverage, and a production build. `humanTick.ts` remains the next decommissioning track: adult landmark/bond leisure, realtime social runtime, work-behavior boundary review, and final coordinator reduction are still planned rather than complete.

| Priority | ID | Upgrade or feature | Main value | Primary owner/cadence | First-slice outcome | Status |
|---|---|---|---|---|---|---|
| 0 | **01** | Overhaul UX/UI menus 
| 0 | **U1** | Player-visible Simulation Diagnostics | Makes the worker/main-thread mode, current tick, selected settler activity, workplace, home, and blocked reason understandable during play. | Presentation-only projection from existing diagnostics; no new simulation owner. | A compact optional drawer explains what the simulation is doing and why a selected settler is where they are. | In progress — diagnostics drawer vertical slice implemented |
| 0 | **U2** | Explainable Story Choices | Keeps an unaffordable story card visible and explains the missing resource or condition. | Existing story owners and typed player commands. | Every blocked story choice gives a clear reason and remains available until the player can act. | Planned |
| 0 | **U3** | Save and Worker Truth Contract | Keeps important story, campaign, election, animal-care, residence, and staffing state consistent across worker updates and saves. | Existing `SimTickDelta`, save/load, and migration owners. | A single contract matrix covers extract/apply and save/load round trips for durable state. | Planned |
| 0 | **U4** | Selected Settler Inspector Completion | Turns the human status display into a dependable follow view for home, commute, work, leisure, and interruptions. | Authoritative world projection; existing human-status owner. | Selecting one settler shows live activity, home, workplace, schedule, target, and the latest transition. | Planned |
| 0 | **U5** | Calm, Useful Diagnostics | Keeps important warnings visible without flooding normal play or long-run logs. | `relationshipDiagnostics.ts` and future presentation diagnostics; flush cadence unchanged. | Normal play stays quiet; optional debug mode provides detailed daily and cumulative reports. | In progress — full-year `--debug` runner added |
| 1 | **P1** | Seeded Colony Health Scenario | Gives the whole simulation a repeatable long-run health check. | Existing game tick and invariant owners. | A seeded 100-day scenario checks food, housing, workforce, relationships, stories, elections, animals, and deltas together. | Planned |
| 1 | **P2** | Seeded One-Year Performance Run | Makes long-run worker and Huge-map performance measurable. | Existing worker and simulation instrumentation. | Reports p50/p95 tick time, path calls, delta size, memory trend, fallback count, and console volume. | Planned |
| 1 | **P3** | Assignment Explanations | Helps the player understand why a building cannot accept a worker or why an assignment changed. | Existing workforce and building-action owners. | Auto/manual mode, capacity, current workers, and rejection reasons appear together in the inspector. | Planned |
| 1 | **P4** | Resource Flow Panel | Makes the economy a visible planning problem instead of a set of unexplained totals. | Existing economy ledger and daily economy owner. | The player can see recent production, consumption, storage pressure, and daily net change. | Planned |
| 1 | **P5** | Movement Reason Trace | Makes commuting and blocked movement legible. | Existing movement/pathfinding owner; presentation-only history. | A selected settler can show a short route reason such as home → workplace → tavern → home, including blocked or rerouting states. | Planned |
| 1 | **P6** | Normal-Zoom Presentation Pass | Confirms that characters, children, buildings, roads, walls, watchtowers, and selected panels read correctly at normal play scale. | Existing renderer and presentation assets only. | A browser acceptance checklist covers visual assets, panel hierarchy, status, map density, and defense feedback. | Planned |
| 1 | **P7** | Family Reference Coverage | Protects surviving family histories as settlers leave the world. | Existing `killHuman()` cleanup and family-reference owner. | Dedicated coverage verifies parent, child, partner, affair, and pregnancy references after permanent removal. | Planned |
| 2 | **T1** | Supported Dependency and Type Checks | Makes project-health reports trustworthy and easy to reproduce. | Package scripts and repository tooling. | Add an explicit type-check command and replace or update dependency-cycle analysis for the installed TypeScript toolchain. | Planned |
| 2 | **T2** | Smaller Initial Game Bundle | Improves first load and reduces pressure on low-end machines. | Vite/Rolldown boundaries and lazy-loaded UI modules. | Move non-startup panels and data-heavy features behind dynamic imports; measure the main game chunk again. | Planned |
| 2 | **T3** | Unified Deterministic RNG Helpers | Keeps seeded behavior consistent as more systems are added. | `simRng.ts` and existing per-owner streams. | One documented helper pattern for world generation, social rolls, stories, elections, and future systems. | Planned |
| 2 | **T4** | Clear Save-Version Experience | Makes save compatibility understandable to players. | Existing save/version owner and user-facing messaging. | The game explains when a new settlement is needed and what a save version means. | Planned |
| 3 | **F1** | Colony Operations Center | Gives the player one calm place to see what is failing, what is about to fail, and what can be done now. | Presentation projection over existing food, housing, workforce, threat, story, and warning state. | A compact dashboard links each concern to the relevant person, building, card, or action. | Recommended |
| 3 | **F2** | Daily Council Report | Turns the daily simulation boundary into a readable planning rhythm. | Existing daily cadence; presentation consumes its results. | Each day reports net food, housing, assignments, births/deaths, relationships, stories, raids, and unresolved warnings. | Recommended |
| 3 | **F3** | Workforce Policy Presets | Gives players a simple strategic way to steer auto-staffing. | Existing workforce commands and assignment owner. | Survival, Growth, Defense, and Comfort presets configure priorities while manual overrides remain authoritative. | Recommended |
| 3 | **F4** | Infrastructure and Logistics Overlay | Connects roads, buildings, commutes, and map scale into a meaningful spatial strategy. | Existing pathfinding, road, building, and movement owners. | A read-only overlay shows supply routes, commute pressure, blocked paths, and poorly connected buildings. | Recommended |
| 3 | **F5** | Settlement Memory and Legacy Goals | Gives a long-running colony a recognizable identity. | Existing chronicle, story flags, event log, and milestone presentation. | The game records achievements such as surviving winter, keeping a promise, curing a Moon Howler, or recovering from shortage. | Recommended |
| 3 | **F6** | Preparation-Window Crises | Adds strategic tension without hidden punishment. | Existing daily event ownership and deterministic seeded outcomes. | A clearly telegraphed winter, embargo, disease risk, harvest failure, or fire risk offers preparation time and multiple responses. | Recommended |
| 3 | **F7** | Replay and “What Changed?” Mode | Makes the deterministic simulation useful to both players and developers. | Existing seeded state, event history, save state, and diagnostics. | A short history compares daily changes in food, housing, assignments, relationships, stories, and threats. | Recommended |
| 3 | **F8** | Shared “Why?” Interaction Layer | Turns complex simulation state into understandable choices. | Presentation-only readers over existing authoritative owners. | Selecting a settler, building, resource, or warning explains the current reason, consequence, and available recovery action. | Recommended |

## Implemented insight slices (this working tree)

Updated 2026-09-08, on top of the completed decommissioning wave: the "living valley easier to understand" goal now has a full-screen, dismissible village dashboard (📊 in the HUD header; Esc/✕ closes). Presentation-only — no new simulation owner, cadence, or save-format change.

| ID | Status | Delivered |
|---|---|---|
| **U1** | In progress | Diagnostics drawer + the full-screen dashboard overlay |
| **P4** | In progress — dashboard slice | 30-day food-produced-by-source history + today's produced/consumed/net food |
| **F1** | In progress — dashboard slice | Village concerns with severity + "Go →" links that jump to tabs / start builds |
| **F2** | In progress — dashboard slice | Daily Council Report: settlers, food net, food-stored & wildlife deltas, life events, concerns |
| **F7** | In progress — dashboard slice | "What changed?" day-over-day diffs (settlers, food stored, wildlife) |
| **F8** | In progress — dashboard slice | Read-only "why" explanation for a selected settler |

Supporting work: `WorldState.foodHistory` / `FoodDaySample` (transient, not saved) archived at day rollover in `economyLedger.ts` and carried through `SimTickDelta`; read-only projections in `src/game/dashboardData.ts`; overlay UI in `src/components/dashboard/GameDashboard.tsx`.

## Evidence-based todo execution plan

The following five objectives turn the roadmap priorities into implementation-ready work. They are based on the canonical design document, the simulation authority, the whole-game audit, the current source tree, and the existing test inventory. They deliberately prioritize integration confidence over adding another large simulation subsystem.

### Objective O1 — Truth Surface and Selected Settler Inspector

- **Status:** In progress; **priority:** P0.
- **Evidence:** Worker transport, human activity status, and inspector foundations exist, but stale presentation projections were previously identified as a real integration failure class. The current roadmap already identifies diagnostics and inspector completion as the first stabilization work. The first vertical slice now exposes read-only worker authority, game time, tick, response latency, in-flight work, and command-pending state.
- **Owner and cadence:** Read-only presentation projection over the existing `gameLoop`, worker diagnostics, authoritative `WorldState`, `humanStatus`, movement, workforce, housing, and schedule owners. No new simulation owner or tick layer.
- **Scope:** Complete an optional diagnostics drawer and selected-settler inspector fields for worker/main-thread mode, current tick, tick latency or last response, last daily boundary, activity, home, workplace, current target, schedule state, blocked reason, and latest meaningful transition. Resolve selected entities from authoritative `WorldState` first while the worker is active.
- **Non-goals:** Do not change movement rules, work schedules, cadence, watchdog thresholds, or simulation state writes. Do not enable permanent verbose logging during normal play.
- **Acceptance:** A browser check must show a selected settler changing correctly through commute, work, leisure, interruption, and return-home states. Pausing, speed changes, and worker fallback must not leave contradictory status text. The diagnostics drawer must be optional and useful in debug mode.
- **Tests and evidence:** Reuse human-status, game-loop, worker-transport, and renderer coverage; add an integration projection test if authoritative-world precedence is not already proven. Record map preset, day/time, selected entity, expected transition, observed transition, and screenshot or console evidence.
- **Save and rollback:** No save impact. Roll back by removing the presentation drawer and extra inspector fields while retaining the existing status helper and worker implementation.

### Objective O2 — Explainable and Recoverable Blocked Actions

- **Status:** Proposed; **priority:** P0.
- **Evidence:** Unaffordable story choices, staffing rejection, and blocked movement are identified as major player-facing friction. Existing story, command-validation, village-request, workforce, construction, housing, and animal-care owners provide the required boundaries.
- **Owner and cadence:** Existing story resolvers and named domain owners through typed player commands. Presentation consumes a typed accepted, blocked, or rejected result.
- **Scope:** Define a common result shape containing outcome, stable reason code, human-readable explanation, current value, required value, and recovery hint where available. Preserve a pending story card when the player cannot currently satisfy a choice, unless the authored story explicitly defines expiry. Display current authoritative values.
- **Non-goals:** No hidden resource grants, automatic choice selection, new economy owner, or balance tuning before rejection behavior is correct.
- **Acceptance:** An unaffordable story choice remains available when intended and explains the missing resource or condition. Staffing rejection identifies the actual gate, such as capacity, duplicate assignment, manual protection, juvenile status, imprisonment, or invalid workplace. Construction and housing failures explain known missing conditions.
- **Tests and evidence:** Add focused tests for each exposed reason code, extend worker round-trip coverage for result payloads, and perform one live browser click on an unavailable action.
- **Save and rollback:** Normally no save impact; pending-card persistence must be checked against existing story fields. Roll back to the former rejection display if typed outcomes prove unsafe without removing valid owner behavior.

### Objective O3 — Worker, Delta, and Save Truth Contract

- **Status:** Proposed; **priority:** P0.
- **Evidence:** Worker transport and story delta round-trip tests exist, but the audit warns that locally correct systems can fail when fields are omitted from deltas, saves, or UI projections. The canonical document treats worker/main-thread and save/load parity as release evidence.
- **Owner and cadence:** Existing `SimTickDelta`, save/load, migration, and named domain owners. No new state owner.
- **Scope:** Create one contract matrix for stories/campaign, elections, animal care, residence, workforce/staffing, relationships/family, pregnancy, defense, and any persisted diagnostic state. For each field, record mutation owner, delta extraction, delta application, serialization, load normalization, UI reader, and invalid-input behavior. Add seeded worker-versus-main-thread parity checks.
- **Non-goals:** No save-version bump, migration-policy change, `WorldState` redesign, or broad serialization rewrite.
- **Acceptance:** Every high-value durable field has an owner and save/delta decision. A seeded scenario produces equivalent meaningful state in worker and main-thread fallback paths. Save/load preserves required durable fields or applies an explicit normalization rule. Malformed payloads fail safely according to the existing save policy.
- **Tests and evidence:** Extend only the existing `simDelta.*`, save migration, worker round-trip, relationship, story, animal-care, workforce, and invariant tests where the matrix finds a gap.
- **Save and rollback:** High review importance but no compatibility-policy change without explicit approval. Roll back newly added assertions or matrix tooling only; do not remove existing save fields.

### Objective O4 — Seeded Colony Health and Huge-Map Performance Baseline

- **Status:** Proposed; **priority:** P1.
- **Evidence:** The repository has a full-year integration runner and broad headless tests, but headless success does not prove browser-worker behavior or scale performance. The roadmap calls for seeded colony-health and one-year performance scenarios.
- **Owner and cadence:** Existing game tick, worker, diagnostics, pathfinding, and invariant owners. The scenario harness observes and reports; it does not create a second simulation.
- **Scope:** Add a repeatable seeded 100-day scenario and a Huge-map run. Capture food/housing/workforce health, births/deaths, relationships, stories/elections, animal care, threats, invariant violations, tick p50/p95/max, path calls, delta bytes, fallback count, memory trend where available, and console volume. Keep 90-day or seasonal checkpoints.
- **Non-goals:** No balance changes, cadence changes, watchdog tuning based on one run, or claim that a headless benchmark replaces browser acceptance.
- **Acceptance:** Results are reproducible enough to review by seed and checkpoint. Reports distinguish conceptions, active pregnancies, births, deaths, assignments, and relationship transitions. Worker fallback, stalled ticks, serialization spikes, and invariant violations are counted separately. Normal mode remains bounded and detailed output is opt-in.
- **Tests and evidence:** Extend `fullYear.integration.test.ts` and related worker, invariant, pathfinding, lifecycle, workforce, and diagnostics coverage only where needed. Pair the baseline with at least one browser run.
- **Save and rollback:** No save impact unless checkpoints use existing save APIs. Remove scenario instrumentation if necessary without changing production simulation behavior.

### Objective O5 — Bundle and Dependency Audit with a Safe Optimization Slice

- **Status:** Proposed; **priority:** P2.
- **Evidence:** Production builds pass but still report a large game chunk. Existing UI lazy imports prove that some boundaries exist, while dependency-cycle output has not been fully trustworthy for the installed TypeScript toolchain.
- **Owner and cadence:** Build configuration and module boundaries only; no simulation cadence or state writes.
- **Scope:** Measure current chunks and import graph, identify one safe boundary for a non-startup panel or data-heavy feature, and correct or replace the unsupported dependency-cycle check. Validate worker startup and first render before and after any split.
- **Non-goals:** No speculative manual-chunk rewrite, imports rearranged merely to silence a warning, or acceptance based only on lower kilobytes if startup or runtime behavior regresses.
- **Acceptance:** The warning is recorded with exact chunk sizes and configuration. The dependency check produces meaningful output. Any split preserves worker initialization, first playable render, asset loading, and normal frame behavior. If no safe split meets the evidence threshold, document the warning as deferred.
- **Tests and evidence:** Run build, source checks, worker startup/transport, renderer presentation, and browser smoke acceptance.
- **Save and rollback:** No save impact. Keep the optimization isolated and reversible.

### Execution dependencies and repository hygiene

Implement O1 first because it provides player-facing evidence for the remaining objectives. Follow with O2, then O3 before any durable feature expands state. Run O4 before accepting performance or balance changes. Run O5 as a measured, isolated technical slice after the runtime baseline.

Before implementation begins, resolve the current working-tree situation. The repository inspection found a modified `CHANGELOG.md` and an untracked `Wilderfolk_Creative_Brainstorm_Report.pdf`, while `main` matched `origin/main`. Decide whether those files belong in the repository, should be reverted, or should remain local. Do not mix that decision silently into the first stabilization commit.

Each objective requires a Simulation Change Record before behavior changes, including owner, cadence, fields written, invalid-input behavior, tests, invariants, diagnostics, save impact, risk decision, acceptance evidence, and rollback path. No version bump, save-policy change, commit, push, tag, or release declaration is implied by this roadmap update.

## v0.6.3 foundations carried forward

| Area | Current foundation |
|---|---|
| Simulation truth | Worker-authoritative `WorldState`, typed commands, fixed tick layers, and explicit owner/cadence rules. |
| Determinism | Seeded world generation and per-owner/context RNG streams. |
| Stories and campaign | Five authored multi-stage stories, guided campaign progression, election promises, and durable story/campaign state. |
| Community life | Relationships, courtship, marriages, affairs, family cleanup, pregnancy and birth, human activity status, and housing diagnostics. |
| Work and settlement | Ordinary workday scheduling, independent venue hours, auto/manual staffing, distance-aware worker assignment, and construction/workflow controls. |
| Ecology and animals | Food-chain simulation, post-taming animal care, year-round blueberry decisions, wildlife replenishment, mountain regions, and expanded map sizes. |
| Frontier and defense | Rival diplomacy, raids, walls, gates, watchtowers, split Soldier/Prison Guard roles, and clearer patrol/custody responsibilities. |
| Presentation | Adult and child sprite previews, authored footpaths, improved defensive art, terrain chunk rendering, shadows, and clearer sidebar hierarchy. |

## Ownership and cadence rules

All v0.6.3.1 work must preserve the current simulation authority. New features should prefer presentation projections and typed commands over new mutation paths. Daily decisions remain in the daily owner; realtime movement remains in the realtime owner; relationship decisions remain in `humanRelationships.ts`; pregnancy progress remains in `humanLifecycle.ts`; worker assignments remain in the workforce owner; and diagnostics remain read-only.

Every proposed feature must identify its owner, cadence, exact state writes, save impact, invalid-input behavior, invariant coverage, and player-visible acceptance check before implementation. No new tick layer should be introduced merely for convenience.

## Suggested delivery order

1. Stabilize the truth surface with O1–O5, including the worker/main-thread parity and save/delta contract checks.
2. Add the seeded colony-health and one-year performance scenarios so future changes have a reliable baseline.
3. Deliver the Operations Center, Daily Council Report, and shared “Why?” layer as one coherent readability pass.
4. Add Workforce Policy Presets, the logistics overlay, and settlement legacy goals.
5. Add preparation-window crises and further authored content only after the existing state is easy to inspect, save, replay, and explain.

## Decisions

1. Keep all new work within the existing tick layers and named domain owners.
2. Keep diagnostics presentation-only and opt-in for verbose console output.
3. Treat worker/main-thread parity and save/load parity as release evidence, not optional extras.
4. Prefer explainable, recoverable player choices over hidden or irreversible failure.
5. Build on existing stories, relationships, ecology, workforce, diplomacy, and defense before adding unrelated major systems.

## References

- `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md`
- `docs/AGENTS.md`
- `docs/GAME_STRATEGY_SIMULATOR_AUDIT_2026-08-25.md`
- `roadmap_CURRENT_V0_6_3.md`
- `CHANGELOG.md`
- `BUG_REPORTS/*.md`

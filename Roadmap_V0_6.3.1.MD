# Wilderfolk Roadmap — v0.6.3.1

Status: development working tree (2026-08-25)

This roadmap carries forward the completed v0.6.3 work and turns the whole-game audit into a focused next step: make the living valley easier to understand, easier to verify, and richer in meaningful decisions without adding duplicate simulation owners or changing the established cadence.

| Priority | ID | Upgrade or feature | Main value | Primary owner/cadence | First-slice outcome | Status |
|---|---|---|---|---|---|---|
| 0 | **O1** | Player-visible Simulation Diagnostics | Makes the worker/main-thread mode, current tick, selected settler activity, workplace, home, and blocked reason understandable during play. | Presentation-only projection from existing diagnostics; no new simulation owner. | A compact optional drawer explains what the simulation is doing and why a selected settler is where they are. | Planned |
| 0 | **O2** | Explainable Story Choices | Keeps an unaffordable story card visible and explains the missing resource or condition. | Existing story owners and typed player commands. | Every blocked story choice gives a clear reason and remains available until the player can act. | Planned |
| 0 | **O3** | Save and Worker Truth Contract | Keeps important story, campaign, election, animal-care, residence, and staffing state consistent across worker updates and saves. | Existing `SimTickDelta`, save/load, and migration owners. | A single contract matrix covers extract/apply and save/load round trips for durable state. | Planned |
| 0 | **O4** | Selected Settler Inspector Completion | Turns the human status display into a dependable follow view for home, commute, work, leisure, and interruptions. | Authoritative world projection; existing human-status owner. | Selecting one settler shows live activity, home, workplace, schedule, target, and the latest transition. | Planned |
| 0 | **O5** | Calm, Useful Diagnostics | Keeps important warnings visible without flooding normal play or long-run logs. | `relationshipDiagnostics.ts` and future presentation diagnostics; flush cadence unchanged. | Normal play stays quiet; optional debug mode provides detailed daily and cumulative reports. | In progress — full-year `--debug` runner added |
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

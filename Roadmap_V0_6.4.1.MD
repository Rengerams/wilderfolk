# Wilderfolk Roadmap — v0.6.4.1

Status: development working tree (2026-09-08)

This roadmap carries forward the completed v0.6.3 work and turns the whole-game audit into a focused next step: make the living valley easier to understand, easier to verify, and richer in meaningful decisions without adding duplicate simulation owners or changing the established cadence.

## 6.4.1 large-file decommissioning update

The first decommissioning wave is complete for `buildingActions.ts`, `App.tsx`, `tickLayerDaily.ts`, and `residency.ts`. Their major responsibilities now live behind focused domain modules while existing public entry points, worker command paths, save/load boundaries, cadence ownership, and compatibility re-exports remain intact.

The residency split is complete: `residencySelection.ts` owns candidate scoring, home choice, empty-home preference, shared-housing logic, and overcrowding/rebalance selection; `residencyReconciliation.ts` owns occupant synchronization, partner transitions, and event, death, recruitment, import, and load reconciliation. `residency.ts` was then **retired outright** (2026-09-10): the facade had no policy of its own, so its nine callers now import `residencyOccupancy.ts`, `householdComposition.ts`, `residencySelection.ts`, or `residencyReconciliation.ts` directly, and `dayCycle.ts` keeps the compatibility re-exports. No import path, residence field, or save schema changed. Governance and write-ownership tests were updated to prevent a secondary residency owner from returning.

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
| 1 | **P6** | Normal-Zoom Presentation Pass | Confirms that characters, children, buildings, roads, walls, watchtowers, and selected panels read correctly at normal play scale. | Existing renderer and presentation assets only. | A browser acceptance checklist covers visual assets, panel hierarchy, status, map density, and defense feedback. | In progress — `npm run test:browser` captures labelled screenshots of the real build and gates console errors; the viewport/DPI matrix and the checklist are still to come |
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

## Implemented this working tree (new gameplay & engineering items)

Added 2026-09-08. Short player-facing rows; fuller descriptions live in the release-note draft below.

| ID | Status | Delivered |
|---|---|---|
| **Y7** | Implemented | Ten new female characters from a mudlark to an aristocrat; an aristocrat will spawn rarely.
| **N1** | Implemented | Famine desperation "foot-bite" — starving settler lunges at a neighbour; non-lethal, friendship drops, logged as scandal |
| **N2** | Implemented | Traveling Theatre script "The Famine Foot" — troupe stages the lean-day foot-bite when it is in recent history |
| **N3** | Implemented | Valley ecology stage ladder parked — no strain messages or hidden hunt/farm/illness effects; wildlife info stays |
| **N4** | Implemented | Lumber-mill nearby-tree yield bonus removed (`treeProximity.ts` deleted) |
| **N5** | Implemented | Prison guard duty — 8 h shifts, 3 guards = 24 h coverage; unguarded prison risks early escape |
| **N6** | Implemented | Schedule-aware off-work behaviour — evenings/nights follow the configured work window instead of fixed legacy hours |
| **N7** | Implemented | Central constants file (`gameConstants.ts`) — duplicate constants collapsed to one home; values explained |
| **N8** | Implemented | Residency facade retired — `residency.ts` deleted; its nine callers import the four focused owners directly |
| **N9** | Implemented | Colony larder meal rule now owns its gates — one `tryEatColonyMeal()`; four duplicate `humanTick.ts` blocks removed |
| **N10** | Implemented | Elections described truthfully — stored `decennial` token renamed to `term`; legacy saves migrated on load, no version bump |
| **N11** | Implemented | Leader residency survives remarriage/divorce (daily idempotent sync) + Leader's House sprite anchor 0.97 → 0.836 |
| **N12** | Implemented | Speed/pause controls no longer revert — the player's choice is carried across authoritative display rebuilds |
| **N13** | Implemented | Affair tryst chance halved (0.14/0.20 → 0.07/0.10); every affair value now documented in `gameConstants.Relationship` |
| **N14** | Implemented | Jailed leader keeps the office — arrest no longer stamps `settler`, release re-stamps the leader; Moon Howler revert hardened |
| **N15** | Implemented | Expectations are no longer births — new `'conception'` event type, its own Chronicle filter, and a council line that counts `Births` and `Expecting` separately (30 deliveries vs 30 `'birth'` events at seed 12345, was 30 vs 54) |
| **N16** | Implemented | Browser acceptance harness (`scripts/browser-smoke.mjs`, `npm run test:browser`) — real Chrome, zero new dependencies: boots the production build, drives intro → settlement, proves the HUD ticks, captures screenshots, and fails on any new console error; found the missing mountain sprite art on its first runs |
| **N17** | Implemented | In-app virtual player (🤖 Auto-play) — pure decision engine dispatching real worker commands through the player's own door, one per in-game hour; header status + five-act history, session min/avg FPS, and a `settlers · buildings · acts` readout. **Dev-gated:** the toggle renders only when `import.meta.env.DEV === true`. Village Request / diplomacy answers respect gold and eligibility gates.  |

Added 2026-09-10: rows **N8–N14** cover the second working-tree pass (facade retirement, the larder-rule owner, the election term token, the leader-residency/anchor fixes, the speed/pause revert fix, the affair rebalance, and the jailed-leader office fix). Row **N15** is the conception/birth labelling fix, found by the same audit's full-year reconciliation. Row **N16** adds the browser tier the Node-only suite could never cover; its evaluation and the measured case against full-frame screenshot gating live in `docs/plans/browser-testing-evaluation.md`. Row **N17** is the in-app virtual player, which carries the one release blocker below.

## What's new in this working tree — release-note draft

Drafted 2026-09-08 so release notes can be assembled from here instead of being written at release time. Each item is implemented and gated green (tsc, oxlint, build, full test suite) unless marked otherwise.

### Player-facing changes

| Feature | Short description (player-facing) | Notes |
|---|---|---|
| **Village Dashboard (📊)** | Full-screen overview: valley concerns with severity, "what changed" day-over-day diffs, food produced/consumed/net, wildlife deltas, daily council summary, and a read-only explanation of a selected settler. Opened from the header or HUD; Esc/✕ closes. | Presentation-only; no new simulation owner. |
| **Famine "foot-bite" desperation** | In a true famine, a truly starving settler may lunge at a neighbour's foot — a rare, deliberately **non-lethal** comic beat. The pair's friendship score takes a hit (the victim is not amused). Logged as a scandal. | New daily rule in `famineDesperation.ts`; fires at most once per famine day. |
| **Traveling Theatre: “The Famine Foot”** | When a famine foot-bite scandal is in the valley's recent history, the troupe can stage a raucous, self-mocking farce about the lean days alongside the other plays. | New authored script fed by the real event log. |
| **Valley ecology ladder parked** | The valley stage ladder (Stable → Strained → Damaged → Collapse) is temporarily disabled: no more unexplained "valley strained" messages, and no hidden hunt/farm/illness effects. Wildlife counts and Nature information remain visible. | Single switch (`ValleyEcology.ENABLED = false` in `gameConstants.ts`) — re-enable when the system is rebalanced. |
| **Lumber-mill tree bonus removed** | Lumber mills no longer get an extra yield bonus for trees placed nearby. | Developer: "bullshit multiplier" — file deleted. |
| **Prison guard duty** | Staffed Prison Guards cover **24 h** in 8 h shifts (3 guards = full coverage). If a completed prison holds prisoners while unguarded, there is an escape risk — the prisoner leaves early but stays in the colony. | Daily owner `prisonGuardDuty.ts`. |
| **Schedule-aware off-work behaviour** | Settlers' evenings, nights, and time off now follow their configured work schedule (work, home, and social windows are separate), instead of fixed legacy hours. | Replaces the legacy fixed-window behaviour behind compatible wrappers. |
| **Speed and pause buttons now hold** | Picking 0.5× / 2× / 3× / 5× / 10×, or pausing, stays picked. Previously the choice was undone by the very next command (build, assign, demolish), so the buttons read as inert. | Player-authored controls now survive authoritative display rebuilds; fix recorded in `BUG_REPORTS/2026-09-10-speed-control-reverts-on-command.md`. |
| **Expecting is no longer reported as born** | The Chronicle lists **Conceptions (expecting)** 🤰 separately from **Births** 👶, and the dashboard's daily council line reads `Births N · Expecting M`, so a settled pregnancy announcement never reads as a child already delivered. | Event-label fix only: the conception owner, the daily cadence, and every pregnancy field are unchanged; recorded in `BUG_REPORTS/2026-09-10-conception-logged-as-birth.md`. |

### Engineering / project changes (for the changelog)

- **Central constants file (`gameConstants.ts`).** Duplicate declarations collapsed for calendar lengths (year/season), human food/meal consumption, tamed-animal rations, and the authored-story cooldown flag; blueberry spawn constants now import from the foraging owner; `simHelpers`, `dayCycleClock`, `animalCare`, `humanNeeds`, and the five authored-story modules now read from one source of truth with thin legacy re-exports where real callers still exist. Sections added since: `Prison` (guard shifts, coverage, escape chance), `Social` (female class weights), `Famine` (bite thresholds), `ValleyEcology` (the parked-ladder flag), and `Human.MEAL_ENERGY_RESTORE` (the one meal restore value).
- **Residency facade retired.** `residency.ts` deleted (2026-09-10) once all nine callers imported the focused owners directly; `dayCycle.ts` remains the compatibility re-export surface. Side effect recorded: the unused-export audit dropped from 106 to 55 names, because exports that only looked used through the facade now resolve at their real owner.
- **Duplicate-rule removal in `humanTick.ts`.** The colony meal rule and the exhaustion-death sequence each existed twice with different guards; both are now single owner functions in `simulation/humanNeeds.ts`, the map-edge clamp is shared through `mapBounds.ts`, and a duplicated leisure steer collapsed to one local helper. All four `humanTick.ts` self-clones are gone. Measured with jscpd: 62 → 57 clones at default sensitivity (435 → 410 duplicated lines), and 0 at the project's configured thresholds (`npm run dup`, `--min-lines 12`). The configured gate never saw these blocks because they are 11 lines and 6 lines.
- **Election term token renamed with a save-compatibility path.** `'decennial'` → `'term'` in the reason union, `ElectionCeremonyState`, and `tryStartDecennialElectionCeremony` → `tryStartTermElectionCeremony`. `validateVillageLeaderOnLoad` rewrites a stored `'decennial'` on load, so no save-version bump and no migration entry was needed. Historical `CHANGELOG.md` entries that recorded the old 10-year design were deliberately left as history. The *why* of a 2-year term (a session-length decision from playtesting) is now recorded beside `ELECTION_INTERVAL_YEARS`.
- **Player controls survive authoritative rebuilds.** `speed` and `paused` are fields of `WorldState` but are authored by the player on the main thread, so `rebuildOptimisticDisplay()`'s deep clone of the worker's last snapshot silently reverted them on every command. `carryPresentationControls()` now preserves exactly those two fields; everything the simulation authors (including `bigNews`, `floatingTexts`, and dismissed-id sets) still comes from the worker. Regression test fails `expected 1 to be 5` without the carry-over.
- **An expectation is a `'conception'`, a delivery is a `'birth'`.** The two conception writers (`startMarriedPregnancy`, `startYouthPregnancy`) now type the "expecting" announcement as `'conception'`, and each consumer decided its behaviour: the Chronicle gets its own **Conceptions (expecting)** filter, `dashboardData` counts expectations in a separate bucket instead of adding to `Births`, the `first_birth` tutorial still waits for a real delivery plus a living newborn, and `rumourLedger` keeps the same `'family'` source kind. `EventLogPanel`'s exhaustive `Record<GameEventLog['type'], …>` icon/colour maps mean a future event type cannot be added without choosing how it looks in the Chronicle. The affair expectation deliberately stays a `'scandal'`. No save change: `eventLog` is historical text passed through load unchanged, and pre-fix `'birth'` entries keep their meaning. Same-seed year before/after: 54 birth-typed events against 30 deliveries → 30 and 30, with 24 conceptions reported separately.
- **A browser tier exists now — without a second test runner.** `scripts/browser-smoke.mjs` (`npm run test:browser`, `npm run test:accept`) boots the production build in the installed Chrome through the DevTools Protocol, drives intro → "Settle the valley", dismisses the Quick-start overlay, proves the HUD clock advances, captures `intro` / `map-setup` / `valley-frozen` / `valley` / `valley-later` screenshots plus `report.json`, and fails on any new console error, page exception, failed request or blank canvas. No dependency was added: Node ships `fetch`, `WebSocket` and `zlib`, and the harness decodes the PNGs itself. The evaluation of modern-web.dev and the measured reasons not to gate on full-frame pixels (30.3 % same-seed drift versus 0.5 % for the HUD strip; the UI picks a random map seed and `nameLoader` still uses the global RNG) are recorded in `docs/plans/browser-testing-evaluation.md`. Its first runs found the unshipped mountain sprite art (`BUG_REPORTS/2026-09-10-mountain-sprites-missing.md`).
- **Valley stage state is preserved** (save-safe): the ladder is parked, not removed — no save/migration impact, and re-enabling is a one-flag change.
- **Hunting yield test updated** to assert the parked valley no longer cuts hunt yield.
- **Docs:** `docs/plans/constant-centralization-plan.md` now records the organisation rules, the "explain every number" standard, per-category file options, and implemented slices; `docs/CONSTANTS_GUIDELINE.md` records the number-explanation standard and defers to `AGENTS.md` as the controlling authority.

### Open working-tree items (not yet committed)

- Schedule-aware work + prison-guard duty + the famine bite/theatre script + the constants collapse live in the working tree and are **not yet committed**; commits remain at the developer's discretion. The 2026-09-10 pass (residency facade retirement, the larder-rule owner, the election term rename, the leader-residency/anchor fixes, and the speed/pause revert fix) is likewise uncommitted.
- Famine bite tuning values (energy ratio 0.3, attempt 0.15/day, success 0.4, friendship −8/−16) are playtest-flavoured; revisit after a real famine session.
- **Three open defect records** (private, `BUG_REPORTS/`): child sprites still ship three art files without an alpha channel (`child_boy_bakersboy`, `child_boy_merchantson`, `child_girl_poorservant`), a staffed Hunting Spot still emits its arrow from the building rather than the assigned hunter, and the preloaded `/sprites/mountains/*.png` art does not exist in `public/` (found by the new browser harness; it fails the console check until a developer decides whether the art is coming or the four references should go). All three are presentation-only; none affects simulation state. The mountain one is the harness's only `KNOWN_CONSOLE_ERRORS` entry, so `npm run test:browser` stays green while the defect remains visible in the report.
- **Open balance question — courtship speed and divorce churn.** Courtship accumulates ~96–144 progress per in-game day while marriage needs 100, and `isEligibleToCourt` only requires `'single'`, so there is no cooldown after a divorce and a settler can divorce and remarry inside two days (observed in play: divorced day 10, married day 11). Candidates: a post-divorce cooldown modelled on the existing widow `griefUntilTick`, and/or a slower courtship rate. Deliberately left unchanged pending a developer decision.
- **Accepted behaviour (developer, 2026-09-10): a released leader may not move into the Leader's House.** Not a defect to chase — "its no problem that just the fun of the game". Recorded so a future audit does not file it as a regression.
- Food-balance and climate/season harvest rework drafts are **parked** — the developer is rebuilding weather, terrain landscape, and pathfinding in a separate branch, so those areas were left untouched.

### 🚩 Release blockers (must change before release)

- **Gate the auto-play button (N17).** Done — the toggle is wrapped in the same DEV check used by `gameTick.ts` (`typeof import.meta !== 'undefined' && import.meta.env?.DEV === true`), so release/Tauri builds do not expose Auto-play.

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

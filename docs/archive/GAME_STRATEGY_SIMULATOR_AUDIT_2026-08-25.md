# Wilderfolk — Whole-Game Strategy and Simulation Audit

**Generated:** 2026-08-25  
**Scope:** Whole TypeScript/React game codebase, simulation logic, worker transport, persistence, UI integration, performance, and roadmap opportunities.  
**Method:** Repository structure review, source-level ownership tracing, current changelog/roadmap review, existing audit reconciliation, focused validation commands, and what-if/risk-reward analysis. The installed `game-strategy-simulator` skill is sports-oriented, so its play-selection and risk/reward framing has been adapted here to colony-simulation decisions rather than treated as a code-review authority.

## Executive conclusion

Wilderfolk is in substantially better shape than a typical prototype. The project has a clear simulation-owner model, a real worker path, typed commands, extensive focused tests, deterministic-seed work, save/delta handling, and a broad set of authored systems. The strongest foundation is the separation between simulation truth and presentation: daily systems are concentrated in `tickLayerDaily.ts`, worker transport is explicit, and simulation invariants exist.

The principal risk is not a lack of features. It is **integration confidence**. Several features can be locally correct while still failing in the live game because their state is stale, not transported, not persisted, poorly surfaced to the player, or too expensive at the chosen map scale. The recommended next phase should therefore prioritize observability, end-to-end acceptance scenarios, and a small number of high-leverage fixes before adding another large system.

> **Overall recommendation:** Spend one short stabilization cycle on “truth visible to the player” before beginning a major new feature. Make every important simulation outcome inspectable, persisted, replayable, and validated at the largest supported map size.

## 1. Current health snapshot

| Area | Assessment | Evidence and interpretation |
|---|---|---|
| TypeScript/build | **Healthy** | `npm run build` completes with TypeScript and Vite. The game bundle remains above the 500 kB warning threshold, so build correctness is stronger than delivery/performance confidence. |
| Type-aware lint | **Healthy** | `npm run lint` reports 0 warnings and 0 errors across 310 files. |
| Automated coverage | **Broad, but not sufficient alone** | The repository contains focused tests for simulation cadence, worker transport, stories, elections, staffing, pathfinding, relationships, saves, and rendering. The project audit records 88 test files / 474 tests. These establish assertions, not full player-visible correctness. |
| Simulation ownership | **Strong** | `tickLayerDaily.ts` visibly owns daily story, election, animal-care, watchtower, and campaign calls. This aligns with the project rule against duplicate tick owners. |
| Worker architecture | **Good, runtime-sensitive** | Typed commands and deltas are present. Recent worker watchdog and asset issues show that browser startup and post-start latency need live diagnostics, not only unit coverage. |
| Persistence | **Improved, must stay under regression watch** | Story/campaign fields were added to delta/save handling in the current tree. Save compatibility is intentionally strict, so every new persisted field requires migration/version discipline. |
| Performance | **Main technical risk** | Huge maps, pathfinding, terrain/render work, and a roughly 671 kB game chunk create a meaningful low-end-browser risk even when tests are green. |
| UX/readability | **Functional, uneven** | The selected-human activity panel, staffing controls, guided campaign, alerts, and advanced actions exist. The player still needs stronger causal feedback: why an action is blocked, what system is waiting, and what changed after a daily tick. |

## 2. Simulation architecture audit

### 2.1 What is working well

The architecture has the right conceptual boundaries for a simulation game. `WorldState` is treated as authoritative while the worker is active; UI actions are routed through typed commands; daily decisions are concentrated in the established daily cadence; and invariants explicitly check relationships between entity fields and building occupant lists. This is the correct foundation for deterministic replay and for future debugging.

The current source also shows good reuse of existing owners. Story generation and expiry are owned by story modules, elections by `electionPromises.ts` plus the daily layer, residence assignment by `dayCycle.ts`, worker assignment by workforce modules, and watchtower detection by its own bounded daily owner. That is preferable to adding broad event buses or another convenience update loop.

### 2.2 Main risks

The primary risk is **partial truth**: a worker can have the correct state while the main-thread presentation, catalog, save payload, or diagnostic surface has an older projection. The selected-human inspector recently demonstrated this exact class of problem: the status helper existed and the panel rendered it, but the app preferred an optimized catalog object over the current authoritative world entity. The correction to resolve from `world` first is the right pattern and should be applied consistently to all player-visible inspectors.

The second risk is **false confidence from headless tests**. A story resolver may pass in isolation while a browser card consumes an unaffordable choice, a worker delta omits a field, or a save/load operation loses progress. The repository has already encountered these failure modes. Acceptance criteria should therefore follow the full path: player control → typed command → authoritative owner → delta → UI projection → save/load.

The third risk is **boundedness at scale**. The current Huge map is approximately 2,560 × 1,920, or about 4.9 million tiles. The pathfinding implementation now uses sparse maps for search scores and predecessors, which removes the earlier full-grid allocation concern. That is a good fix, but it does not eliminate the broader need to measure path frequency, cache churn, terrain queries, worker serialization, and render cost under a large population.

## 3. What-if strategy analysis

The following scenarios use the strategy skill’s risk/reward framing, adapted to colony simulation. They are not probability claims about player behavior; they are engineering decision scenarios.

| Scenario | Likely player-visible outcome | Technical risk | Strategic response |
|---|---|---|---|
| Worker remains active for a full year on a Huge map | Simulation feels smooth only if tick latency, pathfinding, and delta size stay bounded | High: long-tail latency can trigger watchdog fallback or make controls feel delayed | Add a seeded year-run benchmark with p50/p95 tick latency, path calls, delta bytes, and fallback count. |
| Player clicks an unaffordable story choice | Card should remain available with a clear resource explanation | High: consuming the card destroys agency and can permanently stall a chain | Treat every resolver rejection as a first-class blocked outcome; preserve the card and display the missing resource. |
| Food shortage affects tamed animals | Player should see fed → warning → shortage → recovery and understand the cause | Medium: hidden state flags can produce silent non-recovery or incorrect re-warning | Expose animal-care status and ration consumption in the UI and assert the complete state machine. |
| Player assigns a worker manually while auto-fill is active | UI should make the mode and consequence unambiguous | Medium: conflicting controls can cause “the game ignored me” reports | Show mode, current workers, capacity, and reason for rejected assignment in one panel. |
| Player follows one settler for several in-game days | Activity, home, commute, workplace, and interruption state should update live | Medium: stale projections or overly broad catalog reads can mislead | Use authoritative-world resolution everywhere in inspector/follow views and add a live acceptance scenario. |
| Player builds a large settlement with walls and roads | Movement should remain explainable, not merely “slow” or stuck | High: pathfinding failures, blocked gates, and visual topology can be confused | Add path-failure reasons and a debug/player-facing movement state such as blocked, rerouting, or arriving. |
| Player reloads after a major story/election event | Progress should survive exactly according to the save policy | High: strict versioning makes omissions costly | Keep a save contract table and run save/load round trips for every new durable state field. |

## 4. Quick wins, prioritized

### P0 — Do before calling the next release stable

| Quick win | Why it matters | Smallest implementation slice | Acceptance evidence |
|---|---|---|---|
| **Add a player-visible simulation diagnostics drawer** | Converts “the settler is doing nothing” into an explainable state. It should show tick, worker/main-thread mode, current tick latency, last daily boundary, selected entity activity, workplace, home, and blocked reason. | Read-only UI projection from existing diagnostics; no new simulation owner. | Browser check while selecting a settler, changing speed, pausing, and triggering a blocked action. |
| **Make all story-choice rejection paths preserve the card and explain the gate** | Prevents permanent loss of authored content and restores player agency. | Centralize resolver result as accepted/blocked/rejected with missing-resource metadata; do not remove a pending card until accepted. | One test per new story plus a live click on an unaffordable option. |
| **Add a full save/delta contract test matrix** | Story, campaign, election, animal care, residence, and staffing state are high-value durable truth. | Define fields by owner and assert extract → apply and save → load round trips. | Worker and main-thread parity on a seeded scenario. |
| **Finish the selected-human inspector as an end-to-end feature** | The status line exists, but its value is only useful if it changes correctly in the running game. | Add explicit residence, workplace, schedule, current target, and last transition fields using authoritative world data. | Select a worker, advance through commute/work/home, and verify each transition visually. |
| **Replace noisy recurring diagnostics with sampled or opt-in logging** | The current relationship diagnostics can flood the console during long runs and make real faults hard to find. | Keep counters, but log only on state transition, interval, or debug mode. | One-year run with bounded console volume and retained important warnings. |

### P1 — High return within one focused iteration

| Quick win | Benefit |
|---|---|
| **Add a seeded “100-day colony health” scenario** | Exercises food, housing, workforce, relationships, stories, elections, animal care, and worker deltas together. |
| **Add tick-latency telemetry** | Distinguishes a slow but healthy worker from a lost response and prevents arbitrary watchdog tuning. |
| **Add explainable assignment rejection messages** | Tells the player whether a worker is juvenile, already assigned, manually protected, at capacity, imprisoned, or missing a valid workplace. |
| **Add a compact resource-flow panel** | Shows production, consumption, storage pressure, and daily net change. This makes the economy strategizable rather than opaque. |
| **Add a “why is this person here?” movement trace** | A short read-only chain such as `home → workplace → tavern → home`, with current target and reason for interruption. |
| **Add a normal-zoom visual acceptance checklist** | Character sprites, child sprites, building icons, activity status, panel density, roads, walls, and watchtower feedback should be checked in the actual browser, not inferred from code. |
| **Add a dedicated family-reference regression test** | The implementation exists, but the prior audit noted that the named dedicated test was absent. This closes a cheap coverage gap. |

### P2 — Technical debt with compounding payoff

| Quick win | Benefit |
|---|---|
| **Make dependency-cycle auditing TypeScript-7-compatible or replace it with a supported graph check** | Current dependency-cruiser output says zero modules because it cannot parse the installed TypeScript version; the result is not meaningful evidence. |
| **Split or lazily load the largest game bundle** | Improves initial load and reduces memory pressure. Prioritize non-startup panels and data-heavy features. |
| **Deduplicate RNG helpers** | Keeps deterministic semantics in one place and reduces the chance that two hashing implementations drift. |
| **Use `import.meta.dirname` in Vite configuration** | Removes the future native-config warning and keeps tooling current. |
| **Document exact save-version policy in the in-game UI and changelog** | Prevents players from mistaking a deliberate incompatible save for corruption. |

## 5. New features advised

The best new features are not isolated content drops. They should turn the existing simulation into a more legible set of strategic decisions.

### 5.1 Colony Operations Center — highest recommendation

Create a compact operations view that combines population, food, housing, workforce, threats, story cards, and warnings. It should answer: What is failing? What is about to fail? What can the player do now? Each row should link back to the relevant entity or building.

**Why this fits:** The game already computes most of the required data. This feature primarily projects existing truth and therefore has a favorable risk/reward ratio. It also directly addresses the recurring problem that code can be correct while the player cannot see why the colony behaves as it does.

### 5.2 Daily council report

At each daily boundary, present a concise report containing net food, new assignments, homeless settlers, deaths/births, relationship events, story progress, raids detected, and unresolved warnings. Allow the player to expand each item.

**Strategic value:** It creates a natural planning rhythm without adding another simulation cadence. It helps players understand cause and effect and gives the existing daily owner a clear presentation surface.

### 5.3 Workforce policy presets

Add named policies such as **Survival**, **Growth**, **Defense**, and **Comfort**. A policy would configure auto-fill priorities, food reserve thresholds, staffing protection, and optional overtime behavior while leaving manual assignments authoritative.

**Constraint:** Policies must compile into existing typed commands or existing workforce state. Do not add a second workforce owner. The player must always be able to inspect and override the resulting assignments.

### 5.4 Infrastructure and logistics planning

Introduce a read-only overlay showing supply routes, average commute distance, blocked paths, and buildings with poor access. Later, allow the player to designate priority roads or haul routes.

**Strategic value:** The game already has workers, buildings, roads, walls, gates, pathfinding, and map scale. Logistics would connect these systems into a meaningful spatial strategy layer without requiring a new combat system.

### 5.5 Settlement memory and legacy goals

Extend the existing story/event log into durable settlement goals: first winter survived, first election promise kept, first Moon Howler cured, first rival treaty, first child born, first shortage recovered. Goals should be read-only projections of existing flags and events, with optional rewards or narrative consequences only after the base tracking is reliable.

**Strategic value:** Gives long-running colonies a sense of identity and makes the authored stories and social systems accumulate into a coherent arc.

### 5.6 Controlled crises with preparation windows

Add telegraphed, bounded crises: an approaching harsh winter, a rival trade embargo, a disease risk, a harvest failure, or a fire hazard. Each crisis should provide a preparation window, clear indicators, and multiple viable responses.

**Design rule:** Avoid hidden punishment. Every crisis must expose its trigger, warning, mitigation, and outcome. Use existing daily event ownership and deterministic seeded decisions.

### 5.7 Replay and “what changed?” mode

Allow players and developers to inspect a short history of daily state changes: food, housing, assignments, story flags, deaths, births, raids, and major relationship transitions. A debug version could compare two seeded runs and identify the first divergent owner/field.

**Strategic value:** This is unusually valuable for a deterministic simulation game and would reduce future debugging time more than another isolated content feature.

## 6. Features I would defer

I would defer a large combat expansion, deep technology trees, multiplayer, unrestricted map-size growth, and another major story branch until the operations/observability layer is stronger. These features add content but also multiply the number of state transitions that must be transported, saved, explained, and tested. The current game’s highest leverage is making its existing simulation readable and dependable.

## 7. Suggested implementation roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **Stabilize** | Story rejection handling, save/delta contract matrix, animal-care full state machine, inspector acceptance flow, sampled diagnostics | No known content-loss path; worker/main parity; browser evidence for status/home/work transitions. |
| **Measure** | Seeded 100-day and one-year scenarios, worker latency telemetry, Huge-map pathfinding/render benchmark | p50/p95 metrics recorded; no unexplained fallback; no unbounded console spam; documented performance budget. |
| **Clarify** | Operations Center, daily council report, resource-flow panel, assignment explanations | A new player can identify the top three colony risks without reading logs or source. |
| **Strategize** | Workforce policies, logistics overlay, settlement legacy goals | New decisions reuse existing owners and do not create duplicate cadence or authority. |
| **Expand** | Preparation-window crises and additional authored content | Each new system has explicit owner, cadence, state writes, save impact, invalid-input behavior, and seeded acceptance scenario. |

## 8. Audit limitations

This report is a source-and-validation audit, not a replacement for playing the game. Automated tests establish tested invariants; source inspection establishes call-site reachability and ownership; build checks establish compilation and bundling. None of these alone proves that a player can understand the result at normal zoom, that every visual asset loads in the browser, or that a long-running worker session feels responsive.

The report also reconciles the current working tree with the older `AUDIT_2026-08-25_v0.6.3.md`. That older report contains findings that have since been addressed in the current tree, including story/campaign state transport, unaffordable story-card preservation, animal-care state progression, and sparse pathfinding structures. Those fixes should be retained, but their acceptance should be re-run after any subsequent refactor.

## References

[1]: ../docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md "Wilderfolk One Document to Follow"
[2]: ../docs/SIMULATION_AUTHORITY.md "Wilderfolk Simulation Authority"
[3]: ../roadmap_CURRENT_V0_6_3.md "Wilderfolk Current v0.6.3 Roadmap"
[4]: ../docs/AUDIT_2026-08-25_v0.6.3.md "Wilderfolk v0.6.3 Audit"
[5]: ../package.json "Wilderfolk package scripts"
[6]: ../src/game/tickLayerDaily.ts "Daily simulation tick owner"
[7]: ../src/game/simBuffers/simDelta.ts "Simulation delta transport"
[8]: ../src/game/saveSchema.ts "World-state save allow-list"
[9]: ../src/game/humanStatus.ts "Human activity status projection"
[10]: ../src/game/pathfinding.ts "Wilderfolk pathfinding implementation"


## Appendix A — Superpowers re-audit

**Review mode:** `using-superpowers` process applied on 2026-08-25. The review was deliberately structured as a second pass rather than accepting the previous report’s conclusions. Each important claim was challenged against four questions: Is the code reachable? Is the owner and cadence correct? Does authoritative state cross worker and save boundaries? Can the player observe the outcome and recover from failure?

### A.1 Process findings

The process review confirms that the previous report’s central conclusion remains sound: Wilderfolk’s main risk is **integration confidence**, not feature count. A helper function and a passing unit test are insufficient evidence when a feature crosses UI, typed commands, worker deltas, persistence, and player-visible feedback.

The installed `game-strategy-simulator` skill itself is not a software-audit authority; its description is for sports strategy simulation. Its useful contribution here is the what-if framework: identify the decision, expected outcome, downside risk, recovery option, and measurable acceptance signal. The project-specific authority remains the Wilderfolk design document, simulation authority, source code, tests, and runtime behavior.

### A.2 Revalidated conclusions

| Question | Revalidated conclusion |
|---|---|
| Are daily simulation owners duplicated? | No material duplicate owner was found in the reviewed paths. `tickLayerDaily.ts` remains the visible integration point for daily stories, elections, animal care, guided campaign, and watchtower detection. |
| Is the worker/save story state still missing? | No. The current tree contains `storyFlags`, `pendingStoryEvents`, and `guidedCampaign` in the simulation delta and save allow-list. The older audit’s critical finding is historical and should not be reported as current. |
| Are story rejection paths still losing cards? | The current `respondToStoryEvent` implementation re-adds events for the reviewed gated story branches. This should remain covered by insufficient-resource scenarios, but the historical defect is not sufficient evidence of a current defect. |
| Is the animal-care shortage branch unreachable? | No. The current `animalCare.ts` writes shortage state and clears warning/shortage markers after successful feeding. The older audit’s animal-care finding is historical and should not be reported as current. |
| Is Huge-map pathfinding still allocating full-grid score arrays? | No. The current implementation uses sparse `Map<number, number>` structures for `gScore` and `came`. This removes the specific full-grid allocation defect, although a scale benchmark remains advisable. |
| Is the selected-human panel trustworthy? | The panel now resolves the selected entity from the authoritative `world` first, with the catalog as fallback. This directly addresses the stale inspector projection observed earlier. Live visual acceptance remains necessary. |
| Is the build and lint baseline healthy? | Yes. `npm run lint` passed with zero warnings/errors and `npm run build` passed. The build still emits a large-chunk warning. |
| Is the explicit type-check command healthy? | The repository has no `typecheck` npm script; `npm run typecheck` fails with “Missing script.” The build does run `tsc -b`, and `test:all` includes TypeScript validation, but a named `typecheck` script would make the project easier to audit and automate. |
| Is dependency-cycle output conclusive? | No. Dependency-cruiser reports zero modules because its TypeScript transpiler does not support the installed TypeScript 7 toolchain. This is a tooling-evidence gap, not proof of zero cycles. |

### A.3 Revised quick-win order

The superpowers pass changes the priority order slightly. The immediate objective should be to make correctness **observable and reproducible**, not to add more simulation rules.

| Priority | Action | Definition of done |
|---|---|---|
| **P0** | Add an explicit `typecheck` script and a bounded validation runner | One documented command reports source guard, type-check, lint, focused tests, full tests, and build with separate exit codes. |
| **P0** | Add worker/main-thread parity scenarios | The same seeded scenario produces equivalent key state, story flags, residence, staffing, and resource totals in both modes. |
| **P0** | Add player-facing blocked-action explanations | Every rejected assignment, unaffordable story choice, blocked path, and unavailable building explains the reason and leaves the world unchanged. |
| **P0** | Add live inspector acceptance coverage | A selected settler visibly transitions through home, commute, work, leisure, and blocked states while the panel remains synchronized. |
| **P1** | Add a one-year seeded performance run | Record p50/p95 tick time, worker fallback count, path calls, delta bytes, memory trend, and console volume on Medium, Large, and Huge maps. |
| **P1** | Reduce diagnostic noise | Counters remain available, but recurring relationship and simulation diagnostics are sampled or debug-gated. |
| **P1** | Add a save-contract manifest | Every durable field lists owner, serializer, migration status, and a round-trip test. |
| **P2** | Improve dependency and bundle tooling | Replace the unsupported dependency-cruiser check and split/lazy-load the largest non-startup bundles. |

### A.4 Revised feature advice

The recommended feature list remains valid, but the re-review clarifies the order. The first new player-facing feature should be an **Operations Center**, because it exposes existing simulation truth and reduces support/debugging cost. The second should be a **Daily Council Report**, because it gives the existing daily cadence a clear player-facing consequence. Only after those are stable should Wilderfolk add more systemic content such as workforce policies, logistics planning, or preparation-window crises.

A particularly strong feature opportunity is a **“Why?” interaction layer** shared by people, buildings, resources, and alerts. Selecting a settler would show why they are at a location; selecting a building would show why it is understaffed; selecting a resource would show its recent sources and sinks; selecting a warning would show the exact owner and recovery action. This is a small UI surface with unusually high strategic value because it turns a complex simulation into understandable decisions.

### A.5 Final confidence statement

The current codebase is **build-healthy and structurally credible**, with broad automated coverage and several important historical defects already corrected. It is not yet appropriate to claim that every feature is fully verified solely from source review and tests. The strongest remaining evidence gaps are live browser acceptance, worker/main parity under long runs, performance at Huge scale, and a trustworthy dependency-graph check.

The appropriate release posture is therefore **“feature-complete in many areas, stabilization and observability still required,”** rather than “fully proven.” No source code was changed during this re-audit; only this report was updated.

### A.6 Updated references

[11]: ../src/game/animalCare.ts "Current animal-care state machine"
[12]: ../src/game/storyEvents.ts "Current story event resolution and rejection handling"
[13]: ../src/game/simRng.ts "Deterministic simulation RNG streams"
[14]: ../src/game/electionPromises.ts "Election promise owner"
[15]: ../src/game/guidedCampaign.ts "Guided campaign owner"
[16]: ../src/components/SelectedEntityPanel.tsx "Selected-human inspector"
[17]: ../src/App.tsx "Application state projection and selected-entity resolution"
[18]: ../src/game/gameLoop.ts "Game loop and worker fallback behavior"

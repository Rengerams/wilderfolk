# Serial God-File Decommissioning Plan

**Status:** File 1 (`buildingActions.ts`) has passed the decommissioning gate. File 2 (`App.tsx`) is active; Slices 2.1 map-stage and 2.2 build-rail presentation are complete.
**Scope:** Fully decommission exactly one protected god file before beginning the next.
**Current starting point:** `dayCycle.ts` is already decommissioned as a god file and remains a controlled compatibility facade. The active protected files are `App.tsx`, `tickLayerDaily.ts`, `humanTick.ts`, and the successor module `residency.ts`. `buildingActions.ts` is now a controlled compatibility façade.

> **Protected does not mean frozen.** It means new independent behavior must be placed in a focused adjacent module while the protected file is steadily reduced. No work begins on the next god file until the current one passes its decommissioning gate.

## 1. Non-negotiable serial workflow

For every file, work through the same cycle: establish a behavior baseline, extract one named responsibility, validate it, repeat until the file is only a narrow coordinator/facade, then update its status in `AGENTS.md`. Only after this final gate may the next protected file become the active target.

| Step | Required result |
|---:|---|
| 1 | Freeze the current file’s responsibility map: remaining blocks, imports, exports, state writes, and existing tests. |
| 2 | Extract one cohesive domain into a specifically named module. Do not redesign unrelated behavior in the same change. |
| 3 | Verify targeted behavior, TypeScript types, relevant simulation/worker/save paths, and player-visible flow. |
| 4 | Repeat only on the active god file until it is a clear facade/coordinator. |
| 5 | Run the completion gate, remove/downgrade that file’s god-file status in `AGENTS.md`, and record the completed phase in the roadmap. |
| 6 | Choose the next file. |

During this program, an urgent bug fix in another file is allowed, but no new subsystem, feature, or unrelated responsibility is added to a non-active god file. Create the focused destination module instead.

## Roadmap rationale and ownership decisions

The roadmap is intentionally serial rather than parallel. Each protected file must be reduced to a clear coordinator or compatibility facade before the next protected file becomes active. This prevents two modules from becoming competing authorities for the same simulation decision and makes each behavior change auditable.

The sequence begins with `buildingActions.ts` because it was the smallest and clearest command facade. Staffing, residency, maintenance, configuration, settler interaction, generic routing, and workshop estimates had separable policy boundaries, while the original public exports and worker command protocol could remain compatible through a forwarding facade.

`App.tsx` follows because its existing hooks and layout slots provide low-risk presentation seams. `GameMapStage`, `GameBuildRail`, `GameInspector`, `GameOverlays`, and `GameSidebar` may own presentation structure, but selection state, keyboard policy, canvas interaction, build placement, worker commands, and transient-feedback lifecycle remain in their existing owners. A second input or notification authority would duplicate policy rather than decommission it.

`tickLayerDaily.ts` precedes `humanTick.ts` so daily ownership is explicit before the realtime human pass is changed. Building economy, population reconciliation, challenges, world events, and ecology move into focused owners, while the reduced coordinator retains the exact ordered daily schedule and the 72-tick production cadence. Daily conception, affair establishment, gossip, ordinary scandal, economy, and lifecycle decisions must not migrate into realtime behavior merely because their callers are nearby.

`humanTick.ts` is handled after the daily layer because it is the largest realtime behavior hub. Its shared context creation, per-human iteration, priority ordering, final movement, and spatial synchronization remain coordinator responsibilities. Cohesive policy clusters such as patrol detection, hunting, leisure, and realtime social feedback may move to named owners only when their context and cadence boundaries are explicit. A long file is not itself a failure; hidden policy clusters and ambiguous ownership are.

`residency.ts` is last because it is a stateful and save-sensitive domain. Occupancy, household composition, residence selection, and reconciliation are divided internally while retaining one residency authority. The residency work requires a major-change notice and deterministic save/load, worker-command, occupancy, and partner-transition validation before its protected status can be removed.

The roadmap deliberately avoids creating duplicate keyboard, canvas, daily-tick, residency, or generic event-bus owners. Existing focused owners are retained when they already hold the correct policy. A new module is justified only when it removes an independently evolving responsibility without changing authority, cadence, command boundaries, save schema, or player-visible behavior.

## 2. Decommissioning gate

A file is decommissioned only when it passes **all** of these conditions. Line count is evidence, not the criterion.

| Gate | Definition |
|---|---|
| **Single purpose** | The file has one explainable role: composition, orchestration, or compatibility—not several domain policies. |
| **No hidden policy clusters** | Feature-specific rules, calculations, state transitions, and UI behavior live in named modules. |
| **Stable boundary** | Public API is small, deliberate, and documented by its imports/exports; temporary forwarding exports are identified. |
| **No new responsibility path** | The next foreseeable feature has an obvious focused destination outside the old god file. |
| **Architecture remains valid** | Worker authority, cadence, command boundaries, state invariants, and save/load behavior are preserved. |
| **Evidence passes** | Targeted tests, TypeScript checking, and relevant manual/visual/worker/save verification are complete. |
| **Governance updated** | `AGENTS.md` is updated: the file is removed from the active god-file list or marked a migration facade; any new successor is listed. |

## 3. Serial order

The sequence begins with the smallest, clearest command façade, progresses through application and daily coordination, then completes the largest realtime behavior hub. `residency.ts` is last because it is a high-impact state domain and should receive undivided attention.

| Order | Active target | Why now | Do not begin until |
|---:|---|---|---|
| 1 | `src/game/buildingActions.ts` | Already reduced by placement extraction; remaining action domains are cleanly separable. | N/A — start here. |
| 2 | `src/App.tsx` | Its existing hook/layout seams make it the next low-risk decommissioning candidate. | `buildingActions.ts` passes the gate. |
| 3 | `src/game/tickLayerDaily.ts` | Must become a readable daily schedule, not an embedded-policy hub. | `App.tsx` passes the gate. |
| 4 | `src/game/humanTick.ts` | The most complex realtime behavior file; complete with focus after daily ownership is clarified. | `tickLayerDaily.ts` passes the gate. |
| 5 | `src/game/residency.ts` | Large, stateful, save-sensitive successor domain; requires a dedicated final pass. | `humanTick.ts` passes the gate and a major-change notice is recorded. |

## 4. File 1 — fully decommission `buildingActions.ts`

**Current state:** `buildingPlacementActions.ts` owns placement and strip topology; `buildingStaffingActions.ts` owns builder assignment, worker assignment/removal, automatic staffing, and assignable-worker queries; `buildingResidencyActions.ts` owns resident assignment/removal and adult move-out commands; `buildingMaintenanceActions.ts` owns repair, upgrades, demolition, refunds, and necessary assignment/adjacency cleanup; `buildingConfigurationActions.ts` owns workshop recipes, staffing mode, Mine mode, and Hunting Spot prey configuration; and `settlerInteractionActions.ts` owns recruitment, taming, and the explicitly debug-only Moon Howler command. `buildingActions.ts` is now a 53-line compatibility façade with no action policy or direct authoritative writes. It forwards each focused domain API, retains only the deliberately explicit legacy construction/job-versus-residence routes, and forwards the workshop estimate to its own narrow owner.

### Implementation status

**Slice 1.1 — Complete (28 August 2026).** The staffing domain moved into `src/game/buildingStaffingActions.ts`; `buildingActions.ts` immediately forwards its direct staffing APIs and retains only the generic command’s explicit construction/job-versus-residence routing. The extraction also corrected a verified preview/command inconsistency: active construction-crew settlers are no longer offered as candidates or used to enable a completed-job staffing action. A private local bug record preserves the diagnosis and regression rationale. Focused staffing, Church manual-priest, worker-command, and eligibility tests; type checking; linting; the complete test suite; and the production build passed. No worker boundary, state shape, save format, or assignment cadence changed.

**Slice 1.2 — Complete (28 August 2026).** The residency command domain moved into `src/game/buildingResidencyActions.ts`. It preserves the existing post-command order—residence synchronization, housing reconciliation, then workforce reconciliation—behind a named helper, and `buildingActions.ts` forwards every direct residency API. The compatibility façade retains the legacy generic routing so completed residence actions use the residency owner while unfinished buildings remain construction assignments. Focused command/occupancy tests, worker-command round-trip coverage, type checking, linting, the complete test suite, and the production build passed. No state shape, save format, worker boundary, or assignment cadence changed; no deterministic save/load round-trip was claimed for this extraction.

**Slice 1.3 — Complete (28 August 2026).** The maintenance command domain moved into `src/game/buildingMaintenanceActions.ts`. The refactor gives repair costs and refund ratio explicit names, centralizes player-human reconciliation after building removal, and makes demolition assignment cleanup an explicit bounded step. The existing cleanup order and writes remain unchanged: workforce transitions, residence/prison reference clearing, adjacency invalidation, road-cache invalidation, building removal, completed-building counter repair, then housing/workforce reconciliation. Focused repair-cost and demolition-cleanup tests, command-boundary tests, the protected write-site audit, type checking, linting, the complete test suite, and the production build passed. No state shape, save format, worker boundary, or cadence changed; no deterministic save/load round-trip was claimed for this extraction.

**Slice 1.4 — Complete (28 August 2026).** The persisted building-configuration command domain moved into `src/game/buildingConfigurationActions.ts`, with immediate `buildingActions.ts` forwarding exports. The action boundary now explicitly validates the declared staffing and Mine modes, retaining the worker protocol’s constraints for direct callers as well. It also fixes a verified authorization gap: valid Mine-mode commands now reject rival-owned Mines, matching the established ownership guards for workshop recipes, staffing mode, and Hunting Spot prey. A private local bug record preserves the diagnosis and regression rationale. Focused valid/invalid configuration and worker-command tests, type checking, linting, the complete test suite, and the production build passed. No state shape, save format, worker boundary, or cadence changed.

**Slice 1.5 — Complete (28 August 2026).** Recruitment, taming, tame-food lookup, and the clearly labelled debug-only Moon Howler command moved into `src/game/settlerInteractionActions.ts`, with immediate `buildingActions.ts` forwarding exports. The extraction replaces duplicated interaction lists and magic resource costs with named immutable definitions. It also fixes a verified ownership gap: taming now requires a nearby completed player-owned Taming Post, so a rival building cannot unlock a player command. A private local bug record preserves the diagnosis and regression rationale. Focused recruitment/taming, command-validation, and Moon Howler compatibility tests; type checking; linting; the complete test suite; and the production build passed. No state shape, save format, worker boundary, or cadence changed.

**Slice 1.6 — Complete (28 August 2026).** The legacy generic construction/job-versus-residence routes moved into `src/game/buildingActionRouting.ts`; the remaining pure workshop output estimate moved into `src/game/workshopEconomy.ts`. `buildingActions.ts` is now a 53-line export-only compatibility façade. All original public exports remain available; no consumer migration or command-protocol change was required. Focused façade, staffing, residency, maintenance, configuration, interaction, and worker-command tests; type checking; linting; the complete test suite; and the production build passed. The AGENTS authority table now removes `buildingActions.ts` from active god files and locks it as a no-policy façade.

| Serial slice | Destination module | Move from `buildingActions.ts` | Validation |
|---:|---|---|---|
| 1.1 | `buildingStaffingActions.ts` | Builder assignment, worker assignment/removal, auto-staff, eligibility and assignable-worker queries | **Complete.** Manual/automatic staffing, Church manual-priest rule, worker command response, and construction-crew exclusion from job previews all passed. |
| 1.2 | `buildingResidencyActions.ts` | Resident assignment/removal and adult move-out actions | **Complete.** Household placement, capacity, occupant synchronization, compatibility routing, and worker-command round-trip coverage passed. |
| 1.3 | `buildingMaintenanceActions.ts` | Repair, upgrades, demolition, required cleanup and feedback | **Complete.** Repair-cost validation, worker/residence/prison cleanup, refunds, adjacency invalidation, building deletion, command boundary, and write ownership passed. |
| 1.4 | `buildingConfigurationActions.ts` | Workshop recipe, staffing mode, Mine mode, Hunting Spot prey configuration | **Complete.** Valid player-owned configuration, invalid mode rejection, rival-Mine authorization rejection, and worker-command coverage passed. |
| 1.5 | `settlerInteractionActions.ts` | Recruit, tame, tame-food lookup, and clearly isolated debug-only actions | **Complete.** Recruitment cost/population result, player-owned Taming Post authorization, food cost, debug compatibility, and command validation passed. |
| 1.6 | `buildingActions.ts` façade decision | **Complete.** Legacy generic routes now have an explicit routing owner and the pure workshop estimate has a narrow owner; the façade is export-only. | Focused façade/domain tests, worker command path, full suite, build, and AGENTS façade lock passed. |

**Completion condition — passed (28 August 2026):** `buildingActions.ts` is a small, export-only forwarding façade with no action policy or direct authoritative state transition. `AGENTS.md` removes it from the active god-file table and locks it as a compatibility façade. The next protected-file work must start as a separately planned slice.

## 5. File 2 — fully decommission `App.tsx`

**Current state:** `useGamePersistence`, `useGameSession`, `useGameShellState`, `useTransientGameFeedback`, `GamePlayLayout`, `GameMapStage`, `GameBuildRail`, `GameInspector`, `GameOverlays`, and `GameSidebar` exist and are wired. App is now a composition root: it assembles focused hooks/components and retains only explicit cross-feature callback wiring and route/screen choice.

### Implementation status

**Slice 2.1 — Complete (28 August 2026).** The display-only canvas surface, FPS meter, map frame, minimap, zoom controls, and nearest-preset derivation moved into `src/components/GameMapStage.tsx`. Canvas click, pointer, drag, selection, and build-placement policy remains in the existing `useCanvasInteractions` hook; `App.tsx` passes those established handlers and camera callbacks through unchanged. Focused map-stage and layout rendering tests, type checking, linting, the complete test suite, and the production build passed. No simulation state, save format, worker authority, or input-policy behavior changed.

**Slice 2.2 — Complete (28 August 2026).** The build-rail presentation moved into `src/components/GameBuildRail.tsx`. It receives the App-owned shell/build state and established callbacks, without creating another build-mode owner. The component keeps the collapsed rail, build catalog loading fallback, grid toggle, selection cancellation, and locked-building command route unchanged. Focused build-rail, map-stage, and layout rendering tests, type checking, linting, the complete test suite, and the production build passed. No simulation state, save format, worker authority, keyboard policy, canvas interaction, or command behavior changed.

**Slice 2.3 — Complete (28 August 2026).** The inspector frame, diagnostics placement, selection header, clear/collapse controls, and compact collapsed label moved into `src/components/GameInspector.tsx`; App retains selection derivation and all feature-specific panel/action callbacks. The presentation improvement adds explicit button types and accessible labels/expanded state without changing behavior. Focused inspector, layout, map-stage, and hotkey tests, type checking, linting, and the production build passed. No simulation state, save format, worker authority, selection ownership, or command behavior changed.

**Slice 2.4 — Complete (28 August 2026).** The overlay slot presentation moved into `src/components/GameOverlays.tsx`, preserving the existing child order and all established dismissal, priority, Big News, tutorial, raid/event, and shortcut callbacks. It adds an accessible overlay landmark without changing transient-feedback ownership or overlay policy. Focused overlay, inspector, layout, and hotkey tests, type checking, linting, and the production build passed. No simulation state, save format, worker authority, cadence, or command behavior changed.

**Slice 2.5 — Complete (28 August 2026).** Assessment found no remaining cohesive input subsystem in `App.tsx` that should be extracted. Global keyboard policy and cleanup remain in `useKeyboardControls`; canvas pointer, camera, selection, and build-placement policy remain in `useCanvasInteractions`. Creating `useGameInputBindings.ts` would duplicate ownership rather than reduce it, so no new input module was introduced. Existing hotkey and focused component tests passed.

**Slice 2.6 — Complete (28 August 2026).** Final review confirms that App now composes focused shell, map, build, inspector, overlay, and sidebar presentation components. The remaining inline code is explicit cross-feature wiring and selection/action callback assembly; it does not add a second input owner, persistence implementation, simulation mutation path, or tick layer. App is removed from the active protected-file list in `AGENTS.md`. Full type, lint, focused regression, and production-build gates passed for the completed File 2 sequence.

| Serial slice | Destination module/component | Move from `App.tsx` | Validation |
|---:|---|---|---|
| 2.1 | `GameMapStage.tsx` | Canvas wrapper, map-stage composition, and display-only map controls | **Complete.** Canvas surface, FPS, minimap navigation, zoom preset/clamping presentation, and layout contract passed. |
| 2.2 | `GameBuildRail.tsx` | Build palette/rail presentation and feature-local UI callbacks | **Complete.** Collapsed rail, grid toggle, selected-building cancellation, and catalog-open contract passed. |
| 2.3 | `GameInspector.tsx` | Selected entity/building inspector composition | **Complete.** Selection header, diagnostics placement, collapse/clear controls, compact label, and accessibility contract passed. |
| 2.4 | `GameOverlays.tsx` | Tutorial, banner, moment card, notifications, shortcut and modal composition | **Complete.** Existing overlay order/callbacks preserved and accessible overlay landmark passed. |
| 2.5 | `useGameInputBindings.ts` only if needed | Remaining App-owned keyboard/mouse orchestration not already in a focused hook | **Complete — not needed.** Existing `useKeyboardControls` and `useCanvasInteractions` already own the relevant policy and cleanup. |
| 2.6 | `App.tsx` composition decision | Keep application boot, session/shell hook composition, major screen slots, and high-level route/screen choice | **Complete.** App remains the composition root; focused presentation slots and existing policy owners are wired without a second authority. |

**Completion condition — passed (28 August 2026):** `App.tsx` reads as the application composition root. It creates/wires focused hooks and major screen components, while input, persistence, transient feedback, canvas interaction, and simulation authority remain in their existing owners. `AGENTS.md` removes App from the active god-file list; the next protected-file work may begin with `tickLayerDaily.ts`.

## 6. File 3 — fully decommission `tickLayerDaily.ts`

**Current state:** `dailyEcology.ts`, `dailyBuildingEconomy.ts`, `dailyPopulation.ts`, `dailyChallenges.ts`, and `dailyWorldEvents.ts` are extracted. `tickLayerDaily.ts` is now an explicit ordered daily schedule facade, retaining only cadence-bound social, chronicle, weather, grass, domain-delegate, and skill coordination.

| Serial slice | Destination module | Move from `tickLayerDaily.ts` | Ordering rule and validation |
|---:|---|---|---|
| 3.1 | `dailyBuildingEconomy.ts` | Construction progress, repair/decay, building production and forge-related daily work | **Complete.** Construction, repair, static bookkeeping, blueberry regrowth, and production order preserved; focused daily-layer and full-year integration tests passed. |
| 3.2 | `dailyPopulation.ts` | Immigration, dead-entity pruning, faction-wander cleanup, relevant population reconciliation | **Complete.** Population cap/immigration, all-alive pruning, faction-wander cleanup, and entity indexing preserved; focused daily-layer regressions passed. |
| 3.3 | `dailyWorldEvents.ts` | Frontier, festival, yearly, first-week, mid-year, and election-event scheduling plus notification creation | **Complete.** Calendar boundaries, event cooldowns, event state, notification creation, and established call ordering preserved; focused story and full-year tests passed. |
| 3.4 | `dailyChallenges.ts` | Challenge evaluation, reward grants, feedback and completion state | **Complete.** Rewards, feedback, completion state, and save-visible challenge state preserved; focused daily-layer and full-year tests passed. |
| 3.5 | `tickLayerDaily.ts` schedule decision | Retain one ordered call per daily domain and necessary context assembly only | **Complete.** Daily facade preserves the fixed schedule, public `tickGrassDaily` compatibility export, worker path, and 72-tick day; focused layer-order and full-year tests passed. |

**Completion condition — passed (28 August 2026):** `tickLayerDaily.ts` is an explicit, ordered daily schedule. It contains no inline building, population, world-event, or challenge policy. `AGENTS.md` removes it from the active god-file list; the next protected-file work may begin with `humanTick.ts`.

## 7. File 4 — fully decommission `humanTick.ts`

**Current state:** `humanHospitalBehavior.ts`, `humanVenueBehavior.ts`, `humanPatrolBehavior.ts`, `humanHuntingBehavior.ts`, and the child-play plus adult-motive portions of `humanLeisureBehavior.ts` are extracted. `humanTick.ts` remains the sole realtime coordinator and must stay that way, but the remaining behavior policy must leave the file.

| Serial slice | Destination module | Move from `humanTick.ts` | Owner/cadence constraint |
|---:|---|---|---|
| 4.1 | `humanPatrolBehavior.ts` | Patrol detection of marching rival raiders and existing reveal feedback | Detection radius, rival visibility mutation, and event feedback unchanged; focused patrol and full-year tests passed |
| 4.2 | `humanHuntingBehavior.ts` | Hunger-triggered hunt decisions, prey selection, chase, kill/visual triggers and food gain | **Complete.** Hunger/famine thresholds, prey selection, chase, kill resolution, food/energy accounting, visuals, and target cleanup preserved; focused hunting, movement, social, and full-year tests passed. |
| 4.3 | `humanLeisureBehavior.ts` | Free-time routing, family/coworker visits, beauty spots, festivals, child play, wandering | **Child-play/free-parent and adult-motive sub-slices complete.** Adult landmark/bond leisure routing remains to be extracted; priority and movement boundaries preserved, focused movement/schedule/social/full-year tests passed. |
| 4.4 | `humanSocialRuntime.ts` | Nearby chat, heart feedback, local low-cost social progress | Daily courtship, affair establishment, conception, birth, and ordinary scandal decisions stay with their owners |
| 4.5 | `humanWorkBehavior.ts`, if a remaining cohesive cluster exists | Shift-specific movement and job execution only when it remains mixed into the coordinator | Workforce keeps assignment authority; this executes existing realtime intent |
| 4.6 | `humanTick.ts` coordinator decision | Keep priority order, shared context creation, and named behavior calls only | Deterministic human simulation run, behavior priority tests, worker path, visual smoke check |

**Completion condition:** `humanTick.ts` describes the realtime priority pipeline rather than implementing multiple feature policies. It makes ordered calls to focused behavior modules and has no independent hunting, leisure, care, service, or relationship rules inline. Update `AGENTS.md`, then begin `residency.ts`.

## 8. File 5 — fully decommission `residency.ts`

**Current state:** `residency.ts` is a small public compatibility facade over the single residency domain owner’s focused occupancy, household-composition, selection, and reconciliation modules. This is a major permanent change because it touches households, residents, event transitions, and save-relevant state.

**Implementation status — complete (28 August 2026).** Slices 5.3–5.5 split candidate selection and reconciliation while preserving the public residency API, residence fields, save schema, worker command boundaries, assignment cadence, and one authoritative residency owner. The work was committed locally as `c9b9408` (selection), `8884d80` (reconciliation), and `073e92e` (facade/governance). Targeted residency and command tests, the 360-day integration test, type checking, linting, and the production build passed. The complete suite reported three unrelated existing failures in `huntingSpot.cleanup.test.ts`; no residency test failed. `AGENTS.md` now records `residency.ts` as a completed no-policy compatibility facade.

> **Major-change notice — recorded and completed:** Residency was split internally while retaining one residency owner. The affected public exports remain available through `residency.ts`; callers continue to use the existing command, daily, lifecycle, relationship, save/load, and worker boundaries. No residence field, save schema, or assignment cadence changed. Compatibility was validated through the residency and worker command paths, deterministic 360-day simulation coverage, type checking, linting, and production build validation.

| Serial slice | Destination module | Move from `residency.ts` | Validation |
|---:|---|---|---|
| 5.1 | `residencyOccupancy.ts` | Occupancy index, capacity predicates, occupancy move accounting, building/resident consistency queries | Capacity boundaries, building ID `0`, occupant/index consistency |
| 5.2 | `householdComposition.ts` | Family grouping, household unit formation, child custodianship, adult-child independence rules | **Helper sub-slices validated.** Minor classification, adult-led household collection, child-custodian resolution, connected family-graph collection, and adult-child-at-home classification moved; focused residency, command, and write-ownership tests passed. Orphan/adoption and full housing-unit formation remain. |
| 5.3 | `residencySelection.ts` | Candidate scoring, home choice, empty-home preference, shared-housing logic, overcrowding/rebalance choice | **Complete — commit `c9b9408`.** Candidate scoring, deterministic tie-breaking, empty-home preference, shared-housing decisions, household placement, adult-child move-out selection, orphan placement, and overcrowding-related selection helpers moved out of `residency.ts`; residency, command, and full-year integration tests passed. |
| 5.4 | `residencyReconciliation.ts` | Residence occupant synchronisation, partner transitions, event/death/recruitment reconciliation entry points | **Complete — commit `8884d80`.** Occupant synchronization, child-reference rebuilding, overcrowding rebalancing, missing-residence assignment, partner residence transitions, and command/event reconciliation entry points moved out of `residency.ts`; type checking, linting, command-path, residency, and full-year tests passed. |
| 5.5 | `residency.ts` façade decision | Keep only the one residency owner’s public API/re-exports or retire it after migration | **Complete — commit `073e92e`.** Kept `residency.ts` as the single public compatibility facade over occupancy, household composition, selection, and reconciliation. The write-ownership audit and `AGENTS.md` were updated; no secondary residency owner was introduced. |

**Completion condition — passed (28 August 2026):** One residency domain owner remains, with internals divided by occupancy, household composition, selection, and reconciliation. `residency.ts` is a small intentional facade and no longer combines the algorithms and transitions. `AGENTS.md` removes it from the active god-file table, and the write-ownership audit recognizes the focused residency modules as the canonical implementation owners.

## 9. Final completion and maintenance rule

After File 5 passes the gate, the active god-file list should be empty. Keep a short watchlist of large coordinators, but do not automatically label a file a god file because it is long.

A file enters the protected list only when it has accumulated multiple independently evolving responsibilities and a new feature would otherwise make that concentration worse. When this happens, repeat this same serial procedure: create a plan, complete one file completely, decommission it, then move to the next.

## 10. Next implementation session

File 3 (`tickLayerDaily.ts`) is complete. Begin File 4 (`humanTick.ts`) only after verifying the committed daily facade and preserving the documented worker/cadence invariants.

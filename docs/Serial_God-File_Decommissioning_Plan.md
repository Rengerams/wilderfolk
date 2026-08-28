# Serial God-File Decommissioning Plan

**Status:** Active serial roadmap. File 1, slice 1.1 staffing actions is complete; do not begin the next file until all `buildingActions.ts` slices pass the decommissioning gate.
**Scope:** Fully decommission exactly one protected god file before beginning the next.
**Current starting point:** `dayCycle.ts` is already decommissioned as a god file and remains a controlled compatibility facade. The active protected files are `buildingActions.ts`, `App.tsx`, `tickLayerDaily.ts`, `humanTick.ts`, and the successor module `residency.ts`.

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

**Current state:** `buildingPlacementActions.ts` owns placement and strip topology, and `buildingStaffingActions.ts` owns builder assignment, worker assignment/removal, automatic staffing, and assignable-worker queries. `buildingActions.ts` retains compatibility exports plus the deliberately separate legacy residence-routing branches; it must not receive another feature.

### Implementation status

**Slice 1.1 — Complete (28 August 2026).** The staffing domain moved into `src/game/buildingStaffingActions.ts`; `buildingActions.ts` immediately forwards its direct staffing APIs and retains only the generic command’s explicit construction/job-versus-residence routing. The extraction also corrected a verified preview/command inconsistency: active construction-crew settlers are no longer offered as candidates or used to enable a completed-job staffing action. A private local bug record preserves the diagnosis and regression rationale. Focused staffing, Church manual-priest, worker-command, and eligibility tests; type checking; linting; the complete test suite; and the production build passed. No worker boundary, state shape, save format, or assignment cadence changed.

| Serial slice | Destination module | Move from `buildingActions.ts` | Validation |
|---:|---|---|---|
| 1.1 | `buildingStaffingActions.ts` | Builder assignment, worker assignment/removal, auto-staff, eligibility and assignable-worker queries | **Complete.** Manual/automatic staffing, Church manual-priest rule, worker command response, and construction-crew exclusion from job previews all passed. |
| 1.2 | `buildingResidencyActions.ts` | Resident assignment/removal and adult move-out actions | Household placement, capacity, occupant sync, save/load |
| 1.3 | `buildingMaintenanceActions.ts` | Repair, upgrades, demolition, required cleanup and feedback | Costs, construction/repair status, building deletion, stale selection cleanup |
| 1.4 | `buildingConfigurationActions.ts` | Workshop recipe, staffing mode, mine mode, hunting-prey configuration | Command validation, invalid state rejection, persisted configuration |
| 1.5 | `settlerInteractionActions.ts` | Recruit, tame, and clearly isolated debug-only actions | Recruitment/taming outcomes; developer-only action isolation |
| 1.6 | `buildingActions.ts` facade decision | Retain only deliberate compatibility re-exports or remove it after imports migrate | Import graph, command dispatch, complete building-action smoke path |

**Completion condition:** `buildingActions.ts` is a small forwarding facade or is retired. It contains no action policy or independent state transition. Update `AGENTS.md` to remove it from the active god-file table, then begin `App.tsx`.

## 5. File 2 — fully decommission `App.tsx`

**Current state:** `useGamePersistence`, `useGameSession`, `useGameShellState`, `useTransientGameFeedback`, and `GamePlayLayout` exist and are wired. The remaining task is to move the inline display, interaction, and composition clusters out of the application root.

| Serial slice | Destination module/component | Move from `App.tsx` | Validation |
|---:|---|---|---|
| 2.1 | `GameMapStage.tsx` or a focused map-stage component | Canvas wrapper, map-stage composition, and display-only map controls | Canvas sizing, selection, camera, draw loop, loading/fallback state |
| 2.2 | `GameBuildRail.tsx` | Build palette/rail presentation and feature-local UI callbacks | Building selection, disabled states, keyboard/UI behavior |
| 2.3 | `GameInspector.tsx` | Selected entity/building inspector composition | Selection changes, panel collapse, building/entity action callbacks |
| 2.4 | `GameOverlays.tsx` | Tutorial, banner, moment card, notifications, shortcut and modal composition | Dismissal state, z-order, no duplicate overlays, first-session flow |
| 2.5 | `useGameInputBindings.ts` only if needed | Remaining App-owned keyboard/mouse orchestration not already in a focused hook | Keyboard shortcuts, pointer/camera interactions, cleanup on unmount |
| 2.6 | `App.tsx` composition decision | Keep only application boot, session/shell hook composition, and high-level route/screen choice | New/load game, save, worker lifecycle, intro/map setup/gameplay transitions |

**Completion condition:** `App.tsx` reads as a small composition root. It creates/wires focused hooks and major screen components, but does not contain a second UI subsystem, input policy, persistence implementation, or large JSX regions. Update `AGENTS.md`, then begin `tickLayerDaily.ts`.

## 6. File 3 — fully decommission `tickLayerDaily.ts`

**Current state:** `dailyEcology.ts` is already extracted. The daily layer must continue to reveal the order of daily work, but its internal mechanics need named homes.

| Serial slice | Destination module | Move from `tickLayerDaily.ts` | Ordering rule and validation |
|---:|---|---|---|
| 3.1 | `dailyBuildingEconomy.ts` | Construction progress, repair/decay, building production and forge-related daily work | Preserve resource/production order; compare deterministic day snapshots |
| 3.2 | `dailyPopulation.ts` | Immigration, dead-entity pruning, faction-wander cleanup, relevant population reconciliation | Preserve all-alive array hand-off and entity-index consistency |
| 3.3 | `dailyWorldEvents.ts` | Yearly, first-week, and mid-year event scheduling plus notification creation | Calendar boundary, event cooldown, same notification/event results |
| 3.4 | `dailyChallenges.ts` | Challenge evaluation, reward grants, feedback and completion state | Rewards only once; resources, feedback, and saves stay consistent |
| 3.5 | `tickLayerDaily.ts` schedule decision | Retain one ordered call per daily domain and necessary context assembly only | Full in-game day, worker delta path, no extra tick layer, type checks |

**Completion condition:** `tickLayerDaily.ts` is an explicit, ordered daily schedule. It does not contain feature calculations, player reward policy, world-event policy, or population policy inline. Update `AGENTS.md`, then begin `humanTick.ts`.

## 7. File 4 — fully decommission `humanTick.ts`

**Current state:** `humanHospitalBehavior.ts` and `humanVenueBehavior.ts` are extracted. `humanTick.ts` remains the sole realtime coordinator and must stay that way, but the remaining behavior policy must leave the file.

| Serial slice | Destination module | Move from `humanTick.ts` | Owner/cadence constraint |
|---:|---|---|---|
| 4.1 | `humanHuntingBehavior.ts` | Hunger-triggered hunt decisions, prey selection, chase, kill/visual triggers and food gain | Retain existing hunger/work/danger priorities; no daily relationship logic |
| 4.2 | `humanLeisureBehavior.ts` | Free-time routing, family/coworker visits, beauty spots, festivals, child play, wandering | Must not override danger, hunger, sleep, shift, or active relationship behavior |
| 4.3 | `humanSocialRuntime.ts` | Nearby chat, heart feedback, local low-cost social progress | Daily courtship, affair establishment, conception, birth, and ordinary scandal decisions stay with their owners |
| 4.4 | `humanWorkBehavior.ts`, if a remaining cohesive cluster exists | Shift-specific movement and job execution only when it remains mixed into the coordinator | Workforce keeps assignment authority; this executes existing realtime intent |
| 4.5 | `humanTick.ts` coordinator decision | Keep priority order, shared context creation, and named behavior calls only | Deterministic human simulation run, behavior priority tests, worker path, visual smoke check |

**Completion condition:** `humanTick.ts` describes the realtime priority pipeline rather than implementing multiple feature policies. It makes ordered calls to focused behavior modules and has no independent hunting, leisure, care, service, or relationship rules inline. Update `AGENTS.md`, then begin `residency.ts`.

## 8. File 5 — fully decommission `residency.ts`

**Current state:** `residency.ts` successfully replaced much of the former `dayCycle.ts` hub but is now large enough to be a protected successor. This is a major permanent change because it touches households, residents, event transitions, and save-relevant state.

> **Major-change notice before starting:** State that residency will be split internally while retaining one residency owner; list affected exports/callers; confirm no residence field, save schema, or assignment cadence will change; define the compatibility and deterministic-save validation plan.

| Serial slice | Destination module | Move from `residency.ts` | Validation |
|---:|---|---|---|
| 5.1 | `residencyOccupancy.ts` | Occupancy index, capacity predicates, occupancy move accounting, building/resident consistency queries | Capacity boundaries, building ID `0`, occupant/index consistency |
| 5.2 | `householdComposition.ts` | Family grouping, household unit formation, child custodianship, adult-child independence rules | Couples, minors, death/custody, adult move-out cases |
| 5.3 | `residencySelection.ts` | Candidate scoring, home choice, empty-home preference, shared-housing logic, overcrowding/rebalance choice | Deterministic household placement across representative worlds |
| 5.4 | `residencyReconciliation.ts` | Residence occupant synchronisation, partner transitions, event/death/recruitment reconciliation entry points | Worker command path, entity removal, partner move, load/import round trip |
| 5.5 | `residency.ts` façade decision | Keep only the one residency owner’s public API/re-exports or retire it after migration | All residency tests, save/load scenarios, no secondary owner introduced |

**Completion condition:** one residency domain owner remains, but its internals are divided by occupancy, household composition, selection, and reconciliation. `residency.ts` is a small, intentional facade; it no longer combines every algorithm and transition itself. Update `AGENTS.md` to remove it from the active god-file list.

## 9. Final completion and maintenance rule

After File 5 passes the gate, the active god-file list should be empty. Keep a short watchlist of large coordinators, but do not automatically label a file a god file because it is long.

A file enters the protected list only when it has accumulated multiple independently evolving responsibilities and a new feature would otherwise make that concentration worse. When this happens, repeat this same serial procedure: create a plan, complete one file completely, decommission it, then move to the next.

## 10. First implementation session

Start and remain on **File 1: `buildingActions.ts`**.

1. Baseline existing building placement/staffing/residency/repair/configuration/taming behavior.
2. Create `buildingStaffingActions.ts` and move only staffing and builder-action code.
3. Keep `buildingActions.ts` as a narrow compatibility export/call site for this first slice.
4. Run type checks, focused staffing checks, and a game smoke test.
5. Continue with `buildingResidencyActions.ts` in the next session only after the committed staffing slice passes.
6. Do not start an `App.tsx`, daily, human, or residency refactor until `buildingActions.ts` has passed the full decommissioning gate.

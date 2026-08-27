# God-File Refactoring Roadmap

**Status:** In progress — Phase 1.2 complete; Phase 1.3 active  
**Scope:** Break down the five god files named in [`AGENTS.md`](../../AGENTS.md) without changing intentional gameplay, worker authority, cadence, or save behavior.  
**Approach:** One small, behavior-preserving extraction at a time. This is a growth plan, not a feature freeze.

## 1. Outcome

The project should gain clear homes for new features while the existing god files become thin, readable coordinators or compatibility façades. At the end of the roadmap, a contributor should be able to add a new UI behavior, human behavior, daily system, building action, or calendar/residency rule without first extending `App.tsx`, `humanTick.ts`, `tickLayerDaily.ts`, `buildingActions.ts`, or `dayCycle.ts`.

> **The target is not a specific line count. The target is one understandable responsibility per module, with intentional coordination left visible in the existing entry point.**

## 2. Working rules

| Rule | Application |
|---|---|
| **Preserve behavior first** | An extraction moves existing logic before it redesigns that logic. Pair a redesign with a later, separately described feature change. |
| **One seam per change** | Each pull request or working session extracts one cohesive responsibility, validates it, and stops. Do not combine unrelated clean-up. |
| **Keep the public entry point stable** | The old god file may retain a small forwarding export while callers migrate. Remove the forwarding export only after all consumers are updated. |
| **No new mutation paths** | `gameTick()`, `applyWorkerCommand()`, and named transitions remain the simulation boundaries. UI modules do not become simulation owners. |
| **No extra tick layers** | Human realtime behavior remains in the `tickHumans()` pipeline and daily scheduling remains in `tickLayerDaily()`. New modules are called by existing layers. |
| **DRY for stable concepts; deliberate WET for independence** | Share a rule only when it is truly common and stable. Keep feature-specific logic local when a generic abstraction would add flags, callbacks, or false coupling. See [`References.md`](../../References.md). |
| **Do not make a utility dump** | Every extracted module needs a domain name, clear owner, and narrow API. Avoid `utils.ts`, `helpers.ts`, generic managers, and broad event buses. |

## 3. Standard extraction loop

Use the following loop for every slice in this roadmap.

1. **Choose one responsibility.** Write down the current owner, cadence, authoritative state writes, imports/exports to move, and player-visible result.
2. **Characterise current behavior.** Run the narrow existing test suite where one exists. For UI or runtime behavior, capture a deterministic reproduction or a concise manual test path before moving code.
3. **Create the destination module.** Use a narrow name such as `humanHospitalBehavior.ts`, not a generic name such as `humanHelpers.ts`.
4. **Move code without redesign.** Copy/move the smallest cohesive functions, inputs, constants, and private helpers. Avoid changing probability, order, data shape, or error handling in the same change.
5. **Replace the old block with one obvious call.** The god file should become more readable after every extraction.
6. **Preserve the existing public API where useful.** Use a re-export or a thin forwarding function during migration rather than forcing a large import rewrite.
7. **Verify equivalence.** Run the baseline test, focused regression test, type/lint check, and the relevant player-visible or save/worker check.
8. **Record the result.** Update a plan checklist. Write a private bug record if the extraction exposes a bug or behavior discrepancy; do not manufacture one when none exists.

## 4. Baseline and sequencing

Before the first extraction, make a lightweight baseline. It must be quick enough that it is repeated, rather than so exhaustive that refactoring stalls.

| Baseline item | Evidence |
|---|---|
| Current clean working scope | Confirm which unrelated user changes are already present; do not overwrite them. |
| Type and lint health | Run the project’s normal static validation command. |
| Core simulation smoke path | Start or load a game; confirm time advances, a command resolves, and no worker errors appear. |
| Save path | Save and reload one representative local world when changing state, commands, clock, residency, or persistence. |
| Target behavior | A focused test, deterministic seed, or written manual reproduction for the responsibility being moved. |

The proposed order starts with bounded seams that reduce pressure immediately, then reaches higher-coupling simulation hubs.

| Order | File | First extraction | Change class |
|---:|---|---|---|
| 0 | Project baseline | Characterise current behavior | Routine |
| 1 | `App.tsx` | Persistence and autosave hook | Routine |
| 2 | `humanTick.ts` | Hospital and venue behavior | Routine simulation refactor |
| 3 | `tickLayerDaily.ts` | Ecosystem metrics and daily ecology helper | Routine simulation refactor |
| 4 | `buildingActions.ts` | Placement and strip-topology actions | Routine command refactor |
| 5 | `dayCycle.ts` | Clock constants and pure calendar helpers with compatibility re-exports | Routine, low-risk start |
| 6 | `dayCycle.ts` | Schedule, residency, and lifecycle-domain migrations | **Major permanent change—give an impact notice before beginning broad migration** |
| 7 | Remaining protected files | Continue only where the next feature creates pressure | Decide per slice |

## 5. Phase 1 — break down `App.tsx`

`App.tsx` should be the first focus because it is the largest application-level god file and can be split without moving simulation ownership. It should remain the visible composition root: it chooses which major screen/layout is active and wires top-level props together.

### 5.1 Target module map

| New module | Responsibility | Explicitly does not own |
|---|---|---|
| `src/hooks/useGamePersistence.ts` | Manual save, autosave, unload save, save toast state, chronicle export | Simulation state or worker authority |
| `src/hooks/useGameSession.ts` | Game-loop lifecycle, authoritative world subscription, command dispatch, cleanup | Persistent UI layout and panel state |
| `src/hooks/useGameShellState.ts` | Tabs, sub-tabs, intro/setup/tutorial state, collapsible panel preferences | Simulation mutations |
| `src/hooks/useTransientGameFeedback.ts` | News/notification expiry, dismissal sets, temporary moment-card state | Permanent world changes other than existing authorised cleanup callbacks |
| `src/components/GamePlayLayout.tsx` | Header, canvas wrapper, tabs, panels, overlays, and modal composition | Game-loop lifecycle and state policy |

### 5.2 First extraction: `useGamePersistence`

Move `persistCurrentGame`, autosave setup, unload-save cleanup, the save toast, and chronicle-export handling into `useGamePersistence`. Keep the interface narrow: accept the game-loop/world/view accessors and return save state plus explicit callbacks.

**Acceptance checks:** manual save works; autosave fires only while a session is active; save failure still produces the existing visible error; optional chronicle export remains optional; loading the save restores the game; no render path directly mutates worker-authoritative state.

### 5.3 Follow-up slices

After persistence, extract transient feedback, then shell state, then layout. Do not move every callback into one mega-hook. A hook is an improvement only if its ownership is clearer than the block that left `App.tsx`.

## 6. Phase 2 — break down `humanTick.ts`

`humanTick.ts` remains the sole realtime human coordinator. New behavior modules must run through `tickHumans()` in the current priority order; they must not create an extra tick loop, unowned state writer, or duplicate relationship/lifecycle owner.

### 6.1 Target module map

| New module | Responsibility | Owner/cadence constraint |
|---|---|---|
| `src/game/humanHospitalBehavior.ts` | Doctor activity, hospital routing, patient treatment, medical check-ups | Runs only through realtime human ticking; hospital domain remains authoritative for care rules |
| `src/game/humanVenueBehavior.ts` | Innkeeper, official, hotelier service behavior and visitor interaction | Runs only through existing human tick and venue schedule |
| `src/game/humanHuntingBehavior.ts` | Hunger-triggered hunting, target choice, chase, hunt resolution/visual triggers | Preserve hunger, prey, schedule, and free-roam priority rules |
| `src/game/humanLeisureBehavior.ts` | Free time, beauty visits, family/coworker interaction, festivals, children’s play, wandering | Must not override danger, hunger, sleep, work, or active relationship priorities |
| `src/game/humanSocialRuntime.ts` | Nearby chat, low-cost heart feedback, runtime social progress | Courtship, affair establishment, conception, births, and daily scandal policy keep their current owners |

### 6.2 First extraction: hospital and venue behavior

Start by extracting the bounded hospital and venue service blocks. They are already recognisable runtime responsibilities with a limited player-visible verification path. Pass the existing `state`, human, spatial/context values, and required helper callbacks explicitly rather than importing a broad coordinator object.

**Acceptance checks:** doctors still treat eligible patients; patients still walk to and receive care at valid hospitals; work-hour and free-time gates remain unchanged; venue staff still begin service at configured times; no service action occurs twice in a tick; static checking and focused simulation/runtime verification pass.

### 6.3 Later extractions

Extract hunting before leisure if a hunting feature is next on the roadmap. Otherwise extract leisure because it is the largest non-authoritative behavior cluster. Move social runtime last, after explicitly listing which calls belong to the relationship owner versus the realtime presentation/feedback path.

## 7. Phase 3 — slim `tickLayerDaily.ts` without hiding the schedule

`tickLayerDaily.ts` is allowed to import many domains because it declares daily order. Its final form should be a readable sequence of named calls, not a second home for ecology, construction, world-event, migration, challenge, and economy policy.

### 7.1 Target module map

| New module | Responsibility | Ordering retained in `tickLayerDaily()` |
|---|---|---|
| `src/game/dailyEcology.ts` | Grass updates, pollution, ecosystem health, biodiversity, wildlife-floor replenishment, valley ecology call boundary | Refresh derived ecology before the valley stage consumes it |
| `src/game/dailyBuildingEconomy.ts` | Building progress, repairs/decay, daily production, forge hand-off | Run after daily bookkeeping and before dependent reward/display actions |
| `src/game/dailyPopulation.ts` | Immigration, dead-entity pruning, faction-wander pruning | Maintain the all-alive hand-off before later consumers use it |
| `src/game/dailyWorldEvents.ts` | Yearly, first-week, and mid-year event scheduling | Preserve current calendar gates and notification ordering |
| `src/game/dailyChallenges.ts` | Completion test, rewards, feedback, and challenge state update | Remain late in the daily sequence after dependent world state is current |

### 7.2 First extraction: `dailyEcology`

Move `tickEcosystemMetrics()` and its local constants into `dailyEcology.ts`. Keep the one call from `tickLayerDaily()` at the exact existing location. Do not retune pollution, biodiversity, or wildlife formulas during this extraction.

**Acceptance checks:** the same initial world produces the same daily ecology values over a short deterministic run; the valley stage still sees fresh metrics; grass and wildlife behavior retain their existing cadence; performance does not regress materially.

## 8. Phase 4 — split `buildingActions.ts` into command domains

`buildingActions.ts` should remain only as a temporary compatibility facade, if needed. Each extracted action module should operate through the existing command boundary and delegate rules to the existing domain owner rather than duplicating workforce, residency, or world-generation logic.

### 8.1 Target module map

| New module | Responsibility |
|---|---|
| `src/game/buildingPlacementActions.ts` | Placement validation, terrain interaction, construction start, strip preview, strip chain placement |
| `src/game/buildingStaffingActions.ts` | Builder assignment, worker assignment/removal, auto-staff, assignable-worker queries |
| `src/game/buildingResidencyActions.ts` | Assign/remove resident and adult move-out actions |
| `src/game/buildingMaintenanceActions.ts` | Repair, upgrades, demolition and required authoritative cleanup |
| `src/game/buildingConfigurationActions.ts` | Recipes, staffing modes, mine modes, hunting-prey selection |
| `src/game/settlerInteractionActions.ts` | Recruit, tame, and explicitly separated developer/debug-only actions |

### 8.2 First extraction: placement and strips

Extract `canPlaceBuilding`, failure reasons, building start, strip preview, and strip-chain placement together. They share placement and topology concerns and can be exercised with a small set of maps.

**Acceptance checks:** all placement failures remain truthful; footprint/rotation behavior is unchanged; trees and topology update as before; strip preview matches final placement; command/worker results remain authoritative; save/load retains created buildings.

## 9. Phase 5 — decompose `dayCycle.ts` carefully

`dayCycle.ts` has high fan-in and should not be bulk-refactored. Begin with pure, dependency-light code and compatibility re-exports. Broad schedule/residency/lifecycle migration is a **major permanent change** because many modules currently depend on this file.

### 9.1 Target module map

| New module | Responsibility | Migration risk |
|---|---|---|
| `src/game/simulationClock.ts` | Tick/day/hour conversion, calendar boundary detection, clock constants | Low |
| `src/game/humanSchedule.ts` | Shift windows, evening/home preference, weekends, work/festival predicates | Medium |
| `src/game/residency.ts` | Household composition, capacity, placement, residence sync, partner residence | High |
| `src/game/humanLifecycleCleanup.ts` | Death cleanup, survivor links, grief, custody/adoption | High |
| `src/game/personDailyDecisions.ts` | Per-person/day deterministic rolls and small policy helpers | Medium |

### 9.2 First extraction: `simulationClock`

Move only pure constants and time-conversion predicates. Re-export them from `dayCycle.ts` immediately so no consumer must change in the same change. Add targeted tests that demonstrate identical conversion at boundary ticks.

### 9.3 Major migration checkpoint

Before beginning schedule, residency, or lifecycle-cleanup migration, send the developer a concise impact notice containing:

- the precise modules and exports to move;
- expected affected consumers and migration strategy;
- state, worker, command, and save/load impact;
- compatibility/re-export window;
- test and deterministic-save verification plan; and
- rollback approach.

This is not a request to avoid the refactor. It makes the high-impact change visible before it becomes permanent.

## 10. Choosing later work

Do not split a large file merely because it is large. Prioritise a later extraction when a new feature would otherwise add a new responsibility to a protected god file, when unrelated changes repeatedly collide there, when a bug cannot be isolated, or when a responsible module already has a clear name and boundary.

| File | Later trigger | Likely safe seam |
|---|---|---|
| `groupEvents.ts` | Next independent visitor/diplomacy/request feature | `visitorGroups.ts`, `villageRequests.ts`, or `rivalDiplomacy.ts`; no generic event bus |
| `humanRelationships.ts` | New relationship behavior creates pressure | Internal affair, youth-love, conception, or courtship modules under one relationship owner |
| `frontierCombat.ts` | Incoming/outgoing raid work begins colliding | Pure combat preview/loot maths separated from raid event resolution |
| `moonHowler.ts` | New curse/Howler mechanics need independent work | Read-only state/config queries separated from lifecycle transitions |
| `gameTypes.ts` | A schema change needs ownership clarity | Domain type files with a stable `gameTypes.ts` re-export facade; treat state schema/save changes as major |

## 11. Definition of done for each god file

A god file is no longer protected only when it has a single clear coordination role and a contributor can add the next foreseeable feature without putting a new independent responsibility in it.

| File | Done condition |
|---|---|
| `App.tsx` | It composes game session, shell state, feedback, and layout; persistence/input/session mechanisms live in focused hooks/components. |
| `humanTick.ts` | It defines human priority and invokes focused behavior modules; it does not implement multiple feature policies inline. |
| `dayCycle.ts` | It is a small compatibility facade or is retired; clock, schedule, residency, and lifecycle cleanup have named homes. |
| `tickLayerDaily.ts` | It reads as an explicit, ordered daily schedule of named domain calls; embedded policy is minimal. |
| `buildingActions.ts` | It is a thin command facade or is retired; placement, staffing, residency, maintenance, configuration, and interactions have focused homes. |

## 12. Session checklist

Use this checklist before declaring an extraction complete.

- [ ] The moved code is one cohesive responsibility, not a grab bag.
- [ ] The destination module has an owner- and behavior-specific name.
- [ ] No new tick layer, generic manager, or unowned mutation path was added.
- [ ] The old god file became simpler and remains understandable.
- [ ] Existing public imports remain stable or have a deliberate migration path.
- [ ] Targeted checks and relevant manual/worker/save validation passed.
- [ ] Any unexpected behavior found during migration is recorded privately.
- [ ] The change has not altered an unrelated feature, probability, cadence, or state schema.
- [ ] If the scope is major, the developer received an impact notice before permanence.

## 13. Recommended next action

Continue with **Phase 1.3: extract `useTransientGameFeedback` from `src/App.tsx`**. Move only notification/news expiry, dismissal-set coordination, and temporary moment-card state. Keep permanent world changes within their existing authorised callbacks and do not combine this slice with a visual redesign, a save-format change, worker changes, or broad import cleanup.

## 14. Validation
After decomposing god files write tests to validate the work you did. after that create a ##15 with what you did and status and what you completed what needs to be done.


## 15. Implementation status

**Last updated:** 28 August 2026  
**Current slice:** Phase 1.3 — extract `useTransientGameFeedback` from `src/App.tsx`.

| Item | Status | What was completed | Validation evidence | What remains |
|---|---|---|---|---|
| Baseline | Complete | Preserved the pre-existing working scope and confirmed static health before the extraction. | `npm run test:types` and `npm run lint` completed successfully before changes. | None for this slice. |
| `App.tsx` persistence extraction | Complete | Added `src/hooks/useGamePersistence.ts`. The hook now owns manual-save orchestration, the 30-second autosave interval, unmount save, temporary save-toast state, and optional chronicle export. `App.tsx` remains the composition root and retains the existing save/load UI callbacks. | Type checking, linting, focused persistence tests, the complete test suite, and a production build completed successfully. | The next planned `App.tsx` slice is transient feedback, followed by shell state and layout. |
| Worker-authoritative save path | Complete | The extracted persistence boundary obtains the authoritative snapshot through `GameLoop.exportAuthoritativeWorld()` whenever a game loop is active; it does not introduce an alternate simulation mutation path. | Focused test verifies that the authoritative world, rather than a stale display copy, is sent to persistence; the existing save-migration round-trip test also passed in the full suite. | Retain this invariant in all later persistence and session work. |
| Save feedback and failure behavior | Complete | Preserved the success toast, floating save feedback, silent autosave path, and explicit save-error feedback. | Four focused `persistGame` tests cover manual-save feedback, absent-view rejection, silent autosave-style persistence, and error reporting. | Perform the normal browser smoke path before a release or if a later UI change touches the save controls. |
| `App.tsx` transient-feedback extraction | In progress | The next bounded slice will move temporary notification/news expiry, dismissal-set coordination, and moment-card state into `src/hooks/useTransientGameFeedback.ts`. | Baseline and focused behavior characterisation pending. | Complete the separate implementation and validation loop before progressing to shell state. |

The first god-file extraction is **complete with automated verification**. It moved one cohesive responsibility only, added no tick layer, changed no save schema or simulation cadence, and left unrelated application behavior untouched. No discrepancy requiring a private bug record was discovered.

### Next action

Complete the active bounded `App.tsx` seam: `useTransientGameFeedback`. Retain `App.tsx` as the composition root, keep persistent world changes on their existing authorised paths, and use the same baseline, focused-test, static-check, and production-build loop.

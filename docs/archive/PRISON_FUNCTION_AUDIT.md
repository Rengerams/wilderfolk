# Wilderfolk Prison Function Audit

**Scope:** Prison-related functions and adjacent player-facing behavior in the connected local Wilderfolk project.

**Authority followed:** `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md` and `docs/AGENTS.md`. This is a read-only audit; no simulation behavior, public version, changelog, commit, push, or release was changed.

**Method:** WET, DRY, YAGNI, separation of concerns (SoC), and the game-design five-component filter: clarity, motivation, response, satisfaction, and fit.

## Executive assessment

The prison feature is **functionally coherent and well regression-tested**, but its ownership boundary is too distributed. Scandal code creates sentences, workforce code reconciles prison occupants and releases prisoners, Moon Howler code temporarily removes and restores prison state, realtime human ticking enforces confinement, invariant code validates only part of the contract, and UI components independently reconstruct prison counts. The result currently works, but future changes are likely to create a second mutation path or subtly desynchronize entity fields and building occupants.

The strongest recommendation is not a broad rewrite. It is a **small prison transition module or narrowly scoped transition API** owned by the existing simulation architecture. That API should centralize sentence entry, sentence release, temporary supernatural detachment, and prison occupancy calculations while keeping scandal, workforce, Moon Howler, realtime movement, and UI as callers or readers. Do not create a new tick layer.

Focused validation is currently green: **6 test files passed and 59 tests passed** across security-role split, simulation invariants, workforce transitions, command validation, and Moon Howler restoration tests.

## Prison surface inventory

| Area | Functions or behavior | Current role | Assessment |
|---|---|---|---|
| `dayCycle.ts` | `isImprisoned` | Shared predicate over `prisonBuildingId` | Good minimal helper; suitable as a read-only predicate. |
| `humanRelationships.ts` | `countGuardsAtPrison` | Counts staffed, non-imprisoned `PrisonGuard`s | Correct rule, but coupled to scandal and duplicated conceptually with other prison counters. |
| `humanRelationships.ts` | `hasStaffedPrison` | Determines whether any completed prison has a valid guard | Correct gate for formal scandal outcomes. |
| `humanRelationships.ts` | `pickAffairExposureReason` | Chooses caught versus rumor | Player-facing rule is hidden in relationship code; acceptable owner, but prison dependency is implicit. |
| `humanRelationships.ts` | `tryExposeCaughtAffair`, `tryExposeCaughtAffairForPair` | Determines whether an affair is caught | Correctly routes pair resolution through one lead; prison is an indirect consequence. |
| `humanRelationships.ts` | `exposeAffair` | Applies scandal feedback and calls arrest | Main coupling point between relationships and imprisonment. |
| `humanRelationships.ts` | `countPrisonersAt` | Counts prisoners by prison ID | Duplicates the same concept as Moon Howler's counter. |
| `humanRelationships.ts` | `isMarriedScandalOffender` | Sentence eligibility gate | Clear, local rule; should remain relationship-owned. |
| `humanRelationships.ts` | `arrestForScandal` | Creates a sentence, clears work/home, assigns prison, repositions, logs, notifies | Biggest SoC hotspot: relationship code directly mutates workforce, housing, spatial position, prison occupancy, and presentation feedback. |
| `humanRelationships.ts` | `isEligibleToCourt` | Excludes imprisoned settlers from courtship | Correct downstream read; no mutation. |
| `workforce.ts` | `syncJobBuildingOccupants` | Rebuilds prison occupants from guards plus prisoners | Necessary reconciliation, but mixed occupancy semantics make this function special-case the prison. |
| `workforce.ts` | staffing eligibility helpers and `assignWorkerInPlace` callers | Prevent imprisoned entities from staffing work | Correct workforce read/gate. |
| `workforce.ts` | `releasePrisoners` | Releases due prisoners and triggers reassignment | Sole release implementation, but it also performs residence/work assignment side effects. |
| `moonHowler.ts` | `detachEntityFromBuildingOccupants` | Removes an entity from a building list | Good generic helper, although it has no reverse-field clearing contract. |
| `moonHowler.ts` | `countPrisonersAtBuilding` | Counts prisoners during restoration | Duplicate of `countPrisonersAt`. |
| `moonHowler.ts` | `prisonPrisonerCap` | Recomputes prison prisoner capacity | Duplicate of the arrest formula. |
| `moonHowler.ts` | `forceMoonHowlerOutside` | Detaches prison/work/home membership during transformation | Correctly preserves sentence snapshots, but directly mutates prison state outside the prison/scandal owner. |
| `moonHowler.ts` | `transformToWerewolfForm` | Snapshots and clears prison fields | Required lifecycle behavior; high coupling is justified but should use a shared transition contract. |
| `moonHowler.ts` | `revertToHumanForm` | Restores active sentence before job/home, with capacity checks | Strong edge-case handling; contains duplicated prison policy and direct occupant mutation. |
| `moonHowler.ts` | `cureMoonHowler`, `finalizeMoonHowlerDeath` | Calls restoration or converts form for death/save correctness | Correct lifecycle integration. |
| `humanTick.ts` | prisoner branch | Zeroes velocity, pulls prisoner toward prison, skips social/reproductive AI, short-circuits | Clear realtime behavior; should remain movement-owned and read-only with respect to sentence state. |
| `simulationInvariants.ts` | prison occupancy and reverse-reference checks | Validates prison references and occupant membership | Essential, but incomplete for metadata and guard identity. |
| `SelectedBuildingPanel.tsx` | prisoner filtering and manual-guard hint | Displays prison contents and staffing instruction | Clear basic discoverability; independently scans entities. |
| `SelectedEntityPanel.tsx` | imprisoned status and remaining sentence | Displays prison label and remaining days | Good direct feedback; sentence rounding and missing-prison behavior deserve tests. |
| `PopulationPanel.tsx`, `uiSimSummary.ts` | imprisoned counts and lock/jailed labels | Aggregated presentation | Read-only and appropriate, but repeated counting can drift from authoritative selectors. |
| `gameTypes.ts`, `buildings.ts`, `saveLoad.ts`, `entityFactory.ts` | prison fields, `PrisonGuard`, capacity, migration/defaults | Data and persistence contract | Correctly establishes prison as first-class state; generic `maxOccupants` carries mixed semantics. |

## Findings by principle

### 1. Separation of concerns: high-priority boundary problem

`arrestForScandal` is the clearest architectural violation. It is invoked by relationship logic, but it also removes workplace membership, resets occupation and job, removes residence membership, clears residence assignment, assigns a prison, chooses a sentence duration, repositions the entity, appends to prison occupants, and emits log, notification, and floating-text feedback. The function therefore owns relationship consequence, workforce transition, housing transition, prison transition, spatial placement, and presentation effects at once.

This is not an immediate gameplay bug, because the focused tests pass and the authority document explicitly permits named transitions called from the simulation boundary. It is a **change-risk defect**. A future arrest source, non-scandal crime, admin command, or event could copy only part of this sequence and violate worker, occupant, or save invariants.

**Recommendation:** keep `humanRelationships.ts` responsible for deciding that a scandal should request a sentence; move the state mutation into one named prison transition that returns a structured result such as `rejected`, `already-serving`, or `imprisoned`. The transition may call existing workforce/housing cleanup helpers, but only one function should write the prison fields and prison occupant list. Keep log/notification/floating-text emission at the caller or behind a clearly named feedback adapter, not mixed into the state transition.

### 2. Separation of concerns: Moon Howler has a second prison mutation path

`transformToWerewolfForm` clears prison fields, `forceMoonHowlerOutside` conditionally clears live prison fields, and `revertToHumanForm` restores prison state and appends to prison occupants. This complexity is justified by the declared rare-event contract, but the functions directly implement prison policy that is also implemented in `arrestForScandal`, `releasePrisoners`, and `syncJobBuildingOccupants`.

**Recommendation:** add a narrow shared prison snapshot/restore contract rather than a new tick layer. Moon Howler should own the temporary-form snapshot, while a prison transition helper should validate whether the saved sentence is still active, whether the prison exists, and whether capacity is available. This preserves Moon Howler ownership of transformation and prison ownership of prison validity.

### 3. DRY: prisoner count is duplicated

`humanRelationships.ts` defines `countPrisonersAt`, while `moonHowler.ts` defines `countPrisonersAtBuilding`. Both filter living human entities by `prisonBuildingId`; one supports excluding the entity being restored and the other does not.

**Recommendation:** replace both with one read-only selector, for example `countPrisonersAtBuilding(humans, prisonId, excludeId?)`. Do not over-generalize it into a universal occupancy function: guards and prisoners have intentionally different semantics.

### 4. DRY: prisoner-capacity formula is duplicated

The arrest path uses `Math.max(1, BUILDING_CONFIGS[BuildingType.Prison].maxOccupants - 1)`, while Moon Howler uses the same expression in `prisonPrisonerCap`. This is a real DRY violation because a capacity rule change can update one path and not the other.

**Recommendation:** define one named selector, such as `getPrisonerCapacity(building)`, that documents the current rule: total prison slots minus the guard slot, with the current minimum behavior. Use the building argument rather than a global config lookup so upgrades or future prison variants cannot silently use the wrong capacity.

### 5. DRY: UI and simulation each reconstruct prison membership

The building panel filters `state.entities` by `prisonBuildingId`; summary panels count imprisoned entities independently; workforce rebuilds building occupants from entity fields. These are not all harmful duplication because UI must derive presentation data, but they create multiple representations of the same concept.

**Recommendation:** provide read-only selectors for `getPrisonersAtBuilding`, `countImprisonedHumans`, and `getRemainingSentenceDays`. UI should use selectors, while authoritative simulation reconciliation may use a separate mutation function. Do not make UI read `building.occupants` alone, because prison occupants intentionally contain both guards and prisoners.

### 6. WET: avoid premature abstraction while the rule is still evolving

The current code has several explicit prison-specific branches, especially in `syncJobBuildingOccupants`, `revertToHumanForm`, and the invariant checker. Those branches are not automatically bad WET. They expose a real domain distinction: a prison building has two occupant roles, a manually assigned guard, and sentenced non-staff prisoners.

The correct response is not to force prison into the generic workplace abstraction. That would hide the rule and likely make the code less truthful. Use WET deliberately at the domain boundary until a shared function has a stable contract. Extract only the proven duplicated selectors and capacity rule listed above.

### 7. YAGNI: avoid speculative crime and sentence frameworks

The entity field `prisonSentenceCrime` currently has only the `'scandal'` value. A generalized crime registry, sentence-type hierarchy, court system, prison schedule, guard AI, or prison economy would be speculative unless the developer explicitly approves those mechanics.

The present Moon Howler snapshot is not YAGNI: it exists to preserve a declared rare-event behavior and save correctness. Likewise, `prisonSentenceCrime` is useful as a small diagnostic and future-compatible discriminator, but it should not be expanded into a framework without a second real sentence type.

### 8. Generic capacity field carries mixed semantics

`BUILDING_CONFIGS[BuildingType.Prison].maxOccupants` represents total slots, while the gameplay rule reserves one slot for a guard and derives the prisoner capacity by subtraction. This is understandable at the current two-slot design, but the meaning differs from ordinary workplaces.

**Recommendation:** do not change the save schema or public gameplay contract in this audit. Introduce a named selector that makes the mixed semantics explicit. Only add separate `guardCapacity` and `prisonerCapacity` fields if a real feature requires independent capacities and migration/testing is approved.

## Prisoner work-hours / workhouse implementation

The current code does **not implement a prisoner workhouse or prison labor system**. A prisoner is held in the prison as a sentenced human, not assigned to a prison work job. The prison’s only work role is the manually assigned `PrisonGuard`; prisoners remain ordinary settlers in identity but are excluded from ordinary work and social simulation while imprisoned.

| Stage | Implementation | Owner/cadence | Prisoner result |
|---|---|---|---|
| Prison staffing | `BuildingType.Prison` maps to `JobType.PrisonGuard`; prison is in `MANUAL_STAFF_BUILDINGS`. | `workforce.ts`, player command/assignment | A player-assigned guard can staff the prison. Prisoners are not staff and do not consume a worker slot as a job. |
| Sentence entry | `arrestForScandal` removes the offender from the workplace and residence, resets `homeBuildingId`, `occupation`, and `job` to settler, then sets prison fields and appends the entity to prison occupants. | `humanRelationships.ts`, scandal cadence | The prisoner has no workplace assignment and no work job. |
| Occupancy reconciliation | `syncJobBuildingOccupants` treats prison occupants as the union of valid prison guards (`homeBuildingId`) and prisoners (`prisonBuildingId`). | `workforce.ts`, assignment reconciliation | Prisoners remain visible in the prison’s occupants list without being treated as workers. |
| Realtime movement | The `isPrisoner` branch runs before normal workplace and schedule processing. It zeroes velocity, pulls the entity back toward the prison, synchronizes spatial grids, and exits the human tick. | `humanTick.ts`, realtime | Prisoners cannot leave the prison, perform ordinary movement, or continue into work/social logic. |
| Work-hour accounting | `recordScheduleWorkTick(entity)` is called only later, after the prisoner early exit, when `onJobShift` is true. | `humanTick.ts` / `scheduleFatigue.ts`, realtime | Prisoners accrue **zero work ticks** and therefore do not build schedule fatigue or contribute to staffed production. |
| Daily fatigue | The fatigue system resolves prior-day `scheduleWorkedTicksToday` and applies its production multiplier to staffed production. | `scheduleFatigue.ts`, `tickLayerDaily.ts` | Because prisoners do not record work ticks, imprisonment does not itself create work-hour fatigue. Existing prior fatigue may be resolved by the daily system according to the normal entity rules unless explicitly cleared elsewhere. |
| Release | `releasePrisoners` clears prison fields, removes the entity from prison occupants, emits release feedback, then invokes missing-residence and missing-worker assignment passes. | `workforce.ts`, realtime release check | The former prisoner becomes eligible for reassignment; release does not restore the exact former workplace or residence. |

### What this means for a prisoner

A prisoner is effectively in a **non-working, non-social, movement-constrained state**. The implementation deliberately prevents conception, affair encounters, affair gossip, ambient dialogue, normal job movement, work-hour accounting, and ordinary AI processing during the prison branch. It does not currently provide prison labor, rehabilitation, crafting, maintenance, or any other workhouse output.

This is consistent with the project’s existing lore and design record, which distinguishes prison occupants from ordinary workers and keeps Prison Guards separate from Barracks Soldiers. Adding prison labor would therefore be a new gameplay feature, not a refactor. It would require an explicit design decision about whether labor is compulsory, what resources it produces, whether prisoners gain fatigue or skills, how guard staffing affects labor, and whether labor changes sentence or social outcomes.

### Audit result for workhouse behavior

| Principle | Result | Finding |
|---|---|---|
| **WET** | Appropriate | The prison-specific early exit is explicit rather than hidden behind a generic worker abstraction. This makes the current “prisoners do not work” rule easy to verify. |
| **DRY** | Good with one caveat | Work-hour exclusion is achieved structurally by the early return, but UI and diagnostics should use shared selectors if a workhouse feature is later added. |
| **YAGNI** | Strong | No speculative prison-labor system exists. Do not add one as part of cleanup or architecture refactoring. |
| **SoC** | Mostly strong at runtime | `humanTick.ts` owns realtime confinement and `workforce.ts` owns staffing/release. The main concern remains that sentence creation and Moon Howler restoration directly mutate several domains. |
| **Game design** | Clear but shallow | The player can understand that prisoners are unavailable workers, but the UI does not explicitly state “prisoners do not work” or show the productivity opportunity cost. |

**Recommendation:** document the current behavior in the prison UI or building description: “Prisoners do not work while serving a sentence; assign a Prison Guard to hold them.” Do not introduce a workhouse unless the developer explicitly wants prison labor. If approved later, implement it as a separate vertical slice with a named owner, cadence, resource/output contract, fatigue policy, abuse tests, and player feedback; do not overload `JobType.PrisonGuard` or ordinary auto-staffing.

## Prison Guard shifts and continuous coverage

The hotel is the correct architectural reference for **shift rotation**, but the prison cannot simply reuse the hotel rule unchanged. Hotel service has a bounded opening window and can tolerate periods without service. Prison custody is a 24-hour obligation. The existing `venueSchedule.ts` provides per-worker coverage windows through `isVenueWorkerServiceHour` and calculates an auto-staffing target from service duration, while `humanTick.ts` applies those windows to Hoteliers. Prison Guards currently bypass that model and are treated as ordinary daytime workers through the standard work schedule.

### Current behavior

| Concern | Hotel | Prison today | Consequence |
|---|---|---|---|
| Schedule source | `hotelSchedule` | Global `workSchedule` | Prison duty ends when ordinary work hours end. |
| Per-worker shift | `isVenueWorkerServiceHour` divides the hotel window among workers | None | Multiple Prison Guards cannot be assigned distinct custody shifts. |
| Coverage meaning | Service availability | Guard job exists, but custody remains effective independently | The prisoner remains confined even when no guard is on duty. |
| Work-hour accounting | Hotelier records work during hotel service shift | Prison Guard records ordinary work during standard work hours | Guard duty and custody are incorrectly coupled to generic work hours. |
| Staffing target | Hotel auto-staffing can scale with service duration | Prison is manual-only and has no coverage target | The player receives no indication of how many guards are needed for continuous custody. |

### Recommended implementation: prison coverage roster

Implement a **prison-specific coverage schedule**, modeled on the hotel’s shift segmentation but owned by a security/prison domain rather than by ordinary work scheduling.

1. Define prison coverage as a full-day interval. The representation must support midnight and the end of day; do not force it through the current venue validator, which rejects wraparound and treats `endHour` as less than 24.
2. Divide the coverage interval among assigned `PrisonGuard`s using the same conceptual worker-index approach as `isVenueWorkerServiceHour`. The first guard covers the first segment, the second guard the next segment, and so on. If the project later allows custom rosters, store the segment or rotation explicitly rather than relying on occupant-array ordering.
3. Separate **coverage duty** from **ordinary production work**. A guard on prison duty should provide custody coverage for the assigned segment, but should not automatically be counted as performing 24 hours of ordinary work or receive unbounded fatigue. If duty is intended to affect fatigue, add a bounded security-duty workload in the existing fatigue owner rather than calling ordinary work accounting once per round-the-clock tick.
4. Add a coverage selector such as `getPrisonCoverageStatus(state, prison, hour)` returning `covered`, `understaffed`, or `uncovered`. Arrest eligibility, release, and prisoner confinement should use this explicit result according to the approved game rule; they should not infer coverage merely from a non-empty prison occupant list.
5. Keep the prison manual-staffed. The player should choose guards, while the UI calculates and explains coverage. Do not silently auto-fill Prison Guards through ordinary workforce balancing.

### Capacity issue exposed by shifts

The current prison configuration uses `maxOccupants: 2` and derives prisoner capacity by subtracting one guard slot. A hotel-style full-day roster may require more than one guard to cover 24 hours without making one person work continuously. Therefore, **building occupants cannot remain the sole storage for both custody staff and prisoners** if the design requires multiple guards.

There are two safe options, requiring an explicit design decision:

| Option | Description | Trade-off |
|---|---|---|
| A. Separate duty roster | Keep the prison’s physical occupant capacity for prisoners and store assigned guards in a separate manual staffing/roster structure. | Clean semantics, but introduces a new state field and save/migration work. |
| B. Expand prison staffing capacity | Let prison capacity distinguish `guardSlots` from `prisonerSlots`, allowing multiple guard occupants plus prisoners. | More visible and simple, but changes building capacity semantics and likely requires migration/tests. |

Do not solve this by allowing guards to occupy prisoner slots invisibly or by making one guard appear to cover all hours without feedback. That would preserve the current code shape at the cost of simulation truth.

### Failure behavior that must be chosen

The project should explicitly define what happens when a shift has no guard. The most coherent minimal rule is: **no active coverage means the prison is unsecured; new formal arrests are blocked, and existing prisoners receive a visible risk state or escape resolution according to the approved design.** If the developer wants guaranteed containment regardless of coverage, then the prison should provide an always-on institutional custody rule and guard shifts should be presented as supervision/quality rather than the condition that makes confinement possible. The current silent combination—no guard but perfect containment—is the least logical option.

### Shift-system audit

| Principle | Result | Finding |
|---|---|---|
| **WET** | Prefer explicit prison coverage code | Reuse the hotel’s shift concept, not its exact venue type or validation rules. Prison custody has different hours and failure semantics. |
| **DRY** | Reuse shift segmentation carefully | Share a generic interval-segmentation helper only if its contract supports full-day and midnight-crossing schedules; do not duplicate the hotel algorithm verbatim. |
| **YAGNI** | Keep the first slice small | Add coverage status and manual guard rotation first. Defer guard morale, prison labor, patrol routes, and complex rosters. |
| **SoC** | Required separation | Prison coverage belongs to the prison/security owner; ordinary work hours belong to `workSchedule`; fatigue remains with `scheduleFatigue`; UI reads coverage rather than deriving it. |
| **Game design** | High-value correction | Continuous custody becomes understandable, and understaffing becomes a meaningful player decision instead of an invisible contradiction. |

## Barracks and Soldier shift/coverage audit

The Barracks currently has a different model from both the hotel and the prison proposal. A Barracks is a **manual military assignment**: the player assigns a `JobType.Soldier`, and the assigned Soldier contributes to the village’s defense strength continuously. However, the Soldier’s movement and ordinary work-hour behavior still follow the global work schedule. This means the current system mixes **24-hour military readiness** with **daytime worker scheduling** without exposing that distinction to the player.

| Concern | Current implementation | Player-facing meaning | Audit result |
|---|---|---|---|
| Assignment | Barracks maps to `JobType.Soldier`; Barracks is manual-staffed. | The player chooses who becomes a Soldier. | Good ownership and clear separation from `PrisonGuard`. |
| Defense strength | `getBarracksGuardCount` counts every living, non-imprisoned Soldier assigned to a completed Barracks. `getBarracksGuardBonus` applies the bonus without checking the current hour. | A staffed Barracks strengthens the village at all times. | Logically defensible as standing readiness, but the UI should say “standing militia” rather than imply daytime labor. |
| Ordinary work schedule | In `humanTick.ts`, Soldier work movement is included in `onDayJobShift` only when `goWorkTime` is active. | Soldiers behave like workers during ordinary work hours. | Potentially confusing if defense is permanent but visible Soldier activity is not. |
| Shift rotation | There is no Soldier-specific or Barracks-specific shift selector. | Multiple Soldiers are not divided into day/night duties. | Missing if the design requires realistic continuous patrol coverage. |
| Prison relationship | `PrisonGuard` is a separate job and is excluded from Barracks Soldier counts. | A prison guard does not automatically increase militia strength. | Correct SoC and role separation. |
| Moon Howler protection | Nearby Barracks Soldiers can provide an extra protection roll through `isBarracksGuard`; the guard check is role/location based, not a hotel-style service shift. | Military protection can function as a readiness effect rather than a work-hour task. | Consistent with standing defense, but should be named and surfaced as such. |
| Fatigue | Soldiers can accrue ordinary schedule work ticks during their work shift; defense bonus itself does not appear to consume shift hours. | The player receives no explicit trade-off between readiness and fatigue. | Needs a deliberate policy before adding shifts or fatigue changes. |

### Relationship to the prison shift system

The Barracks is a useful reference for **continuous readiness**, but not a direct template for prison custody. The Barracks grants a persistent defense bonus from assigned Soldiers even outside the ordinary work window. The prison currently grants persistent confinement even when no Prison Guard is on duty. The inconsistency is therefore not that the Barracks is necessarily wrong; it is that the code has no explicit distinction between:

> **Standing readiness:** an assigned Soldier or institutional guard remains part of a persistent security system.

> **Active shift duty:** a person is currently performing a scheduled task, patrol, service window, or custody shift.

A coherent security model should use the same vocabulary for both buildings while preserving their different gameplay outcomes:

| Security system | Standing effect | Active shift effect | Failure when no active shift |
|---|---|---|---|
| Barracks | Assigned Soldiers contribute to militia readiness. | Optional patrol/activity/response behavior. | Readiness may remain, but patrol response can be reduced if the design requires it. |
| Prison | Assigned Prison Guards provide institutional custody capacity. | One guard covers a defined custody segment, modeled after hotel worker segmentation. | Prison becomes visibly understaffed or unsecured according to the approved rule. |
| Hotel | No standing security effect. | Hoteliers cover service hours divided across workers. | Hotel service is unavailable outside the schedule or without staff. |

### Recommended Barracks implementation if shifts are desired

Do not make Barracks Soldiers ordinary hotel workers. If the developer wants day/night military coverage, add a small **security-duty roster** shared conceptually by Barracks and Prison, with explicit building-specific outcomes. A first slice should contain only the following:

1. A manual assignment list remains the source of truth for Soldiers and Prison Guards.
2. A pure selector calculates the current active shift or coverage status from assigned guards and the current hour.
3. Barracks may retain its current all-day militia bonus as standing readiness, while active shift status controls patrols, rapid response, or Moon Howler protection only if that distinction is approved.
4. Prison custody uses active coverage for the chosen arrest/escape rule; it must not silently inherit the Barracks’ permanent defense semantics.
5. Work-hour fatigue remains separate from security duty. If security duty contributes fatigue, record a bounded duty load through the existing fatigue owner rather than treating 24-hour coverage as 24 ordinary work hours.

### Barracks-specific principle audit

| Principle | Result | Finding |
|---|---|---|
| **WET** | Appropriate role-specific code | `getBarracksGuardCount`, `getBarracksGuardBonus`, and `isBarracksGuard` expose real military rules; do not flatten them into prison or hotel staffing. |
| **DRY** | Moderate | Soldier/prison-guard identity checks and building-role checks are intentionally different, but a shared read-only security-assignment selector could remove repeated “alive, player, assigned, not imprisoned” predicates if a roster feature is added. |
| **YAGNI** | Strong today | The existing persistent militia bonus is sufficient unless patrol shifts are a deliberate feature. Do not add shift rotation merely to make Barracks resemble a hotel. |
| **SoC** | Mostly good | Defense math belongs in `defenseStructures.ts`, assignment in `workforce.ts`, movement/work hours in `humanTick.ts`, and Moon Howler protection in `moonHowler.ts`. The missing piece is a named security-coverage contract between them. |
| **Game design** | Needs clarification | Players can see staffed counts and militia bonuses, but they cannot tell whether a Soldier is defending, working, patrolling, or resting at a given hour. |

## Game-design audit

| Component | Current result | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| Clarity | Moderate to good | Building UI says the guard is manual-only; entity UI shows prison and remaining sentence; population UI marks jailed people. | The player is not clearly told why a scandal became a formal arrest, what the guard enables beyond empty cells, or why a full prison rejects a sentence. | Add concise feedback for rejected/full/no-staff cases and expose current guard/prisoner counts in the prison panel. |
| Motivation | Moderate | Imprisonment changes work, residence, courtship, and village scandal state. | The prison is mostly a consequence rather than a player-directed strategic system. | Preserve the current minimal scope; make consequences legible rather than adding new prison mechanics. |
| Response | Weak-to-moderate | Player assigns a guard manually; arrest and release happen automatically; prisoner movement is constrained. | There is no direct player action to inspect or influence a sentence, and release feedback is passive. | Add clear event-log/notification links or selection behavior before considering sentence controls. |
| Satisfaction | Moderate | Arrest and release produce event log, notification, floating text, and flash feedback. | The prison outcome may feel arbitrary because chance and capacity rules are not surfaced. | Show a short reason in feedback: caught affair, sentence duration, prison full, or no staffed prison. |
| Fit | Good | Prison is a consequence of village scandal, manual staffing, and frontier settlement governance; Moon Howler interactions preserve the setting’s unusual rules. | Overbuilding a conventional prison-management subsystem would dilute Wilderfolk’s current identity. | Keep the prison small, legible, and consequence-focused. |

The current sentence duration and arrest-chance values are existing gameplay contracts. This audit does not propose new numbers. If tuning is later requested, treat every value as a **starting value with a test plan**, not as an industry standard: test the player’s ability to understand cause and effect, then adjust only after clarity and response are acceptable.

## Invariant and correctness gaps

| Priority | Gap | Why it matters | Suggested test or repair |
|---|---|---|---|
| High | Prison occupant validation accepts any occupant whose `homeBuildingId` points to the prison, without requiring `job === JobType.PrisonGuard`. | A malformed or stale non-guard assignment can satisfy the invariant while appearing as prison staff. | Add a guard-role check and a regression test for a non-`PrisonGuard` human in prison occupants. If legacy saves require tolerance, report rather than silently repair. |
| High | Prison reverse validation checks that `prisonBuildingId` points to a prison and is mirrored in occupants, but does not require active sentence metadata. | A human can be marked imprisoned without `prisonerUntilTick` or `prisonSentenceCrime`, making release and diagnostics ambiguous. | Add invariant coverage for active prison state requiring `prisonerUntilTick`; decide explicitly whether `prisonSentenceCrime` is mandatory for all sentences. |
| Medium | Prison invariants do not reject simultaneous prison and workplace/residence assignments. | Arrest normally clears them, but Moon Howler and stale-save paths are complex. | Add a test that an imprisoned human with `homeBuildingId` or `residenceBuildingId` is reported, unless a deliberate exception is documented. |
| Medium | `syncJobBuildingOccupants` rebuilds prison occupancy from entity fields and can accept a prison-home occupant without checking role. | Reconciliation can preserve an invalid state instead of exposing it. | Make the predicate role-aware and let the invariant report inconsistent state. |
| Medium | Release scans all entities and then runs broad residence and worker assignment passes when anything was released. | Correctness is preserved, but the release operation mixes sentence lifecycle with workforce/housing reconciliation. | Keep behavior for now; extract a named post-release reconciliation boundary and add a count/complexity measurement before optimizing. |
| Low | UI derives remaining days from raw tick arithmetic in the entity panel. | Rounding, negative values, or a missing prison reference can produce confusing display. | Add focused UI tests for due-now, overdue, and missing-building cases. |

## Prioritized action plan

### P0 — Protect the authoritative prison transition

Create one named transition boundary for entering and leaving prison. It should define entry conditions, exit conditions, invalid-target behavior, fields written, occupant synchronization, feedback result, and save impact. Route scandal arrest through it. Do not create `tickLayerPrison.ts`; use the existing player/scandal and realtime boundaries.

Acceptance criteria: no direct prison-field mutation remains in scandal code except through the transition; release remains idempotent; a failed arrest performs no partial mutation; all existing focused tests remain green; prison, workforce, and save invariants pass.

### P1 — Remove proven duplication

Centralize prisoner counting and prisoner capacity. Add read-only selectors for UI summaries. Keep prison-specific branches where they express the two-role occupancy rule; do not abstract them into ordinary workplace logic.

Acceptance criteria: arrest and Moon Howler restoration call the same capacity/count selectors; selector tests cover empty, occupied, full, and excluded-self cases.

### P1 — Strengthen prison invariants

Require a prison occupant to be either a valid `PrisonGuard` assigned to that prison or a prisoner whose `prisonBuildingId` matches. Validate active sentence metadata and reject simultaneous workplace/residence membership unless explicitly documented.

Acceptance criteria: malformed states produce precise diagnostics; valid guard-plus-prisoner states remain accepted; save migration tests cover legacy role conversion.

### P2 — Improve player feedback without expanding scope

Keep the existing consequence-driven prison design. Add explicit feedback for staffed-prison gating, capacity rejection, sentence duration, and release. Display a prison overview such as `guards / prisoners / prisoner capacity` using selectors.

Acceptance criteria: a new player can answer “why was this person imprisoned?”, “why are cells empty?”, and “when will release happen?” from the UI and event log without reading source code.

### P2 — Verify behavior with playtests

Use five short scenarios: a new player builds a prison and sees why a guard is required; a staffed prison catches a married affair; a full prison rejects a new sentence without partial mutation; a prisoner is released and becomes eligible for assignment; a Moon Howler transforms while imprisoned and returns before the sentence ends. Repeat each with a demolished or missing prison where relevant.

## Suggested file-level refactoring shape

| Target | Change | Non-goal |
|---|---|---|
| New or existing prison domain helper | Own selectors, capacity calculation, sentence entry/release transition, and prison-state validation. | No new cadence or prison-management feature. |
| `humanRelationships.ts` | Keep affair detection and sentence eligibility; call the prison transition and consume its result. | Do not move relationship rules into workforce. |
| `workforce.ts` | Keep assignment reconciliation and post-release reassignment; consume prison selectors/transition. | Do not make generic staffing infer prisoner rules. |
| `moonHowler.ts` | Keep snapshot and transformation lifecycle; delegate active-sentence validation and occupancy restoration. | Do not make Moon Howler the prison owner. |
| `humanTick.ts` | Keep realtime confinement movement and skip behavior. | Do not release or sentence inside per-human movement logic. |
| `simulationInvariants.ts` | Strengthen role, metadata, and exclusivity checks. | Do not silently repair malformed authoritative state in diagnostics. |
| UI panels | Consume read-only selectors and show reasons/counts. | Do not mutate simulation state or duplicate transition logic. |

## Verification record

The following focused command was run against the connected local project:

```text
npm test -- --run tests/securityRoles.split.test.ts tests/simulation.invariants.test.ts tests/workforce.transitions.test.ts tests/commands.validation.test.ts tests/moonHowler.byTypeReuse.test.ts tests/moonHowler.cureWindow.test.ts
```

Result: **6 test files passed; 59 tests passed; 0 failures.** This validates the current covered behavior, not the proposed refactoring or the invariant gaps identified above.

No source behavior was modified during this audit. No bug report was created because this pass identified architectural risks and test gaps rather than a newly reproduced runtime defect. If a code change is undertaken, follow the project’s mandatory local bug-report and Simulation Change Record process before editing simulation behavior.

## Festival system audit: location, participation, and ownership

The festival system is split across a **daily authoritative owner** and a **realtime presentation/participation owner**. This is broadly consistent with the project authority: the daily layer decides when a festival exists and how long it lasts; the human realtime layer moves eligible settlers to a gathering point and applies participation behavior. The main architectural risk is that several systems consume the single `state.festival` flag for different effects without a single named festival-policy selector.

### Where festivals happen

Festival participation is not currently tied to one dedicated festival building. During the gathering window, eligible villagers are routed to one of these locations:

| Priority | Location | Selection rule | Meaning |
|---:|---|---|---|
| 1 | Performers’ camp | A visitor group with `kind === 'performers'` and `daysLeft > 0` | The festival visibly gathers around visiting performers when they are present. |
| 2 | Staffed Town Hall | A completed/staffed Town Hall selected by `entity.id % staffedTownHalls.length` | The festival gathers around civic leadership when performers are absent. |
| 3 | Map fallback | `width * 0.5`, `height * 0.5` | A central-map fallback prevents the gathering target from being undefined. |

The realtime target is offset per entity to form a loose crowd rather than stacking every villager on one coordinate. The gathering rule runs during `isFestivalGatheringHour`, while the active festival itself can last several days. The current implementation therefore distinguishes **festival duration** from the **daily visible gathering window**.

### Who owns what

| Decision | Owner | Cadence | State/effect |
|---|---|---|---|
| Seasonal festival start | `tickFestivals` in `tickLayerDaily.ts` | Daily layer | Creates `state.festival`, adds reputation, emits news/log, and starts a five-day festival. |
| Random festival start | `tickFestivals` in `tickLayerDaily.ts` | Daily layer at `FESTIVAL_CHECK_TICKS`, subject to population, cooldown, Town Hall boost, and chance | Creates a named festival with randomized duration, reputation, news, and log effects. |
| Player-hosted festival | `hostTownFestival` in `townHall.ts` through its command path | Player command | Validates Town Hall, official staffing, cooldown, and food/gold cost; creates a fourteen-day festival. |
| Festival expiration | `tickFestivals` in `tickLayerDaily.ts` | Calendar-day boundary | Decrements `daysLeft`, emits ending feedback, clears `state.festival`, and starts cooldown. |
| Visible gathering movement | `humanTick.ts` using `isFestivalGatheringHour` | Realtime | Moves eligible humans to performer/Town Hall/fallback target and produces social behavior. |
| Tavern override | `venueSchedule.ts` / `humanTick.ts` | Realtime service query | Keeps the Tavern open for the full day while a festival is active. |
| Production/immigration/courtship boosts | Existing daily and realtime domain owners | Existing system cadences | Read `state.festival?.active` and apply their domain-specific multiplier or behavior. |
| Tutorial/discoverability | `contextualTutorial.ts` and UI | Presentation/event cadence | Detects the transition into an active festival and can queue guidance. |

### Who participates

The festival gathering branch runs for humans that reach the normal human-tick path and are not already in a higher-priority state. Danger response and Moon Howler duties take precedence; election ceremonies also take precedence over the festival gathering branch. A festival therefore does not forcibly interrupt every possible action. During the gathering window, ordinary work movement and ordinary free-roam behavior are replaced by movement toward the selected festival target, with light social chat once the settler arrives.

The active festival also affects systems beyond the visible gathering. Current consumers include production-related multipliers, immigration chance, courtship/social behavior, blueberry foraging behavior, Tavern opening, and tutorial feedback. This means `state.festival` functions as a cross-system mode flag even though creation and expiry have one daily owner.

### WET / DRY / YAGNI / SoC audit

| Principle | Result | Finding |
|---|---|---|
| **WET** | Mostly appropriate | The explicit target-selection logic is readable and makes the performer/Town Hall/fallback hierarchy visible. Do not hide genuinely different festival locations behind an over-generalized venue abstraction. |
| **DRY** | Moderate concern | Many modules independently read `state.festival?.active` and apply their own interpretation. Centralize only stable policy queries such as `isFestivalActive`, `isFestivalGatheringHour`, and `getFestivalGatherTarget`; keep production, immigration, and social effects in their domain owners. |
| **YAGNI** | Strong | There is no need yet for a festival calendar entity, reservations system, ticketing, festival jobs, or a dedicated festival building. The current state object and existing daily/realtime layers are sufficient. |
| **SoC** | Good boundary with one improvement | `tickLayerDaily.ts` owns festival lifecycle and `humanTick.ts` owns visible movement. `townHall.ts` owns player-hosted festival validation. The improvement is to make the festival mode policy explicit rather than letting every consumer interpret the raw flag independently. |
| **Game design** | Good foundation, incomplete clarity | Players can see a gathering and receive news, but the UI should identify the active location, who is participating, how long the festival lasts, and which effects are currently active. |

### Audit conclusion

The festival owner should remain `tickFestivals` in the existing daily layer for autonomous festivals and `hostTownFestival` in `townHall.ts` for the player command. Do not create a `tickLayerFestival.ts`. The realtime human owner should continue to turn authoritative festival state into visible gathering movement, but the target-selection and participation rules should be named and tested separately.

Recommended focused tests are: seasonal festival starts on the intended calendar day; random festivals obey population and cooldown gates; Town Hall hosting rejects missing officials, active festivals, cooldowns, and insufficient resources without partial mutation; festival expiry occurs once; performers are preferred over staffed Town Halls; the fallback target is used when neither exists; danger/election/Moon Howler priorities override gathering; Tavern override is active during festivals; and imprisoned settlers do not participate in festival movement because the prisoner early exit remains authoritative.

## PDF cross-check: `Festivals_en_venues.pdf`

The attached six-page PDF is a design/verification document that states the intended separation between event location, venue opening, worker shifts, and work-hour fatigue. It largely agrees with the code ownership model, but it also exposes several important implementation discrepancies.

### Confirmed agreements

| PDF rule | Runtime agreement |
|---|---|
| `tickLayerDaily.ts` owns festival creation and expiry; `humanTick.ts` only renders participation movement. | Confirmed by `tickFestivals()` and the festival gathering branch. |
| Performers’ camp is the first gathering location, followed by staffed Town Hall and map center. | Confirmed by the target-selection code. |
| Tavern visitor opening and Innkeeper worker shift are separate. | Confirmed conceptually by `isVenueServiceHour(..., festivalActive)` versus `isVenueWorkerServiceHour(...)`. |
| Hotel venue availability and Hotelier work shift are separate. | Confirmed by venue schedule and human-tick role handling. |
| Festival gathering is a bounded window, not the full festival duration. | Confirmed: the active festival can last days, while gathering occurs 15:00–22:00. |
| Prisoners do not become ordinary workers. | Confirmed by the prisoner early return and absence of a prison-labor job. |
| Barracks Soldiers and Prison Guards are separate roles. | Confirmed by `BUILDING_JOB_TYPES`, workforce assignment, and defense counting. |

### Confirmed or likely discrepancies

| ID | Severity | PDF claim | Runtime finding | Advice |
|---|---:|---|---|---|
| PDF-01 | High | Active Barracks Guards can detect an incoming raid earlier and provide one or two extra preparation days at defined guard counts. | Patrol code detects nearby marching raiders and reveals them, but the inspected runtime paths do not show `detectedByPatrol` changing the raid event’s response/expiry timing. The documented preparation-day effect is therefore not proven in code. | Trace the raid response calculation end to end. If the PDF is authoritative, connect patrol detection to the authoritative raid deadline once, with tests for 0, 1, 2–3, and 4+ active patrol guards. |
| PDF-02 | High | High Alert should increase patrol coverage or patrol activity. | No High Alert condition was found in the Soldier patrol invocation. Patrols run only when the Soldier is in the ordinary work movement path (`goWorkTime` and no higher-priority branch). | Add an explicit High Alert modifier to patrol frequency, number of active patrols, route radius, or detection reliability. Keep the modifier in the security/patrol owner, not in rendering. |
| PDF-03 | Medium | Prison requires an assigned Guard when a prisoner is present, but the same Guard need not work 24 hours. | `hasStaffedPrison` gates scandal arrest, while the prisoner remains physically confined through the prisoner movement branch regardless of current guard work hour. This matches the PDF’s institutional-storage wording, but it means “staffed for arrest” and “actively watched right now” are different concepts. | Name the two states explicitly: `canAcceptPrisoner` versus `activeCustodyCoverage`. Decide whether existing prisoners are safe without an active shift; do not leave the distinction implicit. |
| PDF-04 | Medium | Prison has no dynamic night-watch simulation yet. | Confirmed: there is no prison-specific shift/roster function comparable to hotel worker segmentation. | Treat night watch as a future feature, not a hidden assumption. If implemented, separate custody coverage from ordinary work fatigue and address guard/prisoner capacity. |
| PDF-05 | Medium | Tavern festival override keeps the venue open but does not extend the Innkeeper worker shift. | The PDF states this separation explicitly. Runtime tests cover the Tavern override, but the human-tick path should be regression-tested to ensure visitor openness never records hidden Innkeeper work. | Keep `isVenueServiceHour` and `isVenueWorkerServiceHour` separate and add an integration test around festival hours and work-tick accounting. |
| PDF-06 | Medium | Hotelier work remains limited to the configured Hotel worker shift even when the venue serves guests. | The design contract agrees with this, but the implementation has no separate automatic staffing/roster simulation. | Keep the current scope. Do not add hidden Hoteliers; make future staffing a separate objective. |
| PDF-07 | Medium | Festival effects are controlled by daily lifecycle but consumed by multiple domain systems. | Confirmed. The raw `state.festival?.active` flag is read in production, immigration, social, venue, tutorial, and movement code. | Retain domain owners but add named policy selectors and a behavior-matrix test suite. |
| PDF-08 | Low | Statistics should expose population, jobs, fatigue, Guards, buildings, venue hours, resources, and lifetime records. | This is a UI/documentation acceptance claim and was not fully revalidated in this pass. | Verify the Statistics screen against the PDF field list before marking it complete; treat missing fields as UI gaps, not simulation bugs. |
| PDF-09 | Medium | The PDF reports a 31-test focused group covering venue windows, festival/Tavern separation, Tavern behavior, Hotel lodging, fatigue, affair radii, and Guard patrols. | The locally run focused prison/security command passed 59 tests, but the exact 31-test group from the PDF was not independently reconstructed here. | Record the exact test file list and counts in the next verification pass; do not use an aggregate count as proof that every PDF claim is covered. |

### PDF-specific ownership conclusion

The PDF has a sound ownership statement: daily festival lifecycle in `tickLayerDaily.ts`; realtime settler movement in `humanTick.ts`; venue worker schedules in `venueSchedule.ts`; ordinary work hours in `workSchedule.ts`; fatigue policy in `scheduleFatigue.ts`; Town Hall command validation in `townHall.ts`; and Barracks patrol execution in the Soldier branch of `humanTick.ts`. The main missing contract is the boundary between **active patrol detection**, **raid response timing**, and **High Alert**. That should be resolved before further UI or balance tuning.

## Review of the updated PDF: responsibility and implementation audit

The updated attached PDF is clearer than the earlier version and correctly separates event location, venue opening, worker shifts, and fatigue. It also corrects the prison wording: the Prison Guard is currently an **arrest prerequisite**, not a continuously simulated 24-hour watch. That distinction matches the present code more closely. The following findings remain after cross-checking the updated text against the local source.

| PDF review ID | Classification | Severity | Finding | Advice |
|---|---|---:|---|---|
| UPD-01 | Confirmed mismatch | High | The PDF says `countGuardsAtPrison(...)` first checks a workplace assignment and then falls back to a valid non-imprisoned player Guard present in the Prison occupants list. The inspected `humanRelationships.ts` implementation counts only living, non-imprisoned player humans with `job === JobType.PrisonGuard` and `homeBuildingId === prison.id`; it does not implement the described occupants-only fallback. | Either update the PDF to match the code or implement the fallback through one named transition/selector. Do not leave the document claiming a recovery path that runtime does not have. |
| UPD-02 | Confirmed logic bug | High | The PDF states that a Tavern festival override opens the venue for visitors but does not extend the Innkeeper’s worker shift. In `humanTick.ts`, however, festival-active `onTavernShift` uses `isVenueServiceHour(..., true)`, which returns true for the whole day; `recordScheduleWorkTick(entity)` then runs before the festival movement branch. The Innkeeper can therefore accrue work ticks during the festival override outside the configured worker shift. | Split visitor opening from worker duty in the runtime path. Use the festival override only for visitor access; use `isVenueWorkerServiceHour` for Innkeeper work accounting. Add a regression test for a festival hour outside the Innkeeper shift. |
| UPD-03 | Logic/clarity risk | Medium | Hotelier work ticks can be recorded while `festivalGathering` routes the person through the visible festival branch, because `onHotelShift` is computed before the festival movement branch and contributes to `onJobShift`. | Decide whether a Hotelier on shift is exempt from gathering or is counted as working while visibly attending. Encode that rule explicitly and test movement plus work accounting together. |
| UPD-04 | Confirmed incomplete implementation | High | The PDF documents one or two extra raid preparation days from active Barracks patrol counts. The local patrol function reveals marching raiders and clears `hiddenFromPlayer`, but the inspected raid response/deadline paths do not show patrol detection modifying preparation timing. | Connect patrol detection to the authoritative raid response field, or correct the PDF to describe visibility-only detection. Add tests for 0, 1, 2–3, and 4+ active patrol guards. |
| UPD-05 | Confirmed missing rule | High | The PDF states patrol coverage/effects, but the inspected patrol invocation has no High Alert condition or modifier. Patrols run only when `goWorkTime`, Soldier role, Barracks assignment, and higher-priority exclusions permit the branch. | Add High Alert scaling in the patrol/security owner. Test patrol frequency, detection reliability, or coverage at normal and High Alert states. |
| UPD-06 | Documented limitation | Medium | The PDF accurately says there is no dynamic Prison night-watch system. The code also has no Prison-specific shift segmentation, so Prison custody is not equivalent to Hotel service scheduling. | Keep this as an explicit limitation until a prison custody rule is approved. If added, define active custody coverage separately from arrest eligibility and ordinary fatigue. |
| UPD-07 | Ownership nuance | Medium | The PDF calls Town Hall the civic owner of festival decisions. Player-hosted festivals are owned by `hostTownFestival`, but autonomous seasonal/random festivals are created by `tickFestivals` in `tickLayerDaily.ts`; Town Hall staffing supplies a boost/fallback rather than owning every festival. | State ownership as: daily layer owns autonomous lifecycle; Town Hall owns player-hosted festival commands; realtime layer owns visible participation. |
| UPD-08 | Naming/documentation mismatch | Low | The PDF refers to `isVenueWorkerShift(...)`; the inspected source uses `isVenueWorkerServiceHour(...)`. | Correct the document name or introduce an intentional alias only if needed. Avoid duplicate exports solely to preserve a typo. |
| UPD-09 | Verification mismatch | Medium | The PDF reports a focused group of 31 passing tests. The independent local run for the related files passed 7 files and 28 tests. This is not a failure, but it is not the same verification claim. | Record the exact test-file list behind the 31-test claim and rerun that exact list before marking the PDF verification as reproduced. |
| UPD-10 | Confirmed performance risk | Medium | `detectRaidersForPatrol` loops through all human entities for every active Soldier patrol tick, then loops through all humans again for each detected group; `isRaidMarchingForRival` may also inspect pending raid events per rival. | Use the existing entity/group indexes and bounded spatial queries. Measure before/after; do not replace the current readable logic without profiling. |
| UPD-11 | Confirmed scope agreement | Low | The PDF correctly rejects hidden extra workers: festivals do not create Innkeepers/Hoteliers/Guards/performers, and venue opening does not silently extend individual worker shifts. | Preserve this rule in tests, especially for Tavern festival override and future prison/Barracks shift work. |
| UPD-12 | Test gap | Medium | The PDF says a complete simulated festival fixture is optional, but the documented rules now span lifecycle, location, participant priorities, worker accounting, Tavern override, Hotelier behavior, and fatigue. | Add a compact integration matrix rather than a large synthetic world: test one representative ordinary worker, Innkeeper, Hotelier, prisoner, Soldier, emergency override, and each location fallback. |

### Updated source-of-truth conclusion

The updated PDF should be treated as a **design and verification contract**, but its claims must be reconciled with runtime before they are called “controlled.” The strongest confirmed runtime issue is **UPD-02**, where the Tavern festival override currently leaks into Innkeeper work-tick accounting despite the PDF explicitly prohibiting that. The strongest incomplete feature claims are **UPD-04** and **UPD-05**: patrol visibility exists, but the documented preparation-day effect and High Alert scaling are not confirmed in the inspected code.

The Prison section is now conceptually more accurate than the earlier audit: it does not require a 24-hour visible guard, and the current prisoner state persists after the arrest prerequisite is satisfied. The remaining decision is whether that institutional abstraction is the intended game rule or whether future work should add active custody coverage and night shifts.

## Complete named findings register with advice

The register below intentionally separates **confirmed current behavior**, **confirmed historical defects**, **logic risks**, **performance risks**, **architecture findings**, **test gaps**, and **design gaps**. A risk is not labeled as a confirmed bug unless the current code or an existing regression record proves it.

| ID | Category | Severity | Finding and evidence | Advice |
|---|---|---:|---|---|
| PR-01 | Logic/design gap | High | Prisoners remain constrained by the realtime prisoner branch even when no Prison Guard is active outside the ordinary work schedule. | Implement explicit 24-hour prison coverage or change the rule to make an uncovered prison unsecured. Never leave the contradiction silent. |
| PR-02 | Missing feature | High | Prison Guards have no hotel-style shift segmentation or active coverage selector. | Add a prison security schedule/roster modeled on hotel worker segmentation, but support full-day and midnight-crossing coverage. |
| PR-03 | Capacity logic risk | High | Prison capacity is encoded as generic `maxOccupants`, then prisoner capacity is derived by subtracting one guard slot. Multiple shift guards cannot be represented cleanly. | Choose separate guard roster state or separate guard/prisoner capacities before implementing multiple shifts. Add migration and invariant tests if state changes. |
| PR-04 | Architecture | High | `arrestForScandal` directly mutates work, residence, prison, position, and presentation state. | Extract one named prison-entry transition; leave affair detection and eligibility in relationships. |
| PR-05 | Architecture | High | Moon Howler transformation/restoration directly detaches, clears, and restores prison state outside the prison/scandal path. | Keep Moon Howler as transformation owner, but delegate prison validity, capacity, and occupancy restoration to shared prison transitions/selectors. |
| PR-06 | DRY | Medium | `countPrisonersAt` and `countPrisonersAtBuilding` duplicate prisoner counting. | Consolidate into one read-only selector with optional `excludeId`. |
| PR-07 | DRY | Medium | Arrest and Moon Howler restoration duplicate the prisoner-capacity formula. | Centralize `getPrisonerCapacity(building)` and document the guard-slot rule. |
| PR-08 | Invariant gap | High | A prison occupant is accepted as a guard when `homeBuildingId` points to the prison, even if `job` is not `JobType.PrisonGuard`. | Require valid guard role plus assignment, or report legacy states explicitly. |
| PR-09 | Invariant gap | High | `prisonBuildingId` validation does not require a release tick or clearly define whether crime metadata is mandatory. | Define the active-sentence contract and test missing/expired metadata. |
| PR-10 | Invariant gap | Medium | The prison invariant does not clearly reject simultaneous prison, workplace, and residence assignments. | Add exclusivity checks unless a documented exception is approved. |
| PR-11 | Logic risk | Medium | Release clears prison state and runs missing-residence/missing-worker passes; it does not restore the former exact workplace or residence. | Document reassignment as intentional, or snapshot and restore prior assignments. Test both expected outcomes before changing it. |
| PR-12 | Performance risk | Medium | `syncJobBuildingOccupants` filters the complete human list once per job building, including a special prison filter. | Preserve correctness first; if measured hot, build an entity index by workplace/prison once per reconciliation pass. Measure before optimizing. |
| PR-13 | Performance risk | Low/Medium | `releasePrisoners` scans all entities, finds each prison with a linear building lookup, then may scan all humans again for reassignment. | Keep the current simple path until profiling shows impact; then pass a building map and released-entity list into the existing assignment pipeline. |
| PR-14 | Intentional behavior | Low | Prisoners exit before work scheduling, social AI, conception, affair logic, and work-tick recording. | Keep this behavior if imprisonment means isolation; add a regression test proving prisoners accrue no ordinary work ticks. |
| PR-15 | UI clarity gap | Medium | Prison UI explains manual guard assignment but does not show active custody coverage, uncovered hours, or shift requirement. | Display guards, prisoners, required coverage, current shift, and unsecured/understaffed status. |
| PR-16 | UI duplication | Low | Building, population, summary, and entity panels independently derive prison counts/status. | Add read-only selectors for prisoner lists, counts, and remaining sentence display. |
| PR-17 | Confirmed historical bug | High | Existing regression history records prisoner occupants being wiped by generic synchronization; the prison special case now preserves prisoners. | Keep the regression test permanently. Do not simplify prison reconciliation back to `homeBuildingId` only. |
| PR-18 | Save/migration risk | Medium | Prison roles and absolute release ticks participate in save migration; security-role splitting depends on workplace type. | Any shift roster or capacity change requires save schema review, migration tests, and explicit compatibility classification. |
| BR-01 | Incomplete gameplay implementation | High | `humanTick.ts` does contain Soldier patrol movement and `detectRaidersForPatrol`; the patrol can reveal hidden raiders within `PATROL_DETECTION_RADIUS`. The earlier “no patrol loop” conclusion is corrected. | Preserve the existing patrol path and complete the documented patrol outcomes: detection timing/response benefit, visible patrol feedback, and High Alert scaling. |
| BR-02 | Missing High Alert behavior | High | The PDF requires more patrol coverage during High Alert, but the inspected patrol condition in `humanTick.ts` checks `goWorkTime`, Soldier role, and Barracks assignment; no High Alert modifier was found. | Add an explicit High Alert owner/query that increases patrol activity or detection reliability, then test normal, high-alert, and zero-patrol cases. |
| BR-03 | Logic/design ambiguity | Medium | `getBarracksGuardCount` and `getBarracksGuardBonus` count assigned Soldiers regardless of hour, while Soldier movement/work scheduling is daytime-oriented. | Name the persistent effect “standing militia readiness” and make patrol duty a separate active behavior. |
| BR-04 | Architecture | Medium | Barracks defense math, movement, Moon Howler protection, and future patrol behavior are separate, but there is no named security-coverage contract. | Add a read-only security selector for assigned Soldiers, active patrol coverage, and detection status; keep defense math in its owner. |
| BR-05 | Design gap | Medium | A Soldier can contribute to persistent defense strength while not currently patrolling; the patrol route and detection result are not fully surfaced as a player-facing security model. | Show active patrol count/coverage and notify the player when a patrol detects an enemy or when no patrol is active. |
| BR-06 | Role separation | Low | Barracks maps to `Soldier` and Prison maps to `PrisonGuard`; Barracks counts explicitly exclude imprisoned humans and Prison Guards. | Preserve the split. Do not reuse one generic `Guard` role for both systems. |
| BR-07 | Performance risk | Low/Medium | Patrols, if added as repeated proximity searches, could become an unbounded realtime scan. | Use the existing spatial index/cache, bound patrol checks, and measure detection work per tick. Never add a full-population scan to realtime without evidence. |
| FE-01 | Ownership | Medium | `tickFestivals` owns automatic festival creation and expiry; `hostTownFestival` owns player-hosted creation; `humanTick` owns visible gathering movement. | Keep these owners. Do not create a festival tick layer. Add named selectors for festival active state, target, and gathering window. |
| FE-02 | Logic clarity | Medium | Festival effects are consumed independently by production, immigration, courtship/social, foraging, Tavern service, tutorial, and realtime gathering. | Keep domain ownership, but centralize stable policy queries and document each effect’s cadence and multiplier. |
| FE-03 | Location behavior | Low | Gathering target is performers’ camp, then a staffed Town Hall, then map center; target is not one fixed festival venue. | Show the active location in UI and test each fallback. |
| FE-04 | Participation behavior | Medium | Gathering occurs 15:00–22:00, but danger response, elections, Moon Howler duties, prisoners, and special service roles can override or bypass ordinary gathering. | Present “eligible villagers gather” rather than “everyone attends”; add role-specific tests. |
| FE-05 | Work-rule clarity | Medium | Ordinary work is suppressed during the gathering branch, but venue/service roles can continue to record work through separate schedules. | Show the player which jobs pause and which services continue; do not describe the festival as a universal day off. |
| FE-06 | Festival cadence risk | Medium | Seasonal, random, and player-hosted festivals use different duration/start rules while sharing `state.festival`. | Keep one lifecycle field only if all variants have explicit source/type metadata or document the current limitations. |
| FE-07 | Test gap | Medium | Focused tests cover several prison/security paths, but the audit found no complete matrix proving festival location fallback, role participation, and work/service behavior together. | Add a festival behavior matrix before changing festival policy. |
| HS-01 | Existing limitation | Medium | Hotel venue schedules reject wraparound and cap service windows; this is valid for hotels but unsuitable as-is for 24-hour prison custody. | Reuse the segmentation idea, not the exact validation contract. Add a security schedule type for full-day coverage. |
| HS-02 | Fatigue risk | High | Treating continuous Prison Guard coverage as ordinary work ticks would incorrectly turn custody into unbounded 24-hour fatigue. | Separate security duty load from ordinary work-hour accounting and bound any fatigue effect. |
| QA-01 | Validation gap | Medium | The focused prison/security suite passed 6 files and 59 tests, but those tests do not prove patrol detection, High Alert scaling, or prison shift coverage. | Add focused tests for each new contract, then run full regression, type checking, lint, build, and performance measurement. |
| QA-02 | Documentation gap | Low | The report and authority documents describe ownership, but current UI does not expose all player-relevant ownership consequences. | Add concise player-facing explanations without changing simulation behavior. |

### Audit scope and evidence boundary

This register covers the connected systems that directly implement or consume prison, Prison Guard, Barracks, Soldier, patrol/detection, festival, hotel-shift, work-hours, fatigue, Moon Howler, workforce, save/migration, invariant, and related UI behavior. It is a complete named list for that scope based on source inspection and the available project evidence. It is not a claim that every unrelated Wilderfolk module has been exhaustively reviewed.

The project duplicate-code scan analyzed **287 source files, 47,688 lines, and 534,234 tokens**, and reported **0 clones** under the configured threshold. This means the register’s DRY findings are semantic duplication—repeated domain rules such as prisoner counting, capacity calculation, and raw festival-flag interpretation—not copy-paste clones detected by the tool.

### Recommended implementation order

The safest order is **BR-01/BR-02 first for Barracks purpose**, then **PR-01/PR-02 for prison coverage**, then **PR-03/PR-08–PR-10 for capacity and invariants**, followed by **PR-04–PR-07 for ownership and duplication cleanup**. Festival work should remain separate: first add behavior-matrix tests and clarify work participation, then introduce only the smallest selector or UI improvements supported by evidence.

Do not combine patrols, prison shifts, prison labor, festival redesign, and generic security refactoring into one change. Each changes a different owner or cadence and should have its own Simulation Change Record, acceptance criteria, regression tests, and rollback plan.

## Numbered proposed changes

The following are the **proposed changes**, numbered in implementation order. The finding IDs above describe evidence; these change numbers identify actionable work. No change below has been implemented in this audit.

| Change | Priority | Owner/cadence | Proposed change | Advice and acceptance criteria |
|---:|---:|---|---|---|
| 1 | P0 | `humanTick.ts` / security patrol owner; realtime | Make Soldier patrols the primary enemy-detection mechanic. | Preserve existing patrol movement and detection radius. Add tests proving zero patrols give no patrol detection, one patrol gives limited detection, and patrol detection produces player feedback. |
| 2 | P0 | Security/patrol owner; alert cadence | Add High Alert patrol scaling. | Define one explicit modifier for patrol frequency, active patrol count, route coverage, or detection reliability. Test normal alert versus High Alert and verify no duplicate detection events. |
| 3 | P0 | `frontierCombat.ts` plus patrol owner; raid event cadence | Connect patrol detection to the documented additional raid preparation time. | Use the authoritative raid response/deadline field once. Test the documented guard-count bands and cap; do not modify UI-only visibility and assume timing changed. |
| 4 | P0 | Prison/security owner; custody cadence | Define `canAcceptPrisoner` separately from `activeCustodyCoverage`. | Decide whether an existing prisoner remains secure without an active guard. Encode the result in a named selector and show the state in UI. |
| 5 | P0 | Prison/security owner; realtime shift cadence | Add hotel-style Prison Guard shift segmentation for 24-hour custody. | Support full-day and midnight-crossing intervals; do not reuse hotel validation unchanged. Test day, night, shift boundary, and no-guard cases. |
| 6 | P0 | `gameTypes.ts` / prison state owner; assignment cadence | Resolve the guard-slot versus prisoner-slot capacity model. | Choose a separate guard roster or separate guard/prisoner capacities. Include save/migration impact before changing schema. |
| 7 | P1 | `humanRelationships.ts` to prison transition; scandal/player-command cadence | Extract a single prison-entry transition from `arrestForScandal`. | The transition must be atomic, reject invalid/full prisons without partial mutation, clear work/residence consistently, set sentence fields, and return a structured result. |
| 8 | P1 | `workforce.ts` to prison transition; release/assignment cadence | Keep prison release state mutation in one named release transition and separate post-release reassignment. | Preserve current release behavior unless design changes it. Test idempotent release, missing prison, overdue sentence, and reassignment. |
| 9 | P1 | Prison selector module; read-only | Centralize prisoner counting and capacity calculation. | Replace duplicate counters and cap formulas in relationship and Moon Howler code. Test empty, full, and excluded-self cases. |
| 10 | P1 | `simulationInvariants.ts`; diagnostic cadence | Strengthen prison invariants. | Validate Prison Guard role, active sentence metadata, prison-reference symmetry, and no simultaneous workplace/residence assignment unless explicitly allowed. |
| 11 | P1 | `moonHowler.ts` plus prison selector; transformation cadence | Delegate prison validation and restoration to shared prison selectors/transitions. | Keep Moon Howler snapshot ownership. Test transform, dawn return, cure, death, missing prison, full prison, and expired sentence. |
| 12 | P1 | `humanTick.ts` / `scheduleFatigue.ts`; realtime and daily cadence | Separate security duty load from ordinary work-hour fatigue. | Prison custody or patrol must not silently become 24 hours of ordinary work. If duty affects fatigue, use a bounded, separately named workload. |
| 13 | P1 | `humanTick.ts`; realtime | Preserve prisoner isolation as an explicit state contract. | Keep prisoners out of ordinary work, conception, affairs, social AI, and festival gathering unless the developer approves a new prison activity. Test zero work-tick accrual. |
| 14 | P1 | Festival policy selectors; daily/realtime consumers | Add named festival selectors for active state, gathering window, target, and participation eligibility. | Keep production, immigration, social, venue, and tutorial decisions in their own owners. Test performers-first, Town Hall fallback, map fallback, and priority overrides. |
| 15 | P1 | Festival test owner; existing daily/realtime cadence | Add a complete festival behavior matrix. | Cover seasonal, random, and player-hosted starts; duration/expiry; location; ordinary workers; Innkeepers; Hoteliers; prisoners; emergencies; and Tavern override. |
| 16 | P2 | Festival UI owner; presentation cadence | Show festival location, remaining duration, gathering hours, paused jobs, continuing venue services, and active effects. | Do not make UI authoritative. Acceptance requires a new player to understand what changes without reading code. |
| 17 | P2 | Prison UI owner; presentation cadence | Show guard count, prisoner count, required coverage, current shift, and unsecured/understaffed status. | Use read-only selectors. Add distinct feedback for no guard, full prison, rejected arrest, active custody, and release. |
| 18 | P2 | `venueSchedule.ts` / security schedule owner; schedule cadence | Reuse hotel’s shift segmentation concept through a generic helper only if it supports full-day and midnight-crossing schedules. | Do not copy the hotel implementation blindly or force prisons into hotel semantics. |
| 19 | P2 | Statistics/UI owner; presentation cadence | Verify the PDF’s Statistics requirements. | Check population, jobs, fatigue, Guards, buildings, venue hours, resources, and lifetime records against the live screen; report missing fields separately from simulation bugs. |
| 20 | P2 | Performance owner; measured realtime/reconciliation cadence | Profile and bound new patrol, prison, festival, and reconciliation work. | Use existing spatial indexes; avoid full-population scans in realtime; pass maps/indexes where profiling proves benefit; record before/after measurements. |
| 21 | P2 | Save/migration owner; load cadence | Add migration coverage for any security roster or capacity change. | Preserve legacy `Soldier`/`PrisonGuard` mapping and absolute sentence ticks. Do not change save compatibility labels without explicit approval. |
| 22 | P2 | QA owner; validation cadence | Add focused regression tests for every accepted change, then run full project validation. | Run focused tests, invariant tests, TypeScript, lint, build, full regression, seeded behavior, and performance measurement. |

### Change-control advice

Implement these as separate small objectives rather than one large rewrite. Start with Changes **1–3** because Barracks patrols and High Alert define the enemy-information loop. Then implement Changes **4–6** for prison custody and shift semantics. Changes **7–13** protect state ownership and invariants. Changes **14–16** clarify festival behavior, and Changes **17–22** complete UI, persistence, performance, and validation protection.

Every implemented change must receive its own Simulation Change Record stating owner, decision, cadence, fields written, player-visible effect, tests, invariants, save impact, and rollback plan. If a confirmed runtime bug is found during implementation, create the required local bug report before or alongside the fix.

## Additional v0.6.3 implementation-audit reconciliation

The additional `Wilderfolk v0.6.3 — Festivals and Venues Implementation Audit` changes the evidence set in four important ways. It identifies a **P0 worker-delta transport defect**, confirms a **performer-revelry duration defect**, documents that **automatic venue staffing and split shifts already exist**, and reports a more complete focused test set. These findings are now mapped to unique bug-report codes.

| Unique bug code | Finding | Status | Required action |
|---|---|---|---|
| `2026-08-22-venue-schedules-missing-from-sim-tick-delta` | `tavernSchedule` and `hotelSchedule` are prepared initially but omitted from `SimTickDelta` extraction/application, allowing stale host/UI state after a successful worker command. | Open | Repair delta protocol and add worker/host round-trip tests. Treat as P0 release blocker for worker venue scheduling. |
| `2026-08-22-festival-override-extends-innkeeper-work` | Festival Tavern visitor opening currently leaks into Innkeeper work-shift accounting; the code and revised PDF disagree. | Open | Choose the policy explicitly. The revised PDF advocates visitor-only override; then update `humanTick.ts`, old Tavern test, and building copy together. |
| `2026-08-22-performer-revelry-shortens-active-festival` | `Math.min(14, daysLeft + 2)` can reduce a longer active festival to 14 days. | Open | Make duration extension monotonic and decide the cap separately. |
| `2026-08-22-save-normalization-festival-venue-state` | Loaded festival and venue records are not consistently canonicalized at the load boundary; malformed `daysLeft` can reach expiry arithmetic. | Open | Add idempotent festival/venue normalizers and legacy/malformed-save tests. |
| `2026-08-22-patrol-enemy-detection-missing` | Patrol visibility now exists, but documented preparation-day benefits and High Alert scaling remain unproven/missing. | Confirmed open | Align raid timing, patrol guard-count bands, and High Alert behavior with the implementation or revise the design. |
| `2026-08-22-prison-guard-occupant-fallback-missing` | The updated PDF describes an occupants-list fallback that the inspected runtime staffing selector does not implement. | Open | Align the selector and PDF; preserve one authoritative prison staffing rule. |
| `2026-08-22-prison-guards-and-barracks-soldiers-share-role` | Historical shared Guard-role report now has a canonical unique code; source fix is recorded as focused-validated. | Fixed in source; live verification pending | Preserve migration evidence and keep role-specific invariants. |

### Corrections to earlier audit conclusions

The additional implementation audit supersedes two earlier statements. First, **Barracks patrols are not absent**: the local code has a bounded patrol scan and reveal transition. The open issue is the missing/undemonstrated response-time and High Alert contract. Second, **automatic venue staffing and split shifts are not absent**: the local code contains `getVenueAutoStaffingTarget()` and worker-index-based `isVenueWorkerServiceHour()` behavior. The remaining issues are documentation accuracy, later-shift commute snapping, transport reconciliation, and explicit staffing UI.

The new audit also exposes a previously unlisted P0 issue: the worker command transport can lose venue schedule fields even though initial preparation includes them. This is separate from the Tavern policy bug and must receive its own report and fix.

### Numbered change mapping after the additional audit

| Proposed changes | Unique bug code or classification |
|---|---|
| Changes 1–3: patrol detection, High Alert, raid preparation | `2026-08-22-patrol-enemy-detection-missing` |
| Changes 4–6: prison acceptance, custody coverage, capacity | `2026-08-22-prison-guard-occupant-fallback-missing`; `2026-08-22-prison-guards-and-barracks-soldiers-share-role` |
| Changes 7–13: prison transitions, invariants, Moon Howler, fatigue, prisoner isolation | Recommendation/invariant work; bug reports only when a reproducible defect is confirmed |
| Changes 14–16: festival selectors, behavior matrix, festival UI | `2026-08-22-festival-override-extends-innkeeper-work`; `2026-08-22-performer-revelry-shortens-active-festival` |
| Changes 17–19: Prison/festival/Statistics UI | Recommendation/UI gap unless a reproducible defect is confirmed |
| Change 20: performance and reconciliation bounds | `2026-08-22-venue-schedules-missing-from-sim-tick-delta`; patrol performance remains a measured-risk recommendation |
| Change 21: save/migration coverage | `2026-08-22-save-normalization-festival-venue-state` |
| Change 22: focused regression and full validation | QA recommendation; each confirmed failure receives its own unique bug code |

The additional audit reports **7 files and 30 tests passed** for its focused set, while the earlier local related run reported 7 files and 28 tests because it used a different file selection. These counts must not be merged into one claim. The exact test list should be recorded when reproducing the PDF verification.

## Prison and Barracks Verification Addendum review

The attached **Wilderfolk v0.6.3 — Prison and Barracks Verification Addendum** was compared with the current source, existing bug reports, and the earlier Festivals/Venues audit. It agrees with the runtime on the Prison core, distinct Soldier/PrisonGuard roles, mixed Prison occupancy, prisoner isolation, release behavior, and the existence of a bounded Soldier patrol. It also corrects the earlier audit’s overstatement that patrols were absent.

| Addendum conclusion | Comparison result | Audit consequence |
|---|---|---|
| Prison core is functional and prisoners are isolated from ordinary movement/work/social/courtship/conception. | Agrees with the inspected prisoner early-return and focused tests. | Preserve as an intentional contract; do not introduce prison labor or a new tick layer without approval. |
| `arrestForScandal()` requires a completed Prison, valid assigned PrisonGuard, arrest roll, and capacity. | Agrees with the inspected predicate and capacity path, except for the separately documented occupants-list fallback mismatch. | Keep the formal arrest gate; track fallback disagreement under `2026-08-22-prison-guard-occupant-fallback-missing`. |
| Prison capacity is `max(1, maxOccupants - 1)`; current two-slot Prison effectively holds one prisoner. | Agrees with source. | Treat mixed `maxOccupants` semantics as a design/maintenance risk, not an immediate capacity bug. |
| Prisoner release clears custody and re-enters ordinary housing/workforce consideration without restoring the former exact job/home. | Agrees with source and prior audit. | Keep reassignment explicit and test it separately from custody release. |
| Barracks Soldiers provide standing militia strength at all hours. | Agrees with defense counting, but the Barracks copy says +12 while the authoritative constant is +14. | Track copy mismatch under `2026-08-22-barracks-militia-copy-wrong`. Do not retune balance as part of the copy fix. |
| Barracks Soldiers patrol during normal work time and reveal nearby marching raids within a 150-unit radius. | Agrees with `detectRaidersForPatrol()` and its invocation. | Update the patrol report; the open issue is not visibility but missing strategic response/High Alert behavior. |
| Patrol detection supplies extra preparation days and High Alert behavior. | Not proven in the source inspected. No downstream `detectedByPatrol` timing consumer or High Alert patrol modifier was found. | Keep `2026-08-22-patrol-enemy-detection-missing` open for the missing strategic contract. |
| Prison custody has no active shift, night-watch, escape, or coverage selector. | Agrees with source. | This is a policy decision, not automatically a bug. Document institutional custody or implement active coverage as a separately approved change. |
| Prison entry and Moon Howler restoration duplicate custody mutation policy. | Agrees with the source ownership review. | Keep the narrow selector/transition recommendation; do not create a generic security manager. |

### Addendum-specific unique bug/report codes

| Unique code | Type | Status | Advice |
|---|---|---|---|
| `2026-08-22-patrol-enemy-detection-missing` | Existing bug report updated | Confirmed open | Patrol reveal exists; implement or remove the promised raid-response and High Alert effects. |
| `2026-08-22-prison-guard-occupant-fallback-missing` | Existing open bug report | Open | Align the PDF’s fallback claim with the authoritative staffing selector. |
| `2026-08-22-barracks-militia-copy-wrong` | New bug report | Open | Correct +12 to the authoritative +14 or derive copy from the shared constant. |
| `2026-08-22-prison-guards-and-barracks-soldiers-share-role` | Historical role-split report | Fixed in source; live verification pending | Preserve migration and role-specific regression evidence. |

### Verification and research notes

The addendum reports **7 files and 63 tests passed** for its Prison/role/workforce/Moon Howler/invariant focused suite. It explicitly reports that patrol/High Alert/raid-deadline tests are absent and that browser-worker and full-suite verification were not run. This is stronger evidence for the Prison core than the earlier aggregate counts, but it does not prove the missing patrol strategic contract or the worker transport issue from the separate Venues audit.

The extra repository check confirmed: `humanTick.ts` contains the 150-unit patrol scan and reveal state; `frontierCombat.ts` owns pending raid event timing; `buildings.ts` contains the stale +12 description; `defenseStructures.ts` contains +14; and the Prison staffing predicate is assignment-based rather than an occupants-only fallback. These are now represented by the unique report codes above.

The addendum’s recommended order is accepted: decide patrol visibility versus strategic response first; correct the Barracks copy; decide institutional custody versus active coverage; resolve the Guard fallback claim; then extract narrow Prison selectors/transitions. Prison shifts, escape rules, workhouse behavior, and a general security rewrite remain explicitly out of scope unless separately approved.

## References

[1]: `src/game/simulation/humanRelationships.ts` — affair exposure, arrest, sentence creation, and courtship gating.

[2]: `src/game/workforce.ts` — prison occupancy reconciliation, staffing rules, and prisoner release.

[3]: `src/game/moonHowler.ts` — temporary prison detachment and active-sentence restoration.

[4]: `src/game/humanTick.ts` — realtime prisoner movement and simulation short-circuit.

[5]: `src/game/simulation/simulationInvariants.ts` — prison occupancy and reverse-reference validation.

[6]: `src/game/gameTypes.ts` and `src/game/buildings.ts` — prison fields, `PrisonGuard`, and capacity contract.

[7]: `src/components/SelectedBuildingPanel.tsx`, `src/components/SelectedEntityPanel.tsx`, `src/game/PopulationPanel.tsx`, and `src/game/uiSimSummary.ts` — player-facing prison presentation.

[8]: `tests/securityRoles.split.test.ts`, `tests/simulation.invariants.test.ts`, `tests/workforce.transitions.test.ts`, `tests/moonHowler.byTypeReuse.test.ts`, and `tests/moonHowler.cureWindow.test.ts` — focused regression coverage.

[9]: `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md` and `docs/AGENTS.md` — project authority, ownership, cadence, invariants, bug reporting, and validation rules.

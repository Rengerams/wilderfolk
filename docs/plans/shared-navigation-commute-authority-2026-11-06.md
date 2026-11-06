# Wilderfolk — Shared Navigation and Authoritative Commute Decisions

**Document type:** Wilderfolk feature/function architecture and executable Codebot plan (completed from `CODEBOT_FEATURE_TEMPLATE.md`)  
**Status:** PLANNED — NOT IMPLEMENTED; this document does not approve a merge  
**Proposed repository path:** `docs/plans/shared-navigation-commute-authority-2026-11-06.md`  
**Repository evidence:** `Rengerams/wilderfolk`, `main` at `2547a4d4165f81993113b095f67f27b710dcd405`, inspected 2026-11-06. PR #126 was **merged** when this plan was prepared. Re-check HEAD before any coding.  
**Authority:** `AGENTS.md`, `docs/command.md`, `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts` take precedence.  
**Delivery:** **ONE NEW, SEPARATE PR**, not an extension of #126. The three implementation stages below are review checkpoints/commits **within that one PR**, not three PRs to open automatically. No existing gameplay code was edited while preparing this plan.

> **Execution gate:** Re-read `AGENTS.md` and `docs/command.md` in full, verify PowerShell with `$PSVersionTable.PSVersion.ToString()` in the actual developer shell, re-check `main` and all relevant files immediately before editing, then implement against the latest code. Source facts below are verified at the cited snapshot; proposed signatures and changes are intentionally labelled **TO-BE**. No generated APIs are asserted to exist today.

---

## 0. Feature contract — fill before code

| Field | Required answer |
| --- | --- |
| Feature name | Shared navigation with one authoritative route/travel-time result for movement, work, schools and household relocation |
| User-visible result | Settlers reuse known walkable routes; jobs, schools and house moves are chosen using the same map-aware travel-time evidence that informs actual walking, without changing existing jobs or triggering unnecessary relocations. |
| Origin / priority | Direct user request on 2026-11-06 following review of commute code and discussion of shared routes and relocation; separate from the now-merged PR #126. |
| Target version | **V.0.6.5.2**, as stated in current `AGENTS.md` (current working version **V.0.6.5.1**). No version bump as part of this plan. |
| Authoritative design | This document §§1–4; existing canonical owner registers and `docs/plans/persistent-automatic-workforce-2026-11-06.md` supply protected baseline rules. |
| Current status | **PARTIALLY IMPLEMENTED**: terrain-aware A*, per-walker waypoint caching, a commute cost cache and two-hour workforce eligibility already exist; sharing path geometry between settlers and consistent school/housing travel decisions do not. See §1. |
| Main simulation owner | **KEEP** `src/game/pathfinding.ts` for grid, A*, route geometry and transient route caches; **KEEP** `src/game/commuteReach.ts` for hour conversion and eligibility; **KEEP** separate existing domain writers for jobs (`workforce.ts`), school (`education.ts`), housing (`housingPipeline.ts`) and motion (`humanMovement.ts`/`humanTick.ts`). |
| State affected | Reads `WorldState.worldMap`, `buildings`, entity positions and `residenceBuildingId`, `workerBuildingId`, `schoolBuildingId`. Existing writers may make different **valid** assignments or relocations, but **no new saved field** is proposed. Path results and caches are transient. |
| Existing save compatibility | Preserve `gameTypes.ts`, `saveSchema.ts` and saved `Entity`/`WorldState` formats. Rebuild route caches on load/map change; never clear an existing job or school simply because a quote is unresolved. Explicit saved-state tests required. |
| Scope excluded | No general flow-field engine, new navigation manager, AI traffic simulation, new tick layer, arbitrary 150 px steering retune, changes to work-hour limits, job transfer cooldown, school capacity/hours, household custody, food balance, or broad UI redesign. |
| Delivery approach | **One standalone PR**, in three internal checkpoints: **A** canonical route outcome/shared cache; **B** single travel-time authority for assignment, schooling, relocations and bot preview; **C** walking-path reuse, benchmarks and final cutover. No checkpoint is merged or declared feature-complete in isolation. |

**Problem:** `pathfinding.steerWithPath` has a 4,096-entry *per-walker key* waypoint cache, while `commuteReach.routeCommuteHours` separately caches route costs. `education.findSchoolForChild` uses `commuteDistanceFromResidence` + straight-line `commuteLeadHoursFor` to choose a school. `housingPipeline.cachedCommuteHours` calls `estimatedCommuteHours`, whose unresolved-route fallback is a straight-line estimate. In `commuteReach`, bot preview budget exhaustion can be cached as `Infinity` (indistinguishable from disconnected terrain). These are different answers to one world-navigation question. Evidence: `pathfinding.ts` ~790–973; `commuteReach.ts` ~137–291; `education.ts` ~92–161; `housingPipeline.ts` ~1906–2021; `virtualPlayer.ts` ~690–719.

**Solution:** Extend the **existing pathfinding owner** with a bounded, shared, grid-generation-scoped immutable route quote (path geometry **and** weighted cost when known), with explicit `priced | unreachable | pending` status; do not build another A*. `commuteReach.ts` translates that quote to hours and the existing two-hour eligibility policy. Integrate the resulting **one route verdict** at the existing motion, workforce, school, housing and virtual-player call sites. Keep individual waypoint progress local to each walker; share only immutable geometry/cost, with correct endpoints and invalidation.

**Risks:** Stale cached routes after road/bridge/wall/terrain changes; reuse of geometry from an incompatible start tile; incorrectly calling budget exhaustion an impossible route; mispricing short final approaches or road/slope speed; expensive `households × candidate houses × destinations` route searches; school churn or pupils losing their seat while routes are pending; existing incumbents losing jobs; 1,000–2,000-settler CPU/memory regression; mutable cache crossing worker/save reset boundaries. Mitigate with one route owner, typed verdicts, strict cache keys/invalidation, preserved eligibility and hysteresis, bounded work and real seeded tests.

**Done means:**
1. The pathfinding owner returns a cost + usable route for priced legs, and distinguishes proven impossible legs from incomplete/budget-exhausted searches. Neither `pending` nor missing grid is silently treated as a confirmed short commute.
2. Two settlers using the **same valid start/goal tile pair** can reuse a shared route without a second A* search; no mutable `nextIndex`/progress is shared.
3. Job hires/transfers and school choices use canonical walkable-route travel time, respecting the existing two-hour reach threshold, school capacity, employment and school-retention policies.
4. Optional home moves and swaps compare every affected member's work/school route, retain existing improvement/hysteresis/custody safeguards and **never move** on unpriced evidence.
5. Actual walking uses valid shared geometry and the same path-cost authority; grid mutation/load invalidates stale results and does not create water/wall crossings.
6. Existing saves, worker mode, main-thread fallback, reproducible deterministic outcomes and unchanged legitimate job/school assignments survive targeted regressions.
7. Fixed-seed performance results for 100/500/1,000/2,000 settlers demonstrate actual A* reduction where routes repeat, without unacceptable tick-time or memory regression; publish measurements, not invented percentages.

### 0.1 Non-goals and invariants

- **Non-goals:** No new custom world/route scheduler; no persistent “learned paths” history; no speculative full-map flow fields; no general rework of every non-commute navigation caller; no removal of `LONG_RANGE_DIST: 150` merely because it was discussed.
- **Must not change:** `MAX_ASSIGNABLE_COMMUTE_HOURS = 2`; `WORK_COMMUTE_RUSH = 3.5`; normal arrival collision/stand-point rules; existing shift windows; school hours 09:00–15:00; 60-day automatic-work transfer cooldown; workforce career continuity; household/custody/leader-protection and housing-move thresholds. Only the **evidence and ordering** used by current decision owners changes intentionally.
- **Game semantics:** Open-ended colony simulator; route failure does not create an artificial win/loss state or force a warning popup.
- **Evidence:** Each as-is claim uses actual paths/functions at the repository SHA above. All `getShared...`, `NavigationQuote` and similar design types in TO-BE are **proposals**, not current functions.

## 1. Mandatory repository reconnaissance

**Verified remotely:** `AGENTS.md`, `docs/command.md`, `package.json`, `OWNERSHIP_OVERVIEW.md`, `decisionRegistry.ts`, relevant source/test excerpts and the merged PR #126. **Not verified:** executing the developer's PowerShell, local build/test output, CI status for this prospective PR, FPS or A* benchmarks. The implementing agent must follow the repository shell protocol before making changes.

**Evidence ledger (actual symbols, current source):**

| Existing responsibility | Canonical owner + entrypoint | Caller / cadence | Reads / writes | Reuse/extend decision |
| --- | --- | --- | --- | --- |
| Map and tile travel weights | `pathfinding.ts`: `getPathGrid`, `getReadOnlyPathGrid`, `buildPathGrid`, `searchRoute`, `findRouteCostOutcome` | `setCurrentPathMap` from `humanTick.tickHumans` and route requests on demand | Map, walls, bridges, road surfaces, elevation; **no saved writes** | **MODIFY** only existing A* result/caching, no second search implementation |
| Walking route and per-walker progress | `pathfinding.ts`: `steerWithPath`, `pathCache`; `humanMovement.ts`: `commuteHumanToBuilding` | Human realtime tick (each tick) | Reads positions/destination; `steerWithPath` writes `entity.vx/vy`; human loop owns applying step | **MODIFY** to consume immutable shared route geometry, **KEEP** local progress |
| Route-cost/eligibility budget | `commuteReach.ts`: `routeCommuteHours`, `estimatedCommuteHours`, `isWithinAssignableCommute`, `beginCommuteRoutePass`, `wereCommuteRouteChecksDeferred` | Assignment/housing pulses, staffing and bot previews | Reads path grid/positions/buildings/speed; writes only transient budgets/caches | **MODIFY** to use priced/unreachable/pending union; no competing A* cost cache |
| Automatic jobs | `workforce.ts`: `assignWorkerInPlace`, `pickWorkerToTransfer`, `assignMissingWorkers` | `tickLayerAssign`; forced/event-driven staffing | Reads homes, skills, job buildings, two-hour verdict; writes `workerBuildingId`, job and occupants via workforce transitions | **MODIFY** eligibility/ranking only; job writer unchanged |
| School enrollment | `education.ts`: `findSchoolForChild`, `syncSchoolAssignments` | `humanTick.tickHumans`, new-calendar-day review | Reads staffed schools, distance, capacity; writes `child.schoolBuildingId` | **MODIFY** route evaluation and pending handling; keep existing seat policy |
| Household commute evaluation | `housingPipeline.ts`: `cachedCommuteHours`, `pupilsKeepSchoolReach`, `pickCommuteRelocation`, `commuteSwapIsWorthwhile`, `relocateHouseholdsForCommute` | `assignMissingResidences`, existing housing assignment sweep | Reads member job/school IDs, home candidates, occupancy; writes residences through `applyRelocation`/`relocateHousehold` | **MODIFY** route verdicts and safe candidate selection; no new residence writer |
| Assignment orchestration | `tickLayerAssign.ts`: `tickLayerAssign` | `gameTick.ts`, every 6 simulation hours, at 03/09/15/21 | Housing signature; delegates housing and staffing writers | **KEEP** cadence and fingerprint, adjust affected map signature when needed |
| School departure / work departure | `humanTick.ts`: `tickHumans`; `humanMovement.ts`: `commuteDistanceFromResidence`, `commuteDistanceToBuilding` | Realtime; conditional shift/school branch | Reads current/home position, schedule; sets velocity/needs via established owners | **MODIFY** departure estimate read, without new tick or state writer |
| Food site reach preview | `virtualPlayer.ts`: `decideFood` local `canCrewNewFoodSite` | Bot choice once per game hour when enabled (`decisionRegistry`) | Reads proposed spot and read-only map; returns an action proposal; `writes: []` | **MODIFY** preview to use explicit verdict; no bot world mutation |
| Save/load and worker | `saveLoad.ts`: `loadGameFromParsedOutcome`; `gameLoop.ts` + `simWorker/gameWorker.ts` | Load/import or tick | Persist current world; use separate process-local caches | **KEEP** data schema; invalidate only transient navigation data |
| Metric owner | `pathfindingMetrics.ts`: `getPathfinderReport`, `recordFindPathCall`, `recordPathNodes`, `recordPathCacheHit/Miss` | Instrumented pathfinder calls | Counters only | **EXTEND if needed** for shared-cache hits/bytes; never fabricate perf counters |

**Architecture conflict check:** Already *two kinds* of caches: a walker-keyed waypoint cache in `pathfinding.ts` and a grid-keyed commute cost cache in `commuteReach.ts`. They serve different needs, but duplicate A* results and can disagree on incomplete searches. Keep policy in commute owner; move the reusable **route result** to `pathfinding.ts`, without moving worker/school/housing decisions away from existing writers.

### 1.1 Current architecture — AS-IS (verified code only)

```text
GameLoop gameTick / worker gameTick
  -> gameTick.ts gameTick
     -> tickLayerRealtime.tickLayerRealtime -> humanTick.tickHumans (every tick)
        -> pathfinding.setCurrentPathMap(worldMap, buildings)
        -> humanMovement.commuteHumanToBuilding
           -> pathfinding.steerWithPath
              -> pathfinding.walkRoute/searchRoute  [walker-key waypoint cache]
           -> human loop applies movement velocity/step
        -> education.syncSchoolAssignments (new-calendar-day path)
           -> education.findSchoolForChild
              -> humanMovement.commuteDistanceFromResidence
              -> commuteReach.commuteLeadHoursFor [straight-line school selection]
     -> tickLayerAssign.tickLayerAssign (03:00, 09:00, 15:00, 21:00)
        -> housingPipeline.assignMissingResidences
           -> relocateHouseholdsForCommute / pickCommuteRelocation / swaps
           -> commuteReach.estimatedCommuteHours
              -> commuteReach.routeCommuteHours -> pathfinding.findRouteCostOutcome
              -> on null: straightRouteCost fallback
           -> housingPipeline.applyRelocation / moveResident [residence writer]
        -> workforce.assignMissingWorkers -> assignWorkerInPlace / pickWorkerToTransfer
           -> commuteReach.isWithinAssignableCommute
              -> commuteReach.routeCommuteHours -> pathfinding.findRouteCostOutcome
           -> workforce.assignWorkerTransition [job writer]
Virtual Player on-demand -> decideVirtualPlayerAction -> decideFood
  -> canCrewNewFoodSite -> isWithinAssignableCommute(worldMap override)
  -> pathfinding.getReadOnlyPathGrid / bounded preview outcome
  -> typed command if an action is selected; proposal itself is read-only
```

**Actual clock:** `gameConstants.Time.TICKS_PER_HOUR = 12`, so `TICKS_PER_DAY = 288`; `tickLayerAssign.LAYER_ASSIGN_INTERVAL = 6 * TICKS_PER_HOUR = 72` ticks. Comments mentioning an older 3-tick/hour era are not authority; use the constants.

| Current file + exact function | Called by/cadence | Input → output | Fields read | Fields written | Deficiency/reuse |
| --- | --- | --- | --- | --- | --- |
| `pathfinding.ts:searchRoute` | `walkRoute`, `findRouteCostOutcome` on demand | `PathGrid`, tile endpoints, node limit → private `{path,cost,hitNodeCap}` | Grid occupancy/roads/elevation | `[]` gameplay; transient workspace | **KEEP** canonical A*, expose coherent outcome to other owners |
| `pathfinding.ts:steerWithPath` | `commuteHumanToBuilding`, others per movement tick | Entity, target, speed, walker key → `arrived/path/direct/blocked` | Grid, walker cache | Entity `vx/vy`, facing; transient cache | **MODIFY** shared geometry read; no extra movement writer |
| `commuteReach.ts:routeCommuteHours` | Staffing, housing, preview | Coordinates/speed/grid → `number | null` | Grid, budget/cache | Transient cache/budget only | **REPLACE internal verdict**; currently mixes unknown/no-route and path cost |
| `commuteReach.ts:estimatedCommuteHours` | Housing commute | Home/target/buildings/speed → hours | Grid, roads | `[]` | **REPLACE policy-grade fallback**; null currently becomes straight-line time |
| `commuteReach.ts:isWithinAssignableCommute` | Workforce and bot | Settler/site/map → boolean | Residence, path, speed | `[]` | **MODIFY** to typed answer at callers; boolean convenience cannot conceal `pending` |
| `workforce.ts:assignWorkerInPlace` | Existing staffing pulse/command | Candidate workers and building → assigned boolean | Residence, skill, straight-line rank | Workforce-authorized writes | **MODIFY** navigation ordering after cheap lower-bound filter |
| `education.ts:findSchoolForChild` | `syncSchoolAssignments` at enrollment/review | Child + schools → selected school | Current school, seat count, straight line | `[]` | **MODIFY** walk-route eligibility and meaningful-transfer ranking |
| `housingPipeline.ts:pickCommuteRelocation` | Housing commute phase | Household + candidate homes → ID or undefined | Assignments, occupancy, route estimates | `[]` (selector) | **MODIFY** pending handling, compare confirmed times only |
| `housingPipeline.ts:applyRelocation` | Housing phase | Valid plan → relocation | Household/ledger/occupancy | Residence IDs and rosters | **KEEP** sole relocation writer |
| `humanTick.ts:tickHumans` | Realtime tick | World + context → void | Current targets, school/work schedule | Existing motion/needs decisions | **MODIFY** read-only departure quote at trip start, not per-tick A* |

**Current function calls and ownership:** Grid/A* belong to `pathfinding.ts`, travel-time caps to `commuteReach.ts`, job mutations to `workforce.ts`, school mutations to `education.ts`, relocation mutations to `housingPipeline.ts`, and movement integration to `humanMovement.ts`/`humanTick.ts`. These are registered in `OWNERSHIP_OVERVIEW.md` (movement, commute, workforce and school rows) and `decisionRegistry.ts` (`school`, `workforce`, `housing`, `virtualPlayer`). There is **no existing** shared immutable route-geometry owner separate from the walker cache; do not invent one.

**Current behavior and limits:** 4,096 entries for `pathfinding.pathCache`; 4,096 entries for `commuteReach.routeCostCache`, per-grid weak keys; maximum 256 ordinary commute searches per assignment pass, 4,000 nodes initially, one advanced retry per pass, up to 131,072 terminal nodes. A terminal complexity refusal is currently cached as `Infinity` even though it is not a proof of disconnection. `getReadOnlyPathGrid` has a separate projection cache; map load explicitly sets `currentGrid` before staffing. Runtime FPS, A* calls per colony and memory **NOT MEASURED** here. Existing regression files include `tests/commuteRouteEstimate.test.ts`, `tests/workforce.persistentCommute.test.ts`, `tests/workforce.deferredCommuteRetry.test.ts`, `tests/residenceCommuteRelocation.test.ts`, `tests/school.test.ts`, and `tests/saveLoad.commuteGrid.test.ts`.

**Problem location:** Separation of `pathfinding.steerWithPath` geometry vs `commuteReach.routeCommuteHours` cost, `education.findSchoolForChild` straight-line eligibility, `housingPipeline.estimatedCommuteHours` straight-line policy fallback, and bot-preview `Infinity` cache on search-budget exhaustion. These are source-proven divergent cases, not measured gameplay symptoms.

### 1.2 Baseline and protected behavior

| Existing contract | Current evidence | Must remain? | Regression test |
| --- | --- | --- | --- |
| Work post must be reachable within two hours from home; unhoused uses current position | `commuteReach.MAX_ASSIGNABLE_COMMUTE_HOURS`, `isWithinAssignableCommute` | **YES**, but use proven route not guessed line | `tests/workforce.persistentCommute.test.ts` |
| Existing job, skills and career progress survive path failures | `workforce.assignMissingWorkers` + persistent employment plan | **YES** | `tests/workforce.persistentCommute.test.ts`, `tests/workforce.deferredCommuteRetry.test.ts` |
| Genuine unreachable and budget-exhausted routes differ | `findRouteCostOutcome.budgetExhausted`; partial retries | **INTENTIONAL REPAIR**: preserve distinction all the way to callers | `tests/commuteRouteEstimate.test.ts` (extend) |
| School capacity, current seat protection and 09:00–15:00 weekday attendance | `education.syncSchoolAssignments`, `isSchoolTime` | **YES**, route cost replaces Euclidean selection only | `tests/school.test.ts` |
| Household moves only as a whole, guarded by capacity/custody/leader rules | `housingPipeline.relocateHousehold`, `HOUSING_PHASE_ORDER` | **YES** | `tests/residenceCommuteRelocation.test.ts`, `tests/housingAuthority.pipeline.test.ts` |
| Existing relocation saving/improvement/no-member-regression thresholds | `pickCommuteRelocation`, `commuteSwapIsWorthwhile`, `RELOCATION_*` constants | **YES**; compute thresholds from confirmed quotes | `tests/residenceCommuteRelocation.test.ts` |
| No tunneling through blocked cells; roads and elevation priced by pathfinder | `pathfinding.searchRoute`, `steerWithPath`, `isWalkStepAllowed` | **YES** | `tests/commuteRouteEstimate.test.ts`; movement/path tests discovered before edits |
| One human step integration only | `humanMovement.commuteHumanToBuilding` + `humanTick` loop | **YES** | Existing movement/simulation regressions |
| Assignment four times/day, with fingerprint/weekly safety audit | `tickLayerAssign.tickLayerAssign` | **YES** | `tests/residency.dayBoundary.budget.test.ts` |
| Saves load without stale old-map grid | `saveLoad.loadGameFromParsedOutcome` | **YES** | `tests/saveLoad.commuteGrid.test.ts` |

**Preserved special cases:** The current no-map bootstrap fixtures may need an explicitly documented legacy fallback. It must **never** be used to prove eligibility when a real world map exists but a search is pending. School/work ranking and 2-hour checks must be based on the same quote, while allowing existing minimum-one-hour *lead* and final-approach pacing semantics. Existing lower bounds may exclude impossible candidates but never establish actual accessibility.

## 2. Target architecture — TO-BE (single canonical pipeline)

```text
KEEP: existing gameTick / tickLayerRealtime / tickLayerAssign / bot command owners
        |
        v
KEEP: existing per-domain scheduling and domain candidate indexes
        |
        v
KEEP + MODIFY: pathfinding.ts current/read-only PathGrid and one A* searchRoute
        |
        v
NEW PUBLIC API INSIDE EXISTING OWNER: pathfinding.getNavigationQuote
        -> cached immutable {priced: weighted cost + legal path}
        -> {unreachable: complete search proved no route}
        -> {pending: exhausted budget/unavailable grid; retry policy}
        |
        +--> MODIFY: commuteReach.ts quote-to-travel-time + 2-hour rule
        |       -> KEEP workforce.ts writer / education.ts writer / housingPipeline.ts writer
        |       -> KEEP virtualPlayer.ts read-only proposal
        |
        +--> MODIFY: pathfinding.steerWithPath uses the identical legal geometry
                -> KEEP humanMovement.ts velocity and humanTick.ts single step
        |
        v
KEEP: existing WorldState saves, worker confirmation and render projections
```

**Single source of truth:** `pathfinding.ts` alone decides tile legality, route search, weighted tile cost, immutable route identity/invalidation, and shared-route cache. `commuteReach.ts` alone converts weighted cost to predicted travel hours and enforces the existing 2-hour policy. Domain owners retain authority over **whether** to assign, enroll, move or keep incumbents. No new writer or timer.

**Proposed canonical typed route API** (NEW, location `src/game/pathfinding.ts`; **exact spelling is a proposal**):

```ts
export type NavigationQuote =
  | { readonly status: 'priced'; readonly costTiles: number;
      readonly tiles: readonly Readonly<{ x: number; y: number }>[] }
  | { readonly status: 'unreachable' }
  | { readonly status: 'pending'; readonly reason: 'search-budget' | 'node-budget' |
      'complexity-cap' | 'no-grid' };

export function getNavigationQuote(
  grid: PathGrid | null,
  start: Readonly<{ x: number; y: number }>, // tile coordinates
  goal: Readonly<{ x: number; y: number }>,  // tile coordinates
  limits: Readonly<{ maxNodes: number }>,
): NavigationQuote; // no WorldState mutation; transient bounded cache in pathfinding.ts
```

**Design constraints on this API:** Under the hood reuse `searchRoute`/`walkRoute`; **do not run a separate cost-only A*** for the same route. A `priced` result records the cost of the **actual returned safe route**, not a fictitious optimal path if bounded A* recovery used a less-informed heuristic. `pending` means no defensible completed path cost is known; movement must not cross a barrier to disguise it. Verify destination/start cell validity, `findNearestWalkable` endpoint snapping and legal final approach: snapping to an adjacent cell cannot silently prove a blocked building is reachable. Preserve slope-direction asymmetry in the key; do **not** reuse reverse routes unless separately proven equivalent. A cached route is identified by path-grid generation **and directed start/goal tiles**. Immutable shared arrays are never advanced in place; each walker owns only a `nextIndex`/progress cursor. For distinct points within the same tile, validate/pay for the first and last real-world segment rather than pretending zero distance.

**Proposed commute verdict** (MODIFY `commuteReach.ts` as the only travel-time policy owner):

```ts
export type CommuteVerdict =
  | { readonly status: 'priced'; readonly travelHours: number;
      readonly leadHours: number; readonly costTiles: number }
  | { readonly status: 'unreachable' }
  | { readonly status: 'pending'; readonly reason:
      'search-budget' | 'node-budget' | 'complexity-cap' | 'no-grid' };

// Proposed replacement for policy-grade direct routeCommuteHours / estimatedCommuteHours.
export function quoteCommute(
  origin: Readonly<{ x: number; y: number }>,
  destination: Readonly<{ x: number; y: number }>,
  walkSpeed: number,
  grid: PathGrid | null,
): CommuteVerdict;
```

`travelHours` must be **uncapped and finite** for comparing nearby alternatives; `leadHours` uses existing `commuteLeadHoursFor` minimum/cap semantics for scheduling. Actual movement is discrete and includes final approach, so this is a *bounded travel estimate*, not a promise of exact arrival on a tick. The 2-hour decision uses the canonical quote and the existing policy threshold. Implementers should simplify the type of `reason` to a direct shared type if available, without inserting pointless aliases or circular imports.

**Explicit pending policy:** A still-priced route never becomes confirmed unreachable just because the A* node/time cap was reached. Deferred jobs, school switches, relocations and bot placements must remain **undecided**, not accepted/rejected as disconnected. Retry using the existing assignment/event pulse and bounded escalating attempts; once the **terminal complexity cap** is reached, keep a distinct transient `pending/complexity-cap` result and retry only after relevant grid/endpoint change or an explicit bounded request, **not** a fresh full search on every pulse. Incumbents retain valid state. A completely explored, disconnected graph returns `unreachable`. Missing grid in actual running simulation is `pending/no-grid`; isolated pre-map fixtures can opt into a narrowly documented bootstrap rule outside the route API.

### 2.1 Module and state ownership — mandatory

| Module | CREATE/EDIT/KEEP | Only responsibility | Public functions | Permitted persisted writes | Called from |
| --- | --- | --- | --- | --- | --- |
| `src/game/pathfinding.ts` | **EDIT** | Unique A*, legal path and cost, shared immutable route cache, invalidation | **NEW proposed** `getNavigationQuote`; **MODIFY** `steerWithPath`, `setCurrentPathMap`, `resetPathGridCaches`; **KEEP** existing `findPath` and other direct consumers via same internal search owner | `[]`; existing `steerWithPath` may set entity velocity/facing, as today | `commuteReach.ts`, `humanMovement.ts`, existing navigation users |
| `src/game/commuteReach.ts` | **EDIT** | Conversion from weighted route cost to commute hours, two-hour threshold, search budget and pending retry policy | **NEW proposed** `quoteCommute`; **MODIFY** `isWithinAssignableCommute` or migrate its callers; **KEEP** `commuteLeadHoursFor`, `straightLineCommuteLowerBoundHours` | `[]` | `workforce.ts`, `education.ts`, `housingPipeline.ts`, `humanTick.ts`, `virtualPlayer.ts` |
| `src/game/workforce.ts` | **EDIT** | Existing vacancy/transfer selection and job assignment | `assignWorkerInPlace`, `pickWorkerToTransfer`, `assignMissingWorkers` | Existing `workerBuildingId`, job, occupation, staff rosters only | `tickLayerAssign.ts`, existing commands/events |
| `src/game/education.ts` | **EDIT** | Enrollment/capacity/retention and attendance | `findSchoolForChild`, `syncSchoolAssignments` | Existing `schoolBuildingId`, school attendance fields only | `humanTick.ts` |
| `src/game/housingPipeline.ts` | **EDIT** | Household selection, thresholds, swaps and sole relocation mutation | `pickCommuteRelocation`, `commuteSwapIsWorthwhile`, `relocateHouseholdsForCommute`, `applyRelocation` | Existing residence IDs and occupant rosters only | `tickLayerAssign.ts`, existing immediate housing events |
| `src/game/humanTick.ts`, `src/game/simulation/humanMovement.ts` | **EDIT** | Current trip target, shift departure and single movement integration | `tickHumans`, `commuteHumanToBuilding`; other motion functions retained | Existing entity velocity/position/indoor flags as presently owned | `tickLayerRealtime.ts` |
| `src/game/virtualPlayer.ts` | **EDIT** | Read-only bot site/crew reach preview | `decideVirtualPlayerAction`, `decideFood` private reach check | `[]` | `useVirtualPlayer` bot cycle |
| `src/game/pathfindingMetrics.ts` | **EDIT if metric proven missing** | Real A* and shared cache metrics only | Existing report functions, narrow new counters if essential | `[]` game state | `pathfinding.ts` instrumentation |
| Existing save, worker, renderer files | **KEEP** | Existing transfer, canonical world persistence and presentation | Existing APIs, no new nav payload | No new writes | Existing owners |

**No new standalone manager or shared mutable singleton.** Enhance the existing pathfinding cache and reuse that owner's grid identity. Both architecture registers must list **every actually touched/new function**; `decisionRegistry.ts` is updated in the implementation PR with existing `school`, `workforce`, `housing`, `virtualPlayer` entries and a new read-only navigation key **only if** its distinct authority is meaningful under the registry's major-decision convention. Never invent a scheduler cadence or attribute residence/job writes to pathfinding.

### 2.2 Core contracts and decisions

| Question | Concrete design decision |
| --- | --- |
| Trigger | Walking: existing `humanTick` realtime branch. Jobs/housing: existing `tickLayerAssign` four daily pulses and current explicit event paths. School review: existing `humanTick` new-day path. Bot: existing on-demand choice. Navigation itself has **no tick**; it calculates on request. |
| Eligibility and guards | Valid bounds, walkable actual endpoint/entry, same live or explicitly supplied read-only grid, finite positive movement speed, school staff+capacity, work >2 h rejection, retention of incumbents, whole-household move guards. `pending` never proves eligibility. |
| Input/calculation | Directed start/goal tiles + terminal point adjustment; existing A* occupancy, roads, bridges, cliffs and elevation; reuse weighted `costTiles` to compute uncapped `travelHours`; existing `commuteLeadHoursFor` for departure, existing max-two-hours for eligibility. Lower-bound straight line only to cheaply reject clearly impossible candidates. |
| State transition | Example: `home A + job X + route A→X priced at 1.8h`, proposed home B route B→X=0.6h and every pupil remains reachable, household checks pass → `housingPipeline.applyRelocation` moves **whole household** once. Budget pending or a modest improvement → no move. |
| Sole writers | `pathfinding` may only update transient caches and existing walker velocity in steering; `workforce` only job fields; `education` only school fields; `housingPipeline` only residence fields; actual movement integration stays existing. |
| Existing systems | No manual job controls restored; no job reset due to blocked route; no admission or production balance rewrite; pupil attendance still requires real physical presence and teacher. |
| UI / feedback | Existing jobs, schools, residents and path motion reflect the resulting world. No new UI required. Existing diagnostic reports may count `pending` separately; no view writes gameplay state. |
| RNG | **None** in route pricing/reuse. Deterministic candidate order and explicit ID ties; do not consume `simRng`. |
| Save/worker | **No persisted navigation cache or new delta field.** Both worker and fallback calculate from current world/map; on load/map swap clear stale transient results. |
| Complexity/memory | Replace duplicate searches with bounded reuse. **Proposed** max 1,024 shared route entries and max 131,072 stored path tiles in aggregate (evict oldest when either cap reached), or stricter values justified by benchmark. Keep/revise existing 256/pass and node budgets, preserving progress on deferred work. No per-tick O(population×buildings) searches. |

**State transition and idempotency:** Repeat the same housing pulse on an unchanged fully priced world → same residence IDs, no extra moves; repeat the same job/school request with confirmed unchanged route → same assignments; a new road/bridge version invalidates previous route evidence; a `pending` request makes **no** speculative saved-state change. Where current legitimate no-map fixtures must continue working, explicitly guard that exceptional environment; do not leak it to real maps.

### 2.3 AS-IS → TO-BE function and module migration map — required

| AS-IS owner/function | Action | TO-BE owner/function | Direct callers/imports changed | Persisted writes | Stage within new PR | Cutover + test |
| --- | --- | --- | --- | --- | --- | --- |
| `pathfinding.searchRoute` + `walkRoute` | **MODIFY** | Same unique A* core, exposes full outcome internally | Internal `findPath`, `findRouteCostOutcome`, `steerWithPath`, new route quote | `[]` | A | No duplicate cost-only A*; `tests/commuteRouteEstimate.test.ts` |
| `pathfinding.pathCache` (walker key) | **MODIFY** | Shared immutable route quote cache **in `pathfinding.ts`** + existing walker cursor | `steerWithPath`, `setCurrentPathMap`, reset | `[]` | A/C | Same-key second walker no extra A*, path progress independent; NEW targeted test |
| No typed three-way public route outcome | **NEW** | `pathfinding.getNavigationQuote` **proposed** | `commuteReach.quoteCommute`, `steerWithPath` | `[]` | A | Full search vs node exhaustion vs disconnection; NEW test |
| `commuteReach.routeCommuteHours` cost-only route cache | **REPLACE internal implementation** | `commuteReach.quoteCommute` **proposed** delegates unique pathfinder result | `estimatedCommuteHours`, `isWithinAssignableCommute`, domain callers migrate | `[]` | A/B | Remove competing cost cache where redundant, no hidden null fallback |
| `commuteReach.estimatedCommuteHours` numeric housing API | **MODIFY/RETIRE for policy** | Typed `CommuteVerdict` from `quoteCommute` | `housingPipeline.cachedCommuteHours` etc | `[]` | B | No straight-line final answer on pending; update existing test that expects legacy fallback |
| `commuteReach.isWithinAssignableCommute` boolean | **MODIFY or RETIRE boolean at high-stakes callers** | Typed quote + existing 2h rule, keep boolean only if it never masks pending | `workforce`, `virtualPlayer` | `[]` | B | Unknown is explicitly deferred, not misclassified |
| `education.findSchoolForChild` straight-line distance | **MODIFY** | Same owner, route-aware selection and retention | `syncSchoolAssignments` (school writer) | `[]` pure picker | B | Route detour/unreachable and pending seat hold; `tests/school.test.ts` |
| `workforce.assignWorkerInPlace` straight-line rank and route gate | **MODIFY** | Same owner using confirmed commute price and existing eligibility/skills | `assignMissingWorkers` | Workforce fields through existing transitions | B | Existing jobs and skill rules; `tests/workforce.persistentCommute.test.ts` |
| `workforce.pickWorkerToTransfer` Euclidean tie | **MODIFY** | Same owner: keep skill first, route cost for eligible travel tie | Existing transfer flow | Existing workforce fields | B | Cooldown/donor protections unchanged; existing transfer tests |
| `housingPipeline.cachedCommuteHours`, `pupilsKeepSchoolReach`, `pickCommuteRelocation`, `commuteSwapIsWorthwhile` | **MODIFY** | Same owner with typed quote cache and no pending-based decision | `relocateHouseholdsForCommute`, `planRelocation` | `[]` for selectors | B | Whole-household, thresholds, no speculative move; `tests/residenceCommuteRelocation.test.ts` |
| `housingPipeline.applyRelocation`, `moveResident` | **KEEP** | Exactly same residence writer | Existing housing phases | Residence IDs/occupancy | B | No second housing mutation; housing authority tests |
| `virtualPlayer.decideFood` → local `canCrewNewFoodSite` | **MODIFY** | Same read-only bot owner using proposed-world navigation quote | `decideVirtualPlayerAction` | `[]` | B | Preview does not touch live cache/budget; existing bot tests |
| `humanMovement.commuteHumanToBuilding` → `pathfinding.steerWithPath` | **MODIFY** | Same movement/steering owners using quoted shared geometry and walker cursor | `humanTick.tickHumans` | Existing velocity/facing only | C | No double movement, no obstacle corner cutting; targeted movement tests |
| `humanTick.tickHumans` commute/school lead reads | **MODIFY** | Same realtime owner; use price when available at trip start, no per-tick A* per human | `tickLayerRealtime` | Existing movement fields only | C | Arrival timing and school attendance; school/shift tests |
| `tickLayerAssign.tickLayerAssign` and domain signatures | **KEEP / minimal MODIFY** | Same cadence, invalidation after relevant map changes | Existing housing/workforce calls | Existing domain writes | B/C | Four pulses/day; `tests/residency.dayBoundary.budget.test.ts` |
| `saveLoad.loadGameFromParsedOutcome`, `pathfinding.setCurrentPathMap` | **KEEP / VERIFY** | Existing load reset + shared cache invalidation | Existing load, worker host | No schema change | C | `tests/saveLoad.commuteGrid.test.ts` |

**Public contracts and permissions:** `pathfinding.getNavigationQuote(grid,start,goal,limits): NavigationQuote` (NEW proposal; pure gameplay read, bounded transient cache write); `commuteReach.quoteCommute(origin,destination,walkSpeed,grid): CommuteVerdict` (NEW proposal; no persisted writes); `commuteReach.commuteLeadHoursFor(distance,walkSpeed,rush?): number` (**EXISTING**, unchanged clock policy); `workforce.assignWorkerInPlace(...): boolean`, `education.findSchoolForChild(...): Building | undefined`, `housingPipeline.pickCommuteRelocation(...): number | undefined`, `pathfinding.steerWithPath(...): 'arrived'|'path'|'direct'|'blocked'` (**EXISTING**, retain outward signatures where feasible). If a direct caller needs a new typed navigation argument, update caller and callee **together**; do not add compatibility aliases/re-exports.

**Old → new rule ownership:** Remove policy-grade use of `estimatedCommuteHours` straight-line fallback and school straight-line acceptance/ranking. Retain `straightLineCommuteLowerBoundHours` as a **necessary-only prefilter**, never as proof that walking is possible. Retain arrival velocity and building-edge handling with the movement owner. The exact A* core and grid construction stay under `pathfinding.ts`; commute speed conversion stays under `commuteReach.ts`.

**Dependency change:** Existing high layers `workforce/education/housing/humanTick/virtualPlayer` → `commuteReach.ts` → `pathfinding.ts` → `movementSteering.ts`/game types. `humanMovement.ts` → `pathfinding.ts`, as today. **Forbidden:** `pathfinding.ts` importing `commuteReach`, `education`, `housingPipeline` or `workforce`; a lower-level cache importing `gameTick` or the UI; domain writers calling each other to mutate saved state. Verify with `npm run audit:deps:cycles`.

**Cutover:** The **one new PR** must land with all high-stakes callers converted; the old boolean/numeric fallback branches cannot still authorize jobs/schools/moves. No partially merged foundation with conflicting live paths. Commit-by-commit verification is allowed, but final PR is atomic. No new timer and no dual movement integration.

### 2.4 Module boundaries and isolation — mandatory

| Module/bounded context | Owns | Input | Output | Allowed direct dependency | Forbidden writes/imports | Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| `pathfinding.ts` | Grid, exact A*, weighted path and immutable transient cache | `PathGrid`, directed tile/point endpoints, bounded node budget | `NavigationQuote` | `gameTypes`, terrain, existing movement speed primitive/metrics | No `WorldState` assignments, school/work/housing policy imports | On demand, no independent tick |
| `commuteReach.ts` | Pricing hours + 2h guard + per-assignment retry budget | Nav quote, travel speed, origin/destination | `CommuteVerdict`, lower bounds | `pathfinding`, clock, movement speed constant | No school/job/residence writes | Existing assignment/preview/read calls |
| `workforce.ts` | Existing staffing transitions | Candidate humans, buildings, commute verdict | Assignment/no assignment | `commuteReach`, worker skill/policy | No school/residence writes | Existing assignment/events |
| `education.ts` | Existing school enrollment/retention and attendance | Pupil, schools, quota, commute verdict | School/no change | `commuteReach`, school settings | No job/residence writes | Existing school review |
| `housingPipeline.ts` | Household candidate scoring and sole relocation | Household/work/school destinations, homes, quote cache | Move/stay and housing report | `commuteReach`, `housingModel` | No job/school writes | Existing housing phase |
| `humanMovement.ts`/`humanTick.ts` | Existing destination, steering and one step | Entity, target, navigation path, speed/clock | Velocity/arrival + established movement results | `pathfinding`/`commuteReach` | No independent route cost formula or 2nd position integrator | Existing realtime tick |
| `virtualPlayer.ts` | Bot command proposal only | World read-only map, candidate, reachable workforce origins | Typed proposal / none | `commuteReach`, existing bot rules | No direct WorldState mutation | Existing bot choice |

```text
KEEP GameLoop / worker -> gameTick -> tickLayerRealtime / tickLayerAssign
                                      |                    |
                    humanTick -> humanMovement             +--> workforce writer
                                      |                    +--> education writer (school review in humanTick)
                                      |                    +--> housingPipeline writer
                                      v                         ^  ^
                       pathfinding.steerWithPath                |  |
                                      |                         |  |
                           pathfinding.getNavigationQuote <----+--+-- commuteReach.quoteCommute
                                      ^                                  ^
                                      |                                  |
                          own A* + shared grid cache             virtualPlayer read-only preview

No reverse import from pathfinding to school/work/housing, and no second writer.
```

**Isolation checks:**
- **Single responsibility:** `pathfinding` says *where/how much*; `commuteReach` says *how many hours/under the cap*; each domain owner decides *who moves/works/attends*. No route cache in a brand-new manager.
- **Imports:** Only downward owner imports as diagrammed. `commuteReach` may import a *type* from `pathfinding`; `pathfinding` must never import `commuteReach`.
- **State:** Only existing writers touch saved fields. Shared route tiles are immutable; per-entity cursors are private navigation transients. No `WorldState` cache serialized.
- **Coordination:** Existing tick and event orchestration only; no `setInterval`, daily whole-world re-path, job reselection or separate housing scheduler.
- **Public consumers:** Update verified imports of `estimatedCommuteHours`/`isWithinAssignableCommute` **at the same time** their contracts change; no shim modules, aliases or re-exports.
- **Test isolation:** Unit tests on a `PathGrid` without WorldState; call-site integration for school, workforce, relocation, bot, human movement; run existing import/cycle audit.
- **Smallest split:** **No new module** is necessary; the already existing A* owner is the correct place to add one shared route result. Splitting an additional router adds indirection and would conflict with the repo's one-owner rules.

### 2.5 TO-BE acceptance and boundary proof

- **Previously impossible case:** A school lies 100 px across a river but 900 px away by the legal bridge. AS-IS school selector sees 100 px; TO-BE school picker uses the actual route and will not call it a two-hour trip if the priced route exceeds two hours. Residence scoring uses the same result.
- **Shared path proof:** Two co-resident workers take the same directed tile route to a common workplace: first query performs A*, second query uses immutable cached geometry; walker A advances waypoints without advancing walker B.
- **Pending proof:** Force 4,000-node exhaustion on a reachable detour; TO-BE returns `pending`, holds current job/school/house and retries at allowed existing boundary. It never caches a false `unreachable` verdict for the preview.
- **Single writer:** `workforce.assignWorkerTransition`, `education.syncSchoolAssignments`, and `housingPipeline.applyRelocation` remain the only assignment/move mutation paths for their fields. Old school/housing straight-line acceptance is removed.
- **Compatibility:** Valid old save round-trips without new path fields; old-grid cache cannot leak across restore or a read-only bot preview. Worker and fallback give the same route verdict and saved assignments.
- **Performance:** Count actual path-search calls, nodes and cache hits, tick durations, GC/memory for specified seeds; baseline **NOT MEASURED**, acceptance requires recording numbers before merge.
- **Registration:** Record exact touched symbols in `OWNERSHIP_OVERVIEW.md` and update actual `school`, `workforce`, `housing`, `virtualPlayer` decision entries (cadence/caller/writes/test files). A navigation key, if added, must be `on-demand`, `writes: []` and have real callers; the existing motion writer keeps its current velocity authority.

## 3. Persistence, migration and worker parity

**N/A — NO NEW PERSISTED STATE.** Route geometry, waypoint cursors, grid identity, path costs and retry budgets stay transient and are reconstructed from saved world geometry and existing assignments. Do not add keys to `gameTypes.ts`, `saveSchema.ts`, `simPrep.ts` or `simDelta.ts` for the cache. If an implementer later concludes a saved route field is necessary, **stop and amend this plan**; the PR introducing it must include type, schema, load normalizer, rollback/worker transport and tests in the same change.

| Fixture/scenario | Expected outcome | Test |
| --- | --- | --- |
| Fresh new-game world | Empty transient route cache, correct current map, routes populate on demand | Proposed `tests/navigation.sharedRoutes.test.ts` |
| Supported old save without new field | **No migration required**; existing world data supplies path grid | Existing `tests/saveLoad.commuteGrid.test.ts` |
| Old save with valid jobs/schools/homes | Valid IDs and occupants preserved; no automatic clearing due to `pending` | Existing save/workforce/school tests, extend |
| Corrupt/invalid route cache value | N/A — not saved; invalid route inputs handled as `pending` or validated reject | Proposed navigation unit test |
| load → save → load | Same canonical gameplay fields, caches rebuilt | Existing `tests/saveLoad.commuteGrid.test.ts` |
| Worker tick/delta + fallback | Same authoritative assignments/movement result for deterministic seed | Existing gameLoop/worker parity tests, targeted extension |
| Rollback snapshot + replay | No sharing of stale mutable cursor across worlds | Existing rollback tests + proposed route invalidation test |
| RNG snapshot | No new navigation RNG calls or changed RNG streams | New deterministic seeded integration test |

**Compatible versions:** Same support policy as `saveLoad.ts`/`AGENTS.md` at implementation time; working version 0.6.5.1, target 0.6.5.2. No new version or data-format claim from this plan. On load, `loadGameFromParsedOutcome` already sets the restored current grid before staffing; shared cache must also reset/rotate with it. Ensure previews use the **supplied** map without swapping the simulation's `currentGrid`.

## 4. Architecture migration phases — ONE reviewable new PR

**Order:** internal checkpoint **A → B → C** **inside ONE PR**. Do not create PR #B or #C. Since the route contract touches multiple authorities, do not merge a half-cutover. Each commit should build/test locally when feasible; the entire PR must satisfy the full feature gate before merge.

### 4.0 Mandatory phased cutover matrix

| Stage (all same PR) | Depends on | Starting active architecture | Exact migration | Architecture active after stage | Tests/boundary proof | Rollback/blocked behavior |
| --- | --- | --- | --- | --- | --- | --- |
| **A — Route authority** | Current merged `main` and shell/repo audit | Existing `searchRoute`, walker `pathCache`, separate cost cache | Introduce immutable typed route outcome *inside pathfinding*; bounded shared geometry/cache; retain canonical A*; convert commute quote wrapper to same result | New route quote and existing movement work against the same A* core; existing saved assignment semantics intact while next stage is under development | Unit route tests, budget vs disconnected, road/slope, cache/revision, type/lint | No saved changes; revert this stage if behavior or ownership proof fails |
| **B — Decision cutover** | A verified | Canonical route result available, existing domain writers | Update `commuteReach`, `workforce`, `education`, `housingPipeline`, `virtualPlayer`; remove policy-grade numeric/boolean fallback and Euclidean acceptance; keep existing transitions | **Only** route evidence authorizes new work/school/relocation choices; incumbents retained on pending | Existing workforce/school/housing/bot tests + new mixed-household/pending tests | Pending → defer or keep state; no guessed move or job cancellation |
| **C — Motion + completion** | B verified | Domain decisions use route authority; movement may still calculate its per-walker path | Make `steerWithPath` consume valid cached geometry and preserve own progress; align departure estimate at trip start; finalize invalidation/metrics, registries/docs and benchmarks | **Final single pipeline** from pathfinder to domain choices and walking; no second A* quote or duplicate saved writer | Actual movement + 100/500/1,000/2,000 seeded benchmark + save/worker parity, types/lint/build/cycles | Abort PR merge if performance/movement/parity fails; do not hide by skipping CI |

**Merge policy:** Only the final **single** PR contains the complete three-stage cutover. Do not publish stale intermediate gameplay logic as merged functionality. If the one PR becomes too large to review, stop and re-plan an independently useful, complete first slice; never leave two active owners just to split the PR.

### PR A — One new standalone navigation/commute authority PR (internal stages A–C)

**Starting architecture:** `main` after merged #126: `tickHumans → steerWithPath` for movement, `tickLayerAssign → workforce/housing` for assignments, daily `education.syncSchoolAssignments` for schools, bot `decideFood` read-only preview. Independent `commuteReach` cost and pathfinding geometry cache.

**TO-BE change:** All §2.3 rows, in §4.0 stage order; direct imports only from canonical owners.

**Active after the PR is merged:** One authoritative map/route/cost owner, one hours/eligibility owner, existing single domain writers and a shared immutable route usable by many settlers. **No double navigation pricing or policy fallback for high-stakes decisions.**

**Goal:** Faster, consistent pathfinding and genuinely map-aware work, school and household decisions without job churn or saved-state migration.

**CREATE (only planned files, verify naming collisions):** `tests/navigation.sharedRoutes.test.ts` for route union, shared path, cache lifecycle and independent cursors; `tests/navigation.decisionIntegration.test.ts` for work-school-housing agreement if existing test fixtures cannot cleanly cover the combination; **this plan file** under `docs/plans/`. No new production manager is requested.

**EDIT:** `src/game/pathfinding.ts`, `src/game/commuteReach.ts`, `src/game/workforce.ts`, `src/game/education.ts`, `src/game/housingPipeline.ts`, `src/game/virtualPlayer.ts`, `src/game/humanTick.ts`, `src/game/simulation/humanMovement.ts`, targeted current tests, and **mandatory** `OWNERSHIP_OVERVIEW.md`, `src/game/simulation/decisionRegistry.ts`, `CHANGELOG.md`. Edit `tickLayerAssign.ts`, `pathfindingMetrics.ts`, save/worker tests only if required by a proven integration issue. Add distinct bug reports only after deduplication under the repository protocol.

**IMPLEMENT, in order:**
1. **A:** Prove exact grid-generation identity and both endpoint validity; expose cost+path+pending from existing A*; bound memory by entry **and** total path tiles; keep walker progress separate and compare route costs with current `searchRoute` on road/cliff fixtures. Replace the independent policy cost cache only once its callers can consume the same quote.
2. **B:** Convert every actual hiring, transfer, school enrollment/review, housing move/swap and bot preview caller to the typed commute verdict. Keep lower-bound filtering; apply existing two-hour threshold and existing hysteresis only after a priced route. Preserve incumbent jobs/seats and current home on pending. Recheck the existing housing score index and candidate order so added route searches remain bounded.
3. **C:** Use that shared path in movement without second integration; update departure lead at trip initiation (not an A* query each tick); test blocked paths, bridge changes, walker deviation and reset/load. Run fixed-seed benchmark and inspect cache hit rates, nodes and p95 tick time. Refine only demonstrated hotspots; flow fields are out of scope.
4. **All stages:** Maintain mandatory registers/docs as real code lands, and document concrete discoveries under the active bug report protocol. No off-topic feature balance edits.

**ACCEPT ONLY WHEN:**
- The school chooser and housing relocation cannot accept a river shortcut that the movement pathfinder cannot walk; no unknown quote produces a positive move/assignment.
- Same directed endpoints reuse cached route; other walkers' cursors are independent; road/cliff/bridge/cache reset cases pass.
- Existing job continuity, 60-day transfer cooldown, skill rules, school seat retention, 2-hour guard, household capacity/custody/leader limits and 4 daily assignment pulses pass.
- No new save fields, new tick layer, new production module, aliases, re-exports or import cycles; exact real functions are registered.
- Repeatable fixed-seed performance and worker/fallback/old-save evidence is attached to PR; no unsupported FPS claim.
- Targeted tests, `npm run test:types`, `npm run lint`, `npm run build`, `npm run audit:deps:cycles` pass (or any pre-existing failure is distinguished with evidence); discovered source bugs are reported correctly.

## 5. Determinism, gameplay and performance proof

**Hot-path policy:** No A* execution merely to convert already cached geometry to hours; no full-grid flow field for every building; no new per-tick pathfind call for each settler; no `population × population` commute checks; housing candidate selection uses a cheap straight-line *lower bound only as pruning*, then true route quotes for the short list. Keep existing relevant building/human indexes and the four assignment pulses.

**Correct cache:** Key by exact `PathGrid` generation or explicit revision and directed start/goal tiles. If eligibility depends on actual entry/stand point, price those endpoint segments separately. Evict on both entry and aggregate-path-length bounds; clear when map, terrain, road/bridge, blocking wall, world load or route-validity identity changes. Do not share rejected `pending` states as permanent unreachable, and do not share mutable waypoints/progress.

**Performance collection:** Before code, record baseline A* calls, expanded nodes, cache hits/misses, path-grid rebuilds, tick median/p95 and memory for each seeded scenario. After code, use the **same** seed, building geometry, population, simulation duration, clock settings, worker/fallback configuration and environment. At least three samples where practical. Use actual `pathfindingMetrics.ts` counters, `scripts/colonyHealth.ts`/existing Node harness (verify CLI arguments) and existing performance profiler; do not invent a benchmark script without need.

| Scenario | Before | After | Verdict/method |
| --- | --- | --- | --- |
| 100 settlers, fixed seed, 7 sim days | **NOT RUN** | **NOT RUN** | Real path calls/route-hit ratio, median/p95 tick, memory; planned |
| 500 settlers, same map class, 7 days | **NOT RUN** | **NOT RUN** | Compare search calls and assignment correctness; planned |
| 1,000 settlers, saved deterministic colony, 30 days where practical | **NOT RUN** | **NOT RUN** | Housing pulses, work continuity, school attendance and p95; planned |
| 2,000 settlers, representative seeded colony, bounded 7 days | **NOT RUN** | **NOT RUN** | Check no tick spike, excess memory or repeated global replanning; planned |
| Two residents, same home/workplace | **NOT RUN** | **NOT RUN** | First route may search, second reuses; independent walking progress |
| Same world after bridge/wall modification | **NOT RUN** | **NOT RUN** | Stale route invalidated, correct detour/no-route |
| RNG/replay, old-save round-trip, worker/fallback | **NOT RUN** | **NOT RUN** | Identical deterministic semantics; planned |

**Acceptance threshold:** Shared-route cases must actually reduce duplicate A* queries to one for identical directed endpoints. For broad runs, **do not assert a speedup without measured data**. Reject measurable persistent regressions or unexpected p95 spikes; investigate before merge and disclose any justified tradeoff in PR. Bound cache at design target max 1,024 entries/131,072 tiles unless benchmarks justify a smaller cap. A flow field is **not** a free performance win; do not implement it in this PR.

**Module audit:** `npm run audit:deps:cycles`; check `scripts/check-function-overlap.mjs` / build's overlap gate. Don't add generic similarity waivers. If an overlap is genuinely distinct, supply behavior-specific rationale/test in `docs/tools/semantic-overlap-reviewed.json` per `AGENTS.md`.

## 6. Tests — name the evidence, not just intent

| Behavior/invariant | Test file | Assertions | PR |
| --- | --- | --- | --- |
| Route can price a detour and road discount | **Existing** `tests/commuteRouteEstimate.test.ts` | Priced cost/path consistent, no river shortcut; no unstated straight-line fallback | Single new PR |
| Blocked vs node-budget-exhausted distinction | **NEW** `tests/navigation.sharedRoutes.test.ts` | `unreachable` only after completed search; 4k exhaustion → `pending` | Single new PR |
| Reuse same shared directed path | **NEW** `tests/navigation.sharedRoutes.test.ts` | Two independent walkers same tile endpoints: one A*, separate next-index/cursor | Single new PR |
| Cache lifecycle, directed slopes, bridge/wall change | **NEW** `tests/navigation.sharedRoutes.test.ts` | Route invalidated on grid revision; no reverse route assumed; no waypoint corner cutting | Single new PR |
| Valid new job within two hours / no unreachable transfer | **Existing** `tests/workforce.persistentCommute.test.ts` | Geographic route, job continuity, cooldown and tie ordering | Single new PR |
| Deferred staffing progress and terminal complexity | **Existing** `tests/workforce.deferredCommuteRetry.test.ts` | No false permanent `Infinity`, bounded retries, no repeated re-search at cap | Single new PR |
| Schools across river, capacity and retained seat | **Existing** `tests/school.test.ts` + **NEW** integration test if needed | Chooses reachable school by route; pending does not erase current seat | Single new PR |
| Household work+school objective / optional swaps | **Existing** `tests/residenceCommuteRelocation.test.ts` | New home improves priced travel, nobody suffers forbidden regression; pending → no move | Single new PR |
| No weekly/daily housing storm | **Existing** `tests/residency.dayBoundary.budget.test.ts` | Same 03/09/15/21 pulses, idempotent stable population | Single new PR |
| Bot preview uses proposed map | **Existing** `tests/commuteRouteEstimate.test.ts`, `tests/virtualPlayer.test.ts` | Read-only preview doesn't replace current map or poison cache with a timeout | Single new PR |
| Old save / worker parity / fallback | **Existing** `tests/saveLoad.commuteGrid.test.ts`, `tests/gameLoop.test.ts` and relevant worker tests | Existing jobs/homes/schools preserved; no stale route after load; same deterministic state | Single new PR |
| Large colony performance | **Existing** `scripts/colonyHealth.ts` / actual benchmark harness after inspection | Measured search count, nodes, memory and p95 at fixed seeds; no fake player | Single new PR |

**Execution commands:** Inspect `package.json` and existing `scripts/test.mjs` help on the implementation checkout; use targeted Vitest runs supported by that harness, then `npm run test:types`, `npm run lint`, `npm run build`, `npm run audit:deps:cycles`. **ALL NOT RUN while drafting this plan.** Do not skip/degrade failing tests, alter game rules to satisfy brittle tests, or launch the entire 360-day full-year CI as a routine narrow gate. For browser/player E2E use existing `scripts/autoplay_playwright_probe.py` after verifying current interface; for Node seeds reuse existing scripts.

## 7. Documentation and bug tracking — explicit gates

Every implementation change within the new PR must keep its own scope documents synchronized; all must be correct at final merge:

| Required diff item | Concrete action |
| --- | --- |
| `OWNERSHIP_OVERVIEW.md` | Update `Movement / pathfinding`, `Commute reach`, `School`, `Workforce`, `Housing` rows for **actual** touched symbols; register unique route quote/cache ownership, no duplicates. |
| `src/game/simulation/decisionRegistry.ts` | Update `school`, `workforce`, `housing`, `virtualPlayer` with exact real callers/cadence/test files, existing domain `writes`. Add separate read-only navigation decision only if it is justified as a major decision, with `writes: []`, `cadence: 'on-demand'`; do **not** invent a novel tick. |
| `CHANGELOG.md` | One concise entry explaining shared navigation and route-aware work/school/housing; conform to the current heading, under 300 characters and no file names/paths. |
| `docs/plans/shared-navigation-commute-authority-2026-11-06.md` | Add this verified plan; replace planned with actual symbols and measured results only after implementation. |
| `roadmap_V.0.6.5.2.md` | Add/advance this major feature **only in existing format**, mark complete **after merge**, not merely because this plan exists. |
| `docs/bug_report/` and `docs/BUG_REPORTS/SUMMARY.md` | Read `docs/bug_report/readme.md` and deduplicate first. Existing related report `2026-11-06-automatic-staffing-ignores-commute-reachability.md` already covers an older staffing defect. Add/update **distinct** reports only for confirmed newly discovered bugs; disclose PR new/updated report counts with exact links, including zero. |
| Historical content | **NO CHANGES** to `docs/FIRST_YEAR_IN_WILDERFOLK.md`, `docs/SECOND_YEAR_IN_WILDERFOLK.md`, `docs/archive/**`, prior snapshots or historical bug report bodies. Only active `docs/BUG_REPORTS/SUMMARY.md` is mutable as index. |

**Known static review findings to triage and deduplicate (not yet filed as new reports):** (1) `commuteReach.ts` bot preview stores node-budget exhaustion as `Infinity`; (2) `housingPipeline` may treat a pending `estimatedCommuteHours` result as straight-line travel; (3) `education.findSchoolForChild` uses a straight-line school choice while other systems use walkable routes. Reproduce or document precise source proof, search existing current/historical reports, then file/update according to protocol during implementation. Do not claim these have been independently reproduced at runtime.

**Documentation diff checklist:** mandatory owner overview **planned**; decision registry **planned**; changelog **planned**; plan **CREATED AS FILE (not committed)**; roadmap **not changed**; bug report **not changed**; historical narratives **not changed**.

## 8. End-of-PR handover (mandatory)

```text
PLANNED / NOT IMPLEMENTED: Complete codebot plan for shared routes and
route-authoritative work, school and household commute decisions.

PR / commit:
- NOT CREATED; this is a standalone plan for ONE new PR.
- Evidence baseline: main @ 2547a4d4165f81993113b095f67f27b710dcd405.

Scope delivered:
- Completed AS-IS, TO-BE, migration map, module boundaries, one-PR stages,
  acceptance tests, persistence and performance gates.
- NO gameplay code changed; shared cache and quote are NOT IMPLEMENTED.

Files and ownership:
- Proposed docs/plans/shared-navigation-commute-authority-2026-11-06.md — plan.
- OWNERSHIP_OVERVIEW.md — NOT CHANGED; rows specified in section 7.
- decisionRegistry.ts — NOT CHANGED; keys/cadences/writes specified above.

Save + worker:
- No new saved state proposed; tests required to demonstrate parity.

Verification:
- Repository code inspected through GitHub; main and PR #126 status checked.
- Local PowerShell environment / tests / typecheck / lint / build: NOT RUN.
- Performance baseline comparison: NOT RUN (requires executable colony).

Documentation:
- CHANGELOG.md and roadmap: NOT CHANGED; future PR responsibilities specified.
- Bug reports: NOT CREATED OR MODIFIED; source findings require deduplication.

Risk / open issues:
- Endpoint snapping and true last-leg travel time need specific integration tests.
- Node-budget exhaustion must not masquerade as proven unreachable.
- Runtime performance impact unknown until baseline and after measurements.

Cleanup:
- No repository source changes or temporary branch. Only plan output file created.

Next smallest step:
- Open a fresh feature branch from up-to-date main; verify shell/owners/tests,
  then implement §4 internal stage A in the new PR.
```

## 9. Final review gate — planning vs implementation

- [x] Inspected current `main`, merged PR #126, relevant owner/source functions and existing tests (snapshot stated above).
- [x] Specified feature, non-goals, protected rules and observable acceptance criteria.
- [x] AS-IS names verified callers, cadences, cached representations and the actual sources of inconsistent commute decisions.
- [x] TO-BE shows one canonical route/search/cost pipeline, with distinct policy and writer authorities.
- [x] Included AS-IS → TO-BE migration table, actual old functions, proposed signatures, stage/cutover and direct consumers.
- [x] Module boundaries and dependency direction reject a second manager, new tick, shared walker cursor and unregistered state writers.
- [x] One standalone PR with complete internal staging; no dual production pipeline or postponed save migration.
- [x] Explicit deterministic, bounded-memory and measured-performance proof requirements.
- [x] Tests, architecture registrations, changelog, roadmap, bug-report and historical-document gates specified.
- [ ] **Implementation checkpoint:** inspect refreshed source and verify **actual local PowerShell** as required by `AGENTS.md`.
- [ ] **Implementation checkpoint:** write/review code, register every actual touched function and decision, document defects after deduplication.
- [ ] **Implementation checkpoint:** all targeted gameplay/save/worker tests, dependency audit, types, lint, build and benchmark **PASS**.
- [ ] **Merge gate:** code review, measured results and no hidden regressions; do not mark the feature IMPLEMENTED before merge.

**Stop rule:** This file is a **ready-to-use plan**, **not** proof of a working feature. A PR without accurate owners, a required migration if scope changes, reproducible route evidence, relevant defect reports and performance verification is **not** ready to merge.

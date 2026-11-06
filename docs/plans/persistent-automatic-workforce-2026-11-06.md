# Persistent automatic workforce and static-audit follow-ups — 2026-11-06

**Status:** work instructions 1–5, 7 and 9 implemented in source on draft PR #126 (runtime unverified); food-production planning improved and housing-bucket contract resolved in source (unverified at runtime). **Baseline:** `6e9dd6bfcd525cb1df3d8960a636069f5aa240c7`. **Target:** V.0.6.5.2. **Scope:** eliminate manual worker assignment, preserve stable jobs, fix the confirmed Store-policy contradiction, and resolve two review risks without inventing runtime failures. **No tests or CI executed for this implementation.**

## Mini-RFC
**Problem:** Manual and automated staffing paths overlap, risking inconsistent commands and unnecessary churn. The Virtual Player also contains a Store-scaling contradiction; food producer planning currently uses equal building counts despite differing production; housing bucket stability is overstated in a comment.

**Minimal change:** Retain one persistent job assignment per citizen and one authoritative workforce policy. Remove manual assignment UI, commands and state *only after tracing usages and save migration*. Fix Store policy separately. Evaluate measured production and housing bucketing against their owning contracts before changing behavior.

**Risk-impact:** Worker identity, careers, production continuity, save compatibility, worker commands and performance at 2,000+ population. Never reset every job each day. Preserve deterministic ordering and avoid global per-tick workforce sweeps.

## Required player-facing behavior
1. **Assign once, retain by default.** `workerBuildingId` is persistent employment; night sleep, eating, absence, commuting, a day off, and day rollover do not clear it.
2. **Unemployed first.** A new post first recruits eligible unassigned adult workers; keep existing colleagues in place.
3. **Reconcile only on meaningful triggers:** newly completed/demolished/closed workplace, immigrant or adult entering labor force, death/departure, vacancy, eligibility changes, and genuine severe production shortages. A bounded low-frequency repair pulse may repair missed events but does not reshuffle healthy rosters.
4. **Transfer only for a real reason:** urgent survival vacancy or a meaningful skill/commute/career improvement, with hysteresis/cooldown. Do not steal an essential worker to fill a less-important post. Preserve job history and skills.
5. **Staffing/attendance separation:** employment belongs to workforce; whether a human is physically present and how much they produce belongs to work schedule, attendance and production owners.
6. **Player controls policy, not individuals:** existing workforce presets remain, and optionally permit a building-level closed/disabled state only if that capability is explicitly accepted and properly owned. Do not silently introduce it.
7. **Single pipeline:** all assignment writers and proposal paths use the one workforce owner. The Virtual Player supplies priorities or commands but never runs an independent assignment algorithm.

## Implementation sequence and ownership
### A. Trace and remove manual staffing (implemented; runtime unverified)
- Implemented: removed per-person job controls and manual staffing toggles; existing typed `assignWorker` remains for construction and residency, and refuses completed-job individual assignment.
- Implemented: reused `workforce.assignMissingWorkers` as the authoritative automatic staffing entrypoint. Existing `workerBuildingId` assignments persist; only eligible idle workers fill empty posts, with existing guarded transfers.
- Make existing assignments the fixed starting roster. Process only vacancies and explicitly justified transfers; deterministic sorting, no daily mass reassignment.
- Retire manual controls and manual-only code paths after migrating consumers; preserve any nonmanual uses of commands until proven obsolete.
- Implemented: legacy `staffingMode: 'manual'` is normalized to auto by workforce assignment, preserving valid jobs. Moon Howler transitions, prisoner-release and worker/main parity need local verification; no tests were run.
- Update both `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts` in the **implementation** change; every changed function has one owner and correct cadence/write set.

### B. Fix Store scaling inconsistency (source fix committed; unverified)
- See `docs/bug_report/2026-11-06-virtual-player-store-scaling-unreachable.md`.
- Implemented: demand uses `computeStorageMax` for actual completed-building material caps (wood/stone/iron, 85% threshold), respects construction and reserves, and does not incorrectly use gold stock or per-adult Store targets.
- Verify that the command owner validates funds, placement and capacity.

### C. Food-production capacity review (source improvement committed; runtime unverified)
- Uses the **existing** `getRecentFoodFlow` ledger when there are at least three consecutive complete food days; actual stored yield reflects staffing/attendance, weather, ecology, prey, upgrades and spoilage. Sustainable recorded output stops unnecessary capacity construction even when crop counts are below the old target.
- Before a reliable food history exists, `wantedBootstrapCropSiteCount` is only a conservative **crop footprint** heuristic: Farms and Greenhouses count; Fishing and Hunting Spots do **not** pretend to have identical crop output. No new nominal-yield model, duplicate production formula or extra simulation pass was added.
- A verified measured deficit is not hidden by a nominal site-count cap; existing Farm upgrade, Mill, site-placement, build concurrency, affordability and biodiversity safeguards remain. Critical low larder levels still trigger the existing emergency response.
- Regression source: `tests/virtualPlayerHealthVerdict.test.ts` covers adequate measured fish/hunting yields without unnecessary new crop sites. Not executed.

### D. Housing sweep bucket review (false persistence claim corrected; no new runtime state)
- `housingUnitBucket` takes the lowest **current** household member ID. That is deterministic for the present unit, but can shift after a member dies/leaves; it was incorrect to claim a persistent household identity.
- This is **not a confirmed relocation bug**: the four daily sweep pulses cover every current bucket, and the final pulse already revisits **all** units; urgent homelessness/capacity repairs are independently global. The scheduler does not assume that a household's bucket stays fixed between pulses.
- Corrected the source contract comment without introducing duplicate identity bookkeeping, save migrations, or a second housing owner. A source regression in `tests/residency.dayBoundary.budget.test.ts` explicitly captures member departure and the daily bucket coverage. Not executed.

### E. Pathfinding contract for persistent jobs (source fix committed; unverified)
- See `docs/bug_report/2026-11-06-automatic-staffing-ignores-commute-reachability.md`.
- `commuteReach.isWithinAssignableCommute` limits **new** work placements to two hours from the settler's home (or position when unhoused), priced on the existing path grid; a completed search returning no route is unreachable. Never substitute current-position straight-line distance for this eligibility.
- Implemented: `assignWorkerInPlace` makes route eligibility mandatory and cheaply rejects impossible straight-line lower bounds before A*; `pickWorkerToTransfer` uses the same route owner and ranks from actual home. Both preserve established employment.
- Distinguish a route-search budget exhaustion/unknown route from a proven blocked route; use bounded defer/retry instead of silent eligibility or permanent exclusion.
- **Keep a previously valid job when a later commute fails.** Let navigation recover/replan first; if permanently inaccessible, resolve housing/commute through its owner or make one justified transfer after cooldown, never daily reassignment and never blanket job clearing.
- Implemented: the workforce owner fingerprints relevant worker/building/policy inputs and skips unchanged pulses; a weekly safety recheck handles unknown environmental changes. Route work remains budgeted/cached, and no per-tick whole-population A* was added. The pulse still runs an O(humans+buildings) fingerprint, so this is change-gated, not a full event-queue rewrite.

## Acceptance criteria for implementation
- Current jobs persist across multiple day boundaries without reassignment on each daily pulse; attendance varies independently.
- New job openings are filled from eligible unemployed people; existing workers stay unless a recorded policy reason justifies transfer.
- A death, demolition, departure or explicit urgent food shortage triggers exactly the necessary changes, with deterministic selection and no endless `autoStaffWorkers` loop.
- No player-facing manual individual job assignment remains; obsolete saved flags import safely.
- At large population, assignment work scales with relevant changed entities, not all citizens on every tick.
- Store expansion follows one confirmed storage-pressure contract.
- No unnecessary food-capacity or housing changes are made from unverified hypotheses.
- Every **new** assignment and transfer satisfies canonical pathfinding-based two-hour reachability; blocked/unknown routes are handled distinctly without dismissing incumbents.
- Owners/decision registry/changelog are updated in the implementation PR, with precisely scoped regression tests chosen by the local maintainer.

## Verification policy for this documentation task
**Not run:** tests, TS, lint, build, CI, performance probes or simulations — by explicit user instruction. Code changes are unverified. The event-fingerprint gate, new-job/transfers pathfinding, and Store capacity-pressure fixes are committed. Food-yield planning and the housing-bucket invariant review are now committed, but none of the regressions or simulations was run.

## Report tracking
- New: `2026-11-06-autoplay-staffing-policy-inconsistent.md`, `2026-11-06-virtual-player-store-scaling-unreachable.md`.
- Existing linked without duplicate: `2026-11-01-virtual-player-food-production-lags-population.md`.
- Housing bucket: resolved as a misleading comment, not a demonstrated runtime defect. The four-pulse/final sweep remains unchanged.

# Persistent automatic workforce and static-audit follow-ups — 2026-11-06

**Status:** work instructions 1–3 implemented on draft PR #126 (runtime unverified); remaining instructions and related audit findings are planned. **Baseline:** `6e9dd6bfcd525cb1df3d8960a636069f5aa240c7`. **Target:** V.0.6.5.2. **Scope:** eliminate manual worker assignment, preserve stable jobs, fix the confirmed Store-policy contradiction, and resolve two review risks without inventing runtime failures. **No tests or CI executed for this implementation.**

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

### B. Fix Store scaling inconsistency (confirmed source defect)
- See `docs/bug_report/2026-11-06-virtual-player-store-scaling-unreachable.md`.
- Choose an explicit storage-demand rule based on existing storage pressure and construction state. Keep Stores separate from production-per-adult targets, and remove the contradictory comment/condition.
- Verify that the command owner validates funds, placement and capacity.

### C. Food-production capacity review (improvement, not a second starvation bug)
- Link the existing resolved report `docs/bug_report/2026-11-01-virtual-player-food-production-lags-population.md`; do not reopen or duplicate it without fresh evidence.
- `wantedFoodProducerCount` and `decideFood` treat Farm, Greenhouse, Fishing Spot and Hunting Spot as equal producer counts; actual achievable food output varies with staffing, attendance, ecology and upgrades.
- Decide whether a cost-bounded, deterministic expected-output estimator improves the **existing** `getRecentFoodFlow` feedback loop. Avoid inventing yields or duplicating `dailyBuildingEconomy.ts`. Preserve the documented fast deficit response.

### D. Housing sweep bucket risk review (not a confirmed runtime bug)
- `housingUnitBucket` hashes `lowestMemberId(unit)`, which changes if that member leaves; assess whether stable-across-membership bucket identity is a real contract requirement.
- If only deterministic current-pass scheduling is needed, clarify the comment and retain the function. If household continuity across roster changes matters, find the canonical persistent household identity first; no invented IDs or save migrations.
- Reuse `housingPipeline.ts`; do not add another housing decision owner or rewrite the completed housing architecture.


### E. Pathfinding contract for persistent jobs (confirmed staffing defect)
- See `docs/bug_report/2026-11-06-automatic-staffing-ignores-commute-reachability.md`.
- `commuteReach.isWithinAssignableCommute` limits **new** work placements to two hours from the settler's home (or position when unhoused), priced on the existing path grid; a completed search returning no route is unreachable. Never substitute current-position straight-line distance for this eligibility.
- `workforce.assignWorkerInPlace` currently ranks `near === false` candidates but still assigns one when none is reachable: make eligibility mandatory. `pickWorkerToTransfer` has no such check: enforce the same rule for transfers, using the existing owner rather than a second route search algorithm.
- Distinguish a route-search budget exhaustion/unknown route from a proven blocked route; use bounded defer/retry instead of silent eligibility or permanent exclusion.
- **Keep a previously valid job when a later commute fails.** Let navigation recover/replan first; if permanently inaccessible, resolve housing/commute through its owner or make one justified transfer after cooldown, never daily reassignment and never blanket job clearing.
- Only price routes for vacancy/transfer candidates on actual staffing events, not every worker on every tick. Respect the existing grid cache, routing budgets, blocked-waypoint behavior and save/worker parity.

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
**Not run:** tests, TS, lint, build, CI, performance probes or simulations — by explicit user instruction. Code changes are unverified; event-driven staffing optimization and unrelated Store/pathfinding fixes remain planned.

## Report tracking
- New: `2026-11-06-autoplay-staffing-policy-inconsistent.md`, `2026-11-06-virtual-player-store-scaling-unreachable.md`.
- Existing linked without duplicate: `2026-11-01-virtual-player-food-production-lags-population.md`.
- Housing bucket risk: recorded here as *unverified*, not a fabricated bug report.

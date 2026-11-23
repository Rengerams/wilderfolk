# Pending navigation search repeatedly strands moving walkers

- Bug: A walker whose legal detour needs more than 12,000 expanded A* nodes repeatedly receives no movement velocity because retry uses the identical search budget.
- Status: investigating (source fix adapted to current `main`; live save verification pending)
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 development, after PR #181 was merged
- Reporter: live screenshots of two stationary walkers, including Riverdale trader Fagan
- Area: walking pathfinding, trade-caravan travel and diagnostics
- Owner module: `src/game/pathfinding.ts`
- Related PR/commit: PR #183 `fix-pending-navigation-retries`

## Status history
- 2026-11-22 — investigating: screenshot showed `Checking route — the search budget was exhausted; reachability is unresolved`; the player confirmed the merchant was stationary and reported another stuck person.
- 2026-11-22 — source fix committed on a separate branch stacked on PR #181; verification pending.
- 2026-11-23 — merged with newer path-length budgets and reachable-stand bands from `main`; walker-only retry preserves both. Automated CI and live-world verification follow the merge commit.

## Observed behavior
The inspector reports a pending navigation quote, and the merchant is not moving. In `steerWithPath`, a search capped at 12,000 A* nodes returns no waypoints, so velocity becomes zero. A pending cache entry retries after 32 decision pulses, again with 12,000 nodes. A blocked-goal search on PR #181's branch could exhaust its own fallback budget without even setting the pending retry flag.

## Expected behavior
A route which is legal but expensive to search eventually starts moving. An inconclusive node-budget result remains distinct from a confirmed unreachable path. No entity may walk through water, rocks, closed gates, cliffs or solid buildings just to bypass the search limit. A truly unreachable caravan remains subject to its existing trip deadline and cargo/refund owner.

## Reproduction steps
1. Generate an open 240 by 240 path-tile fixture with a north-south river at x=120, leaving only a southern gap at y=239.
2. Place a walker at (210,100) with a destination at (30,100) (cell centres). Optionally block the goal cell itself to exercise stand-point routing.
3. The normal distance-based search budget is 22,000 nodes; a long detour can exceed it. Verify the first result is pending and repeated walker decisions eventually produce a nonzero route velocity under a larger bounded budget.

## Evidence
- User screenshot: Riverdale trader Fagan; movement inspector says the search budget was exhausted; user independently confirms the merchant is stationary. A second stationary person was reported, but the exact second movement cause cannot be established without the save.
- Source: `PATH_MAX_SEARCH_NODES = 12000`, `steerWithPath` pending retry used an unchanged cap, `CachedPath.retryAfter` delayed retries, and `routePending` ignored `fallback.hitNodeCap` when `shared` was null.
- The pre-fix behavior is source-proven for long detours; the specific saved-world connectivity is not yet verified.

## Root cause
Pending walker paths retried the same bounded A* search without progressing its node budget, while an off-screen human only re-runs decisions once per 24 ticks. The blocked-destination fallback could also hide a pending result.

## Fix / proposed fix
The canonical pathfinding owner starts walkers with the distance-priced `searchNodeBudget` already on `main`. When that budget is exhausted, it caches a per-walker next-search budget that doubles to at most 96,000 nodes after bounded decision-pulse pauses; a capped pending route backs off more heavily. Shared commute eligibility and price-query limits are unchanged. `routeToBlockedGoal` retains the `main`-side closest-reachable stand-point bands while accepting the higher walker budget, and fallback exhaustion is explicitly pending. No duplicate planner or added scheduler.

## Save/migration impact
None: the retry budget is transient cached path state, not serialized.

## Verification result
- `tests/pathfinding.segmentTraversal.test.ts` includes long-detour retry cases for both open and blocked goals. These were not run locally (no repository runtime available to this connector).
- GitHub CI must verify the reconciled commit before merge; the specific saved world has not been reproduced.

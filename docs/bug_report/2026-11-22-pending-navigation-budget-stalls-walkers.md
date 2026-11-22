# Pending navigation search repeatedly strands moving walkers

- Bug: A walker whose legal detour needs more than 12,000 expanded A* nodes repeatedly receives no movement velocity because retry uses the identical search budget.
- Status: investigating (source fix committed; CI and live save verification pending)
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 development, on top of PR #181
- Reporter: live screenshots of two stationary walkers, including Riverdale trader Fagan
- Area: walking pathfinding, trade-caravan travel and diagnostics
- Owner module: `src/game/pathfinding.ts`
- Related PR/commit: stacked navigation-retry PR on `fix-pathfinding`

## Status history
- 2026-11-22 — investigating: screenshot showed `Checking route — the search budget was exhausted; reachability is unresolved`; the player confirmed the merchant was stationary and reported another stuck person.
- 2026-11-22 — source fix committed on a separate branch stacked on PR #181; verification pending.

## Observed behavior
The inspector reports a pending navigation quote, and the merchant is not moving. In `steerWithPath`, a search capped at 12,000 A* nodes returns no waypoints, so velocity becomes zero. A pending cache entry retries after 32 decision pulses, again with 12,000 nodes. A blocked-goal search on PR #181's branch could exhaust its own fallback budget without even setting the pending retry flag.

## Expected behavior
A route which is legal but expensive to search eventually starts moving. An inconclusive node-budget result remains distinct from a confirmed unreachable path. No entity may walk through water, rocks, closed gates, cliffs or solid buildings just to bypass the search limit. A truly unreachable caravan remains subject to its existing trip deadline and cargo/refund owner.

## Reproduction steps
1. Generate an open 180 by 180 path-tile fixture with a north-south river at x=90, leaving only a southern gap at y=179.
2. Place a walker at (160,90) and give it a destination at (20,90) (cell centres). This needs a long legal detour.
3. Check that the initial 12,000-node quote is pending; repeated `steerWithPath` calls previously never increased the limit. The new targeted regression expects an eventual nonzero route velocity.

## Evidence
- User screenshot: Riverdale trader Fagan; movement inspector says the search budget was exhausted; user independently confirms the merchant is stationary. A second stationary person was reported, but the exact second movement cause cannot be established without the save.
- Source: `PATH_MAX_SEARCH_NODES = 12000`, `steerWithPath` pending retry used an unchanged cap, `CachedPath.retryAfter` delayed retries, and `routePending` ignored `fallback.hitNodeCap` when `shared` was null.
- The pre-fix behavior is source-proven for long detours; the specific saved-world connectivity is not yet verified.

## Root cause
Pending walker paths retried the same bounded A* search without progressing its node budget, while an off-screen human only re-runs decisions once per 24 ticks. The blocked-destination fallback could also hide a pending result.

## Fix / proposed fix
The canonical pathfinding owner now keeps an unsaved, per-walker next-search budget which doubles from 12,000 to a maximum of 96,000 after bounded decision-pulse pauses; a capped pending route backs off more heavily. Shared commute price queries and reachability policy are unchanged. `routeToBlockedGoal` accepts the same bounded walking budget, and fallback exhaustion is explicitly pending. No duplicate route planner or added scheduler.

## Save/migration impact
None: the retry budget is transient cached path state, not serialized.

## Verification result
- `tests/pathfinding.segmentTraversal.test.ts` long-detour regression added — NOT RUN (no local repository runtime available to this connector).
- Typecheck, lint, build, unit suite and live-world verification — NOT RUN; CI must verify before merge.

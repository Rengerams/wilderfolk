# Free-roam hunting bypasses route planning

- Bug: Direct pursuit ignores route planning and close-range prey can be killed across an obstructed segment.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-23 (playtest observation); source defect confirmed 2026-11-26
- Version/build: 0.6.5.2 development branch
- Reporter: player playtest and source inspection
- Area: free-roam hunting
- Owner module: humanHuntingBehavior.ts; shared navigation remains owned by pathfinding.ts and simulation/humanMovement.ts

## Status history
- 2026-11-26 — investigating: source defect confirmed; implementation and targeted regressions submitted; CI pending.

## Observed behavior
A hunter appeared to walk on water in the playtest. Source inspection confirms free-roam pursuit uses direct velocity rather than a route, so hunters can stall on a riverbank. Close-range kills previously used distance alone. Actual impassable-water traversal has not been reproduced; shallow water is intentionally walkable.

## Expected behavior
Use the shared human route and physical movement owner, travel around impassable terrain where possible and require an unobstructed close-range segment for a kill.

## Reproduction steps
1. Use the existing hunting fixture with prey across a river segment and reachable land around its end.
2. Run pursuit decisions and the production walk integrator.
3. Check that the hunter remains on walkable ground, takes the detour and catches the prey. For a continuous river, close prey on the opposite bank must not be killed.

## Evidence
tickHumanHunting previously called steerEntityToward directly and tested only Euclidean distance for kills. applyHumanWalkStep already enforces the shared collision rule.

## Root cause
The free-roam hunting caller bypassed route steering and omitted the canonical obstruction check at contact.

## Fix / proposed fix
Use steerHumanToward with a hunter/prey-specific cache key and reuse lineCrossesBlocked with the active simulation grid. Do not change terrain classifications, hunting yields, or the final integration pipeline.

## Save/migration impact
None; route targets remain transient and no save fields change.

## Verification result
NOT RUN: targeted tests, full CI, original save replay. Two regressions added to the existing hunting suite.

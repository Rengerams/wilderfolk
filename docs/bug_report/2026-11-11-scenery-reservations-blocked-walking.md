# Scenery reservations could block settlers on otherwise walkable ground

- Bug: Non-solid scenery cells and completed decorative buildings could be included in the pathfinder's blocked mask.
- Status: investigating (source fix committed; CI verification pending)
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: V.0.6.5.2 development, PR #127
- Reporter: direct user report and confirmed static path-grid trace
- Area: terrain walkability, building obstacle mask, route invalidation
- Owner module: `src/game/pathfinding.ts` (derived walk grid); `terrain/terrainGrid.ts` owns L0 terrain encoding
- Related PR: https://github.com/Rengerams/wilderfolk/pull/127

## Status history
- 2026-11-11 — investigating: traced `buildPathGrid` treating every non-open L0 cell and every completed non-road building footprint as blocked, including reserved scenery and decorative structures.
- 2026-11-11 — source fix committed to PR #127: ignore `Walkability.Reserved` and configured decorative building footprints in walking masks, while retaining water, cliff and solid-building collision rules.

## Observed behavior
The path owner read `map.pathGrid[i] !== Walkability.Open` as a solid obstacle. However `Walkability.Reserved` is a terrain-generation reservation for hard decorative scenery; it is not proof that a settler cannot stand there. In addition, completed `Garden`, `Statue`, `Lamp` or other `BUILDING_CONFIGS[type].decor` structures were stamped as obstacles even though they are decorative. Paths could detour, fail or repeatedly collide with invisible/stale obstacles. Rendered tree and grass entities are not directly stamped in the path-grid code.

## Expected behavior
Ordinary land, grassy terrain, ambient trees, vegetation and decorative footprints must not obstruct navigation. Water, impassable height steps, closed gates and completed physical structures still block. Removing a solid structure must trigger a new grid generation and invalidate old routes.

## Reproduction steps
1. Generate a flat test map with a horizontal walk corridor.
2. Set a corridor L0 cell to `Walkability.Reserved` and place a completed Garden on that cell.
3. Before this change, inspect `getPathGrid(map, [garden]).blocked[index]`: it returns 1 and a direct line is obstructed.
4. After the change, the same cell is walkable. Place a completed Wall instead and verify that its footprint is blocked; remove it and verify the grid rebuilds.

## Evidence
Static trace: `pathfinding.buildPathGrid`, `pathfinding.isWalkingObstacle`, and `terrainGrid.Walkability`. Regression: `tests/pathfinding.test.ts`, including reserved scenery, decorative structure and removed-wall assertions.

## Root cause
Walkability conflated the L0 map's reserved-for-building flag with physical terrain collision, then treated all completed building types not explicitly whitelisted as physically solid.

## Fix / proposed fix
Use `Walkability.Water` (not all non-open encodings) for terrain collision and exempt configurations flagged `decor` from building obstacle stamping. Keep the existing completed-solid, closed-gate and bridge rules. Cache keys use obstacle signatures so removal of a solid structure changes the derived grid object.

## Save/migration impact
None. No saved path, occupancy, decorative-entity or grid schema changed. Existing terrain and buildings are re-evaluated into transient walkability grids.

## Verification result
- `tests/pathfinding.test.ts` — added focused regression cases; NOT RUN locally (GitHub connector-only edits).
- GitHub CI, typecheck, lint, build and seeded simulation — pending at the time of this report. Do not call this verified until the checks finish.

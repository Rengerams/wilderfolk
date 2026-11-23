# Scenery reservations could block settlers on otherwise walkable ground

> **Correction (2026-11-22):** the report's claim about `Walkability.Reserved` was wrong. That cell
> value is written only for a generated `rock_big` decoration (`placeDecorations` sets the L0 cell to
> 2) and is documented as "hard decor the generator reserved (big rock) — bars walking"; the build
> grid and `rebakePathCell` treat it the same way. Reservations must keep blocking. Only the second
> half of this report — completed decorative **buildings** must not block — was a real defect, and
> that fix stands. See `2026-11-22-reserved-boulder-cells-walkable.md` for the regression that the
> 2026-11-11 change introduced.

- Bug: Non-solid scenery cells and completed decorative buildings could be included in the pathfinder's blocked mask.
- Status: resolved for decorative buildings; the reserved-cell claim was withdrawn 2026-11-22
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
- 2026-11-22 — corrected: ignoring `Walkability.Reserved` was wrong; those cells are generated big rocks that must block. The decorative-building exemption remains the valid fix.

## Observed behavior
The path owner read `map.pathGrid[i] !== Walkability.Open` as a solid obstacle. In addition, completed `Garden`, `Statue`, `Lamp` or other `BUILDING_CONFIGS[type].decor` structures were stamped as obstacles even though they are decorative. *(The report also claimed `Walkability.Reserved` was harmless scenery; that part is withdrawn — the value is only written for a generated `rock_big` decoration and must block.)* Paths could detour, fail or repeatedly collide with invisible/stale obstacles. Rendered tree and grass entities are not directly stamped in the path-grid code.

## Expected behavior
Ordinary land, grassy terrain, ambient trees, vegetation and decorative **building** footprints must not obstruct navigation. Water, generator-reserved big-rock cells, impassable height steps, closed gates and completed physical structures still block. Removing a solid structure must trigger a new grid generation and invalidate old routes.

## Reproduction steps
1. Generate a flat test map with a horizontal walk corridor.
2. Place a completed Garden on a corridor cell.
3. Before this change, inspect `getPathGrid(map, [garden]).blocked[index]`: it returns 1 and a direct line is obstructed.
4. After the change, the same cell is walkable. Place a completed Wall instead and verify that its footprint is blocked; remove it and verify the grid rebuilds.
5. Separately set a corridor L0 cell to `Walkability.Reserved` and verify it stays blocked — that cell is a generated big rock, not scenery.

## Evidence
Static trace: `pathfinding.buildPathGrid`, `pathfinding.isWalkingObstacle`, and `terrainGrid.Walkability`. Regression: `tests/pathfinding.test.ts`, including reserved scenery, decorative structure and removed-wall assertions.

## Root cause
`buildPathGrid` treated all completed building types not explicitly whitelisted as physically solid, so decorative structures blocked walking. The report wrongly extended that to the L0 `Reserved` value, which only marks a generated big rock.

## Fix / proposed fix
Exempt configurations flagged `decor` from building obstacle stamping and keep every non-`Open` L0 cell — water and generator-reserved rock alike — blocking. Keep the existing completed-solid, closed-gate and bridge rules. Cache keys use obstacle signatures so removal of a solid structure changes the derived grid object.

## Save/migration impact
None. No saved path, occupancy, decorative-entity or grid schema changed. Existing terrain and buildings are re-evaluated into transient walkability grids.

## Verification result
- `tests/pathfinding.test.ts` — added focused regression cases; NOT RUN locally (GitHub connector-only edits).
- GitHub CI, typecheck, lint, build and seeded simulation — pending at the time of this report. Do not call this verified until the checks finish.
- 2026-11-22 — the reserved-cell expectation was reversed and re-verified in `2026-11-22-reserved-boulder-cells-walkable.md`: reserved rock cells block, decorative buildings stay walkable.

# Settlers walk through completed buildings instead of around them

- Bug: The walking path grid marks water, cliffs and walls as blocked but leaves completed farms, houses and other structures walkable, so settlers cut straight through their footprints.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-06
- Version/build: Wilderfolk 0.6.5.2 development
- Reporter: player observation
- Area: movement / pathfinding
- Owner modules: `src/game/pathfinding.ts` (blocked footprint), `src/game/hotelStay.ts` and `src/game/humanTick.ts` (entry targets)
- Related PR/commit: none

## Status history
- 2026-11-06 — resolved: completed building footprints now block the walk grid; entry points were moved outside the footprint for hotels and prisoners.

## Observed behavior
Settlers walk into and through completed buildings, most visibly farm fields. A worker approaching a farm from the north walks across the crop instead of around the building to its front row.

## Expected behavior
A completed building is solid ground to a walker. Paths route around its footprint; the walker reaches an outdoor doorstep or work row and only then enters or stops. Roads, bridges, the square and reinforced ground stay walkable.

## Reproduction steps
1. Build a completed Farm with a 5 × 3 tile footprint.
2. Ask for a path from one side of the farm to the other.
3. Before the fix the centre tile of the farm has `blocked = 0` and the returned path crosses the footprint.

## Evidence
`buildPathGrid` stamped only `isBlockingWall` (completed walls and closed gates). Every other completed building was absent from the blocked mask, so `findPath` and `applyHumanWalkStep` both considered its footprint open. The new `tests/pathfinding.test.ts` case fails on that assertion before the fix and passes after it.

## Root cause
The path grid's obstacle rule covered walls only, while the renderer and placement system treat every completed building as solid.

## Fix / proposed fix
Added `isWalkingObstacle` to `pathfinding.ts`: completed structures block their footprint, while roads, bridges, the Village Square, Ground Reinforcement, unfinished sites and open gates stay walkable. The grid cache signature now includes the obstacle set. Hotel and prisoner entry targets use `homeEntryPosition` so their door is outside the now-solid footprint.

## Save/migration impact
None. No persisted fields or save schema changed; the path grid is rebuilt from the existing building list.

## Verification result
- `npm test -- unit pathfinding.test` — PASS (14 tests, including the new solid-farm case).
- `npm test -- unit infrastructure.acceptance` — PASS (21 tests).
- `npm test -- unit medium-A-movement` — PASS (22 tests).
- `npm test -- unit hotelStay.checkout`, `homeEntry.geometry`, `settlers.indoors`, `affairTrystSite.walkIn`, `workCommute.leadHour`, `hospitalWalk.regression`, `spotlightLore`, `medium-N5-electionGatherSlot` — PASS.
- `npm run test:types`, `npm run lint` and `npm run build` — PASS.
- Full `npm test -- unit` — 3021 passed, 2 skipped; one logistics projection test failed because it still measured from building centres. That projection now measures from the home stand and work row, and its targeted suite passes.

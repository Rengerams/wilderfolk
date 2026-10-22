# 2026-10-20 — Paused UI blocked by repeated residence counts

## Evidence
Chrome Performance Bottom-up screenshot: `getOpenPlayerBeds` ~4,675 ms self and ~9,637 ms total, `countResidentsInBuilding` ~4,953 ms inclusive, `computeVillageStats` ~5,112 ms inclusive. React GameHeader refresh invokes village stats even while simulation paused. Those inclusive timings overlap; don't add them together.

## Confirmed root cause
`populationGrowth.getOpenPlayerBeds` iterates player residences and calls `countResidentsInBuilding(entities, building.id)` for each one. The helper filters the whole settlers array for every residence: O(buildings × people) work per UI query.

## Fix
- `f74973c`: use existing `buildResidenceOccupancy` for a single pass over settlers, and O(1) occupancy lookup per residence. Preserves exclusion of Leader House, live player settler counting, per-residence zero floor, and capacity rules.
- `c4a489e`: correctness and large-fixture regression tests.

## Verification
Static source inspection only: connected GitHub tool cannot run tests. Run `npx vitest run tests/populationGrowth.openPlayerBeds.performance.test.ts` and `npm run build`, then record paused Chrome Performance to validate impact. If still slow, inspect additional calls to `computeVillageStats` and React rerender frequency separately.

## Data safety
No edits to saved settlements, housing assignments, actual residence reconciliation, leadership, or Chronicle.

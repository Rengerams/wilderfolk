# Dry inland tiles unexpectedly reject ordinary buildings

- Bug: Dry but walkable mountain, snow or riverbank tiles are rejected as build sites by the generic terrain-type predicate, resulting in unexplained land-only no-build patches.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2, main at 3122449ff1687084c07c2143387b1f88b1d14b18
- Reporter: player request; code-confirmed terrain classification
- Area: Terrain generation, building placement and ground reinforcement
- Owner modules: `src/game/terrain/terrainTraits.ts` (terrain policy), `src/game/placementUtils.ts` (special footprint policy)
- Related PR: pending feature branch `fix/buildable-dry-land-20261122`

## Status history
- 2026-11-22 — resolved: PR #161 Node.js CI passed 473/473 test files, 3,245/3,245 tests on `fc6a795`; all seven GitHub workflows passed, including the calendar, housing, 120-day simulation and population tiers.
- 2026-11-22 — investigating: full CI uncovered an outdated Ground Reinforcement fixture (mountains were intentionally made buildable) and a related shallow-water save-load classifier regression. The fixture now reinforces shallow water; water-dependent saved Fishing Spots use terrain type rather than L0 path blocking. Fresh CI pending.
- 2026-11-22 — investigating: changed the canonical classification and updated placement, terrain regeneration, and reinforcement regressions; CI pending.

## Observed behavior
`isUnbuildableTerrainType` previously classified `Mountains`, `Snow` and `RiverBank` alongside real water. The shared `isFootprintOnBuildableTerrain`, `isTileBuildable` and world-generator `buildGrid` consequently rejected ordinary structures in terrain that was walkable. The original infrastructure acceptance test explicitly exercised that rejection. The Fishing Spot branch also rejected `RiverBank` anywhere its footprint touched it, even when that footprint included a river cell.

## Expected behavior
All dry land should be terrain-buildable for ordinary structures, including mountains, snow and riverbanks, without changing which tiles are walkable. Water remains unbuildable. A Fishing Spot must reach real water and may rest on a bank, while bridges must span river water. Ground Reinforcement must still work on its four previously eligible terrain types; dry-land buildability must not accidentally disable its terrain-upgrade action. Shallow water must remain wadeable in both freshly generated and rebaked path grids, while remaining unbuildable. Other placement constraints (occupied tiles, map bounds, technology, resources) remain.

## Reproduction steps
1. Create a 20×20 map of `Mountains`, `Snow` or `RiverBank` with `testWorldMap`.
2. Before this change, `isWalkableTerrainType` returned true while `isTileBuildable` and the ordinary House footprint returned false.
3. Use a footprint across `RiverBank` and `River`: the previous Fishing Spot rule rejected the shore section.

## Evidence
Pre-change `UNBUILDABLE_TERRAIN` in `src/game/terrain/terrainTraits.ts` and corresponding branches of `src/game/placementUtils.ts`. The ground-reinforcement command originally used a separate inline four-type list while placement preview used generic `isUnbuildableTerrainType`. The raw generator also had a second path-water set that incorrectly blocked shallow-water wading although the shared walking rule and rebake allow it.

## Root cause
Terrain-type buildability conflated water, alpine terrain and riverbanks. Ground-reinforcement eligibility was coupled to that wider no-build definition instead of having one shared dedicated predicate.

## Fix / proposed fix
Ordinary placement and terrain grids now use canonical `isWaterTerrainType` directly; the obsolete `isUnbuildableTerrainType` forwarding wrapper was removed. `isReinforceableTerrainType` separately owns the mountain/snow/shallow-water/bank improvement condition. Placement preview, the reinforcement command and worker regression fixture share that one predicate. River-bank dock footprints are allowed with a genuine water cell; bridge/fishing alpine exclusions remain. The initial L0 path raster now uses `isWalkableTerrainType`, while both generation and rebaking classify L1 water independently of walking. Tests assert dry ordinary builds, water refusals, wadeable shallow water and dock access.

## Save/migration impact
No stored world terrain fields, elevations, biome-generation formulas or save schema changed. The runtime placement policy now accepts dry land; freshly generated or regenerated L0/L1 occupancy rasters are derived consistently from the canonical walking/water traits, so navigation through shallow water can differ from legacy cached generated grids.

## Verification result

- 2026-11-22: **PASS** — three CI failures on `c0087fc` were corrected in PR #161; full Node.js CI on `fc6a795`: 473 passed files, 3,245 passed tests, zero failed. Calendar, housing, simulation, and all three performance tiers also passed.
NOT RUN at filing — CI checks pending; see `tests/infrastructure.acceptance.test.ts` and `tests/groundReinforcement.workerTransport.test.ts`.

# Dry inland tiles unexpectedly reject ordinary buildings

- Bug: Dry but walkable mountain, snow or riverbank tiles are rejected as build sites by the generic terrain-type predicate, resulting in unexplained land-only no-build patches.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2, main at 3122449ff1687084c07c2143387b1f88b1d14b18
- Reporter: player request; code-confirmed terrain classification
- Area: Terrain generation, building placement and ground reinforcement
- Owner modules: `src/game/terrain/terrainTraits.ts` (terrain policy), `src/game/placementUtils.ts` (special footprint policy)
- Related PR: pending feature branch `fix/buildable-dry-land-20261122`

## Status history
- 2026-11-22 — investigating: changed the canonical classification and updated placement, terrain regeneration, and reinforcement regressions; CI pending.

## Observed behavior
`isUnbuildableTerrainType` previously classified `Mountains`, `Snow` and `RiverBank` alongside real water. The shared `isFootprintOnBuildableTerrain`, `isTileBuildable` and world-generator `buildGrid` consequently rejected ordinary structures in terrain that was walkable. The original infrastructure acceptance test explicitly exercised that rejection. The Fishing Spot branch also rejected `RiverBank` anywhere its footprint touched it, even when that footprint included a river cell.

## Expected behavior
All dry land should be terrain-buildable for ordinary structures, including mountains, snow and riverbanks, without changing which tiles are walkable. Water remains unbuildable. A Fishing Spot must reach real water and may rest on a bank, while bridges must span river water. Ground Reinforcement must still work on its four previously eligible terrain types; dry-land buildability must not accidentally disable its terrain-upgrade action. Other placement constraints (occupied tiles, map bounds, technology, resources) remain.

## Reproduction steps
1. Create a 20×20 map of `Mountains`, `Snow` or `RiverBank` with `testWorldMap`.
2. Before this change, `isWalkableTerrainType` returned true while `isTileBuildable` and the ordinary House footprint returned false.
3. Use a footprint across `RiverBank` and `River`: the previous Fishing Spot rule rejected the shore section.

## Evidence
Pre-change `UNBUILDABLE_TERRAIN` in `src/game/terrain/terrainTraits.ts` and corresponding branches of `src/game/placementUtils.ts`. The ground-reinforcement command originally used a separate inline four-type list while placement preview used generic `isUnbuildableTerrainType`.

## Root cause
Terrain-type buildability conflated water, alpine terrain and riverbanks. Ground-reinforcement eligibility was coupled to that wider no-build definition instead of having one shared dedicated predicate.

## Fix / proposed fix
Canonical `isUnbuildableTerrainType` now recognizes only the three actual water types; `isReinforceableTerrainType` owns the separately required mountain/snow/shallow-water/bank condition. Placement preview, the reinforcement command and worker regression fixture share that one predicate. River-bank dock footprints are allowed with a genuine water cell; bridge/fishing alpine exclusions remain. Tests assert dry ordinary builds, water refusals and dock access.

## Save/migration impact
No stored terrain schema or generation recipe changed. The runtime rule for building on previously forbidden dry types changes for existing saves. Generated and regenerated L1 build grids read the same canonical terrain predicate, so both use the updated policy.

## Verification result
NOT RUN at filing — CI checks pending; see `tests/infrastructure.acceptance.test.ts` and `tests/groundReinforcement.workerTransport.test.ts`.

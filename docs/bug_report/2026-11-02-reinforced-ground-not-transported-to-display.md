# Reinforced ground never reaches the display world

- Bug: Ground Reinforcement patches the worker's terrain map to buildable soil, but the display world never receives the patched tiles, so the soil is not drawn and placing a building on it is still refused.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-02
- Version/build: `main` at `0904a94b` (V.0.6.5.2)
- Reporter: player report ("ground soil should solve the ground not being good enough to build … but it doesn't work"), confirmed by a failing regression test
- Area: worker transport and terrain placement
- Owner module: `game/terrain/terrainGrid.ts` (tile patch capture), `game/simBuffers/simDelta.ts` (transport and replica apply); writer `game/buildingPlacementActions.ts`
- Related PR/commit: same change

## Status history
- 2026-11-02 — open: reproduced with a worker-command transport test; the display tile stayed `shallowWater` after a successful reinforcement.
- 2026-11-02 — resolved: terrain patches now travel with the command delta and are applied to the replica map with a region rebake and terrain revision bump.

## Observed behavior

Placing Ground Reinforcement on mountains/snow/shallow water succeeds (stone/gold are spent, the worker map is patched to `Rocky` + `reinforced`), but the client keeps showing the old hard ground, and the next building placed on that 3×3 patch is refused with "Cannot build on water/terrain". The reinforced soil sprite never appears.

## Expected behavior

A terrain operation that changes buildability must become visible and placeable in the same session: the display map's tiles, the build grid and the terrain render cache all follow the authoritative patch.

## Reproduction steps

1. Start a colony with mountains or shallow water next to the village and unlock Ground Reinforcement.
2. Place Ground Reinforcement on a 3×3 patch of that hard ground (accepted, resources spent).
3. Try to place a building on the same patch.
4. Observed: the ghost/placement is refused by terrain and no soil is drawn.

Deterministic reproduction (pre-fix): `tests/groundReinforcement.workerTransport.test.ts` ran the real `startBuilding` command, extracted the command delta and applied it to a replica; the replica tile remained `shallowWater` and `isFootprintOnBuildableTerrain` stayed false.

## Evidence

`patchTile(map, tx, ty, { type: TerrainType.Rocky, reinforced: true })` runs only on the authoritative world (`buildingPlacementActions`). The command response carries `SimTickDelta`, which had no terrain field, so `applySimTickDelta` on the replica never touched `worldMap`. Placement input validates against that replica (`useCanvasInteractions` → `canPlaceBuilding`), and `drawReinforcedSoil` reads the replica map's `tile.reinforced`.

## Root cause

Terrain mutations made by a worker command were not part of the worker → host boundary contract. The delta transported entities, buildings and world scalars but not the sparse tile overrides, so any command-time terrain change (Ground Reinforcement, and the forest-clearing tile pass) existed only in the worker realm.

## Fix / proposed fix

`patchTile` records the resulting tile on the map (`WorldMap.pendingTerrainPatches`, bounded and runtime-only). `extractSimTickDelta` drains that list into a new `terrainPatches` field, and `applySimTickDelta` writes each tile to the replica map's overrides, rebakes the affected terrain region and bumps the terrain revision so caches repaint. The transient delta protocol advances to 4. No save migration: reinforced tiles already persist through the map's sparse overrides; the patch list is never saved.

## Save/migration impact

None. `pendingTerrainPatches` is runtime-only and excluded from the compact save map. Existing saves already store reinforced tiles as overrides and load unchanged.

## Verification result

- `npx vitest run tests/groundReinforcement.workerTransport.test.ts` — FAIL before the fix (display tile `shallowWater`), PASS after (tile `rocky` + `reinforced`, footprint buildable).
- `npx vitest run tests/workerBoundary.closure.test.ts tests/workerMainThread.parity.test.ts tests/simPrep.rollbackFields.test.ts tests/low-1-worker-persistence.test.ts tests/saveLoad.workerRngSnapshot.test.ts` — PASS.
- `npx tsx scripts/worker-boundary-audit.mts` — unchanged from the pre-fix baseline (13 measured differences / 4 pre-existing unexplained).
- `npm run test:types` — PASS. Full gates recorded in the commit report.

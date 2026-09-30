# Bug: Rivers read as scattered ponds instead of continuous watercourses

- Status: resolved — live verification pending
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: Live player UI test
- Area: terrain | rendering | Play
- Owner module: `src/game/terrainGen.ts`, `src/game/terrainAtlas.ts`, and `src/game/terrainLayer.ts`
- Cadence: new-world generation and static terrain-layer bake

## Observed behavior

In a live Verdant settlement, the minimap and terrain show blue water patches, but the main map does not read as having a broad, continuous river with a visible course and banks. The resulting water is visually interpreted as disconnected ponds or marsh patches.

## Expected behavior

A generated river should be legible at normal gameplay zoom as a continuous, coherent watercourse that crosses a meaningful portion of the map. It should have a broad blue channel, visible land/bank separation, no tree cover on the water cells, and a course that agrees with the minimap.

## Evidence

The live UI test showed multiple blue patches amid dense forest, without an obvious continuous river. The generator stores a traced path and carves water cells, but width depends on local elevation thresholds and the painted atlas rejects mixed-terrain 8-neighbourhoods, which can make the final main-canvas channel visually inconsistent.

## Root cause

The minimap paints every `River` cell as one saturated blue terrain dot. The main map instead combines textured water fills, darker water shading, painted atlas edges, relief, sand-like banks, props, and dense forest. Even after channel continuity was repaired, that layered treatment weakened the main-map blue silhouette and made the water read less clearly than the minimap.

## Fix

The generator now guarantees one broad, deterministic, north-to-south river spine per new map and explicitly classifies its outer ring as `RiverBank`. The main terrain bake adds a river-only saturated blue glaze and sparse tile-bound glints after the generic water pass. This makes the channel read as flowing water at normal zoom without changing terrain topology, pathfinding, bridges, camp clearing, save data, or buildability rules.

## Regression test

Added a deterministic contract in `tests/terrainGen.riverGeneration.test.ts` requiring a broad, banked River channel in every map row across every preset. Terrain generation and atlas/water tests passed: 3 files / 23 tests. Live browser verification is in progress after the contrast pass.

## Save/migration impact

New maps only. Existing saved maps retain their generated terrain.

## Status history

- 2026-08-21 — open (live map showed water patches that did not read as a river)
- 2026-08-21 — fixed (added guaranteed broad river spine, explicit banks, and main-map river contrast pass)


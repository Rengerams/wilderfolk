# Trees south of a building disappeared behind it

- Bug: Trees and buildings were painted in two fixed passes, so a tree standing in front of (south of) a building was always covered by that building regardless of feet depth.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (A6 render cache, GFX-01)
- Reporter: full-audit codebase review
- Area: renderer / static occluders
- Owner module: `src/game/renderer/entityComposite.ts` (`drawStaticOccluders`), `src/game/renderer/trees.ts`, `src/game/renderer/buildings.ts`
- Related PR/commit: d2b85e44

## Status history
- 2026-11-07 — open: audit found the tree pass drawn entirely before the building pass.
- 2026-11-07 — resolved: one depth-sorted occluder list interleaves both.

## Observed behavior
The entity layer called the tree pass and then the building pass. Because the later pass always wins, a trunk whose base sat below a building's feet — the case where the tree is nearer the camera and must draw in front — was painted over by the building, and its canopy vanished. The reverse ordering would have broken trees north of buildings, so no fixed order could satisfy both.

## Expected behavior
Static occluders sort by feet depth: a tree south of a building draws after it, a tree north of it draws before.

## Reproduction steps
1. Load any colony with trees and at least one building.
2. Find or place a tree whose trunk base is below a building's footprint bottom.
3. Observe the building paint over the tree instead of the tree standing in front.

## Evidence
- `src/game/renderer/entityComposite.ts` — `drawStaticOccluders` merges `sortedTrees` with `depthSortedBuildings` on `tree.y` against `building.y + height / 2`.
- `drawBuildingGroundwork` paints grounded pads before the merged pass; canopies and building bodies share the sorted pass.

## Root cause
Two independent paint passes instead of one depth-ordered list.

## Fix / proposed fix
One merged static pass; the tree sort reuses the existing cached sort identity and buildings reuse their depth order.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/terrain.regionRevision.test.ts tests/renderSnapshot.dirtyKey.test.ts tests/pathfinding.terrainRevision.test.ts` — PASS (7/7); the draw order itself has no unit contract.
- `npm run test:types` — PASS; `npm run lint` — PASS.
- Visual screenshot matrix — NOT RUN (recorded as verification debt in the audit ledger).

# Shallow water omitted from compact save validation

- Bug: A compact save's fishing docks and water census were validated through the walking grid, so shallow water was misclassified as dry after wading was enabled.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2, PR #161 at commit `c0087fc`
- Reporter: Node.js CI, `tests/saveWorldMap.terrainSeed.test.ts`
- Area: Save/restore migration, terrain, save diagnostics
- Owner module: `src/game/saveLoad.ts` (saved-dock water witness); `src/game/terrain/terrainTraits.ts` (water predicate)
- Related PR/commit: PR #161, corrective commit `807a88a`

## Status history
- 2026-11-22 — resolved: PR #161 Node.js CI passed 473 test files and 3,245 tests on `fc6a795`. All seven GitHub workflows, including 120-day simulation and performance tiers, succeeded.
- 2026-11-22 — investigating: deterministic seed-6422 Oasis test reported zero water cells after shallows became walkable; production and diagnostic water checks updated, CI pending.

## Observed behavior

The compact-save regression counted water using `map.pathGrid[i] === Walkability.Water` and failed its assertion that the Oasis contains any water. Under the canonical walking rule, shallow water is `Walkability.Open`, even though it remains real water and unbuildable for ordinary structures. The saved Fishing Spot seed-repair decision (`saveLoad.terrainHasWaterAt`) and `scripts/inspect-save.mts` incorrectly used the same walkability proxy.

## Expected behavior

Water checks recognize `DeepWater`, `ShallowWater`, and `River`, independently of whether humans can cross a tile. Existing water-dependent Fishing Spots on shallow water must continue to act as witnesses for compact-save seed restoration, without spuriously regenerating a different valley.

## Reproduction steps

1. Generate an Oasis map using seed 6422 and the current v4 map settings, or run `tests/saveWorldMap.terrainSeed.test.ts`.
2. Inspect the L0 path grid's count of `Walkability.Water` in the `honours the terrain seed` case: zero, despite the map having water tiles.
3. Before the fix, `terrainHasWaterAt` also reported a shallow-water tile as dry whenever the path grid existed.

## Evidence

CI assertion: `expected 0 to be greater than 0` at `tests/saveWorldMap.terrainSeed.test.ts:120`. `src/game/saveLoad.ts` previously short-circuited to the path grid and used `!isWalkableTerrainType` as a fallback. Both are walking decisions, not water classification.

## Root cause

The new path-grid semantics correctly allow wading through shallow water; save-load code had conflated the pre-change `Walkability.Water` value with the canonical water terrain trait.

## Fix / proposed fix

`terrainHasWaterAt` now calls `terrainGrid.tileTypeAt` and the existing `terrainTraits.isWaterTerrainType` directly. The saved-seed regression uses water-inclusive L1 buildability for its census and the water trait for dock witnesses. `scripts/inspect-save.mts` reads that same canonical trait, not the blocked path map.

## Save/migration impact

No save schema or terrain-generation recipe changes. Legacy compact saves without `_terrainSeed` are now assessed against their Fishing Spot footprints including wadeable shallow water; no extra seed fallback should happen solely because shallow water is passable.

## Verification result

**PASS** — Node.js CI on `fc6a795`: 473/473 files, 3,245/3,245 tests, zero failed, including the compact-save terrain-seed regression. TypeScript, lint, duplicate-code and semantic-overlap gates passed; all seven GitHub workflows completed successfully.

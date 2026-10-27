# A compact save regenerates different terrain than the valley that was played: 2026-10-09

- Bug: a compact save stores no terrain seed, so after a generator change the same seed + size regenerates a different noise field — every river, coast and lake moves, and water-dependent placements are left standing on land
- Status: resolved
- Date discovered: 2026-10-09
- Version/build: 0.6.5.0 — the owner's save is `_compact: true`
- Reporter: owner, from play — *"water turned into land with this save game"*
- Area: save/migration
- Owner module: `src/game/terrain/terragen.ts`, `src/game/terrainGen.ts`, `src/game/saveLoad.ts`
- Cadence: once per load

## Status history

- 2026-10-09 — open (owner, from play: *"water turned into land with this save game"*, save attached)
- 2026-10-09 — investigating (root cause found in commit `7d87077`; the water counts and the fishing-spot witness below are measured; **no fix has been applied**)
- 2026-10-09 — resolved (the resolved noise seed is recorded and honoured on load, with an evidence-gated pre-change-seed fallback for saves that carry none; three regression tests pass and the owner's save repairs to 13 of 13 fishing spots on water)

## Observed behavior

The owner's save `wilderfolk-New-Frontier-Y3-D3` (version 0.6.5.0, `_compact: true`) records `worldMap: {seed: 6422, preset: "oasis", size: "huge", width: 256, height: 192, _overrides: [...500 tiles...]}` and **nothing else about the ground**. `restoreWorldMapFromSave` regenerates the valley with `generateWorldMap(pixelWidth, pixelHeight, seed, size, preset)` and re-applies the overrides.

What the owner saw as *"water turned into land"* is measured on the regenerated map:

- 458 water cells of 49 152 (**0.93 %**)
- **0 of 13** completed Fishing Spots have water under them — their placement rule requires water in the footprint

Regenerating under the pre-change rule gives 1 526 water cells (**3.10 %**) and **13 of 13** fishing spots with water. So the played world is the pre-change terrain, and the load repaints it.

## Expected behavior

A compact save restores the valley it was written from: the same seed and size produce the same rivers, coast and lakes it was played with, so every water-dependent placement still stands on water and no terrain the player never touched changes.

## Reproduction steps

1. Load the owner's save `wilderfolk-New-Frontier-Y3-D3` (version 0.6.5.0, `_compact: true`). It carries `worldMap: {seed: 6422, preset: "oasis", size: "huge", width: 256, height: 192, _overrides: [...500 tiles...]}` and no terrain seed.
2. Count water on the regenerated map: 458 of 49 152 cells (0.93 %), and 0 of 13 completed Fishing Spots with water under them.
3. Regenerate the same seed + size under the pre-change rule: 1 526 water cells (3.10 %) and 13 of 13 fishing spots with water.

## Evidence

- The saved map record above, and `restoreWorldMapFromSave` regenerating from `seed` + `size` + `preset` and re-applying the overrides.
- The two measured water counts and fishing-spot counts (0.93 % / 0 of 13 against 3.10 % / 13 of 13): the played world is the pre-change terrain.
- The 500 saved overrides are **innocent**: compared tile by tile against the freshly generated base map, 0 turn water into land and 0 turn land into water (all 500 stay land). They are not the cause of the moved water.
- Root cause: commit `7d87077` ("batch 5", 2026-10-08 12:06) introduced `SIZE_TERRAIN_SEED_OFFSET`, so `tseed = hashString(String(seed)) + SIZE_TERRAIN_SEED_OFFSET[size]` instead of `hashString(String(seed))`. A compact save stores no terrain seed, so the same seed + size now generates a different noise field and every river, coast and lake moves.
- Consequence: this is not one save. Any compact save written before a generator-tuning change silently repaints its valley on load, and nothing detects it.

## Root cause

Commit `7d87077` ("batch 5", 2026-10-08 12:06) introduced `SIZE_TERRAIN_SEED_OFFSET`, so the terrain noise seed became `hashString(String(seed)) + SIZE_TERRAIN_SEED_OFFSET[size]` where it used to be `hashString(String(seed))`. A compact save stores only `seed`, `size`, `preset`, the tile dimensions and the sparse `_overrides` — it stores **no terrain seed** — so `restoreWorldMapFromSave` asks the generator for the same `seed` + `size` and receives a different noise field. Every river, coast and lake moves, and the saved overrides land on terrain they were never measured against. Measured, the fishing spots are the proof: 13 of 13 require water under them and 0 have any.

## Regression test

`tests/saveWorldMap.terrainSeed.test.ts` — 3 cases, each built from a real generated map plus a synthetic payload passed through `parseSaveJson` + `loadGameFromParsed`:

1. a compact payload carrying `_terrainSeed` regenerates the same map as `generateWorldMap(w, h, seed, size, preset, terrainSeed)` — equal water counts and equal `pathGrid`;
2. a compact payload with **no** `_terrainSeed` whose completed Fishing Spot sits on pre-change-rule water loads with water under that Fishing Spot — the fallback fires (`terrainSeed` and the whole `pathGrid` are the pre-change map's);
3. a compact payload with **no** `_terrainSeed` and no fishing spots is unchanged — the map equals the current-rule map (its water count differs from the pre-change map's, so a second worldgen would fail the assertion).

## Save/migration impact

**Applied, additive.** `_terrainSeed` is a new optional key on the compact map record; a save that carries it regenerates its own valley, and a save that does not is handled by the witness test above. No version bump and no migration id: the same payload keeps loading, and the next save of a repaired colony writes the seed it actually used. The population rescued is every compact save written before a generator offset/hash tuning change; today such a save reloaded into a different valley with no error and no detection.

## Verification result

`npx vitest run tests/saveWorldMap.terrainSeed.test.ts` — **3 passed**. Neighbouring suites re-run clean: `npx vitest run tests/saveWorldMap.compact.test.ts tests/saveLoad.mapAndReferences.test.ts tests/low-4-save-worldgen.test.ts tests/saveMigration.roundtrip.test.ts` — **24 passed**. `npm run test:types`, `node scripts/check-comments.mjs`, `node scripts/check-docs.mjs` and `npm run lint` all pass.

Measured on the owner's save `wilderfolk-New-Frontier-Y3-D3` with `npx tsx scripts/inspect-save.mts "<path>"`, before → after:

| Measurement | Before (current rule) | After |
| :--- | :--- | :--- |
| Water cells of 49 152 | 458 (0.93 %) | **1 526 (3.10 %)** |
| Completed Fishing Spots with water under them | 0 of 13 | **13 of 13** |
| Flora standing on restored water | 2 of 490 | **0 of 490** |
| Entities outside the restored map | 0 of 1 887 | 0 of 1 887 |
| Restored world size | 256×192 tiles (MATCHES) | 256×192 tiles (MATCHES) |

The restored ground is now the pre-change valley the save was played in — the same rule the fishing docks' own placement proves.

## Related commits or files

- `7d87077` ("batch 5", 2026-10-08 12:06) — introduced `SIZE_TERRAIN_SEED_OFFSET`
- `src/game/terrain/terragen.ts` — the noise seed: `hashString(String(seed)) + SIZE_TERRAIN_SEED_OFFSET[size]`
- `src/game/terrainGen.ts` — `generateWorldMap`, the regeneration entry point
- `src/game/saveLoad.ts` — `compactWorldMapForSave` (records `_terrainSeed`) and `restoreWorldMapFromSave` (regenerates with it, or repairs a seedless save from its own fishing docks)
- [2026-09-16-compact-save-restores-valley-at-wrong-scale.md](2026-09-16-compact-save-restores-valley-at-wrong-scale.md) — the earlier, unrelated compact-save defect (tile/pixel scale)
- Owner's save `wilderfolk-New-Frontier-Y3-D3`

## Fix

**Applied.** Both halves of the plan are in:

1. The compact map record now carries the resolved terrain noise seed (`_terrainSeed`, omitted when the map has none, like `_overrides`), and the restore honours it: an explicit seed wins over `seed` + `size` in the generator's seed rule, and `generateWorldMap` forwards it through the pixel overload to `generateRawTerrain`. Future saves are therefore immune to any offset/hash tuning.
2. A save written before the seed was recorded has none, so the restore regenerates with the current rule and asks the save's own water-dependent placements whether that valley can be the one it was played in. A **completed Fishing Spot** is the witness — its placement rule requires water inside its footprint (`placementUtils.isFootprintOnBuildableTerrain`, worded in `buildingPlacementLabels`). When any completed Fishing Spot's footprint holds no water on the regenerated map, the world is generated **once more** with the pre-offset seed (`legacyTerrainSeed`) and that map is used. A save with no completed Fishing Spot is not tested and pays for one worldgen only. Water is read from the regenerated map's own L0 grid (`pathGrid[i] === Walkability.Water`), falling back to `tileAt` + `isWalkableTerrainType` when a map carries no grid; the footprint is sampled at half a tile including a one-tile margin, and out-of-bounds counts as dry land.

The existing tile/pixel validation (`isUsableMapTileCount`, `maxSavedMapTiles`, the per-axis pixel bounds) is untouched: both generations go through the same path.

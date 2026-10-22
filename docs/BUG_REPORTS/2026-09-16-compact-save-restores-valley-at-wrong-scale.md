# A compact save reloaded the valley at 1/100 scale, so the colony's settlers stood outside the map

- **Bug:** loading a save “failed” — the valley came back as a 160×120 px strip inside a 1600×1200 px world, leaving 1197 of the save's 1202 entities off the map. The world data itself was intact: this was a terrain-regeneration scale error, not corruption.
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** reported from play by the owner (“the savegame failed loading”), with the failing save attached — `wilderfolk-New-Frontier-Y0-D188.json`, 1 258 950 bytes, Large map, year 0 day 188
- **Area:** save/migration
- **Owner module:** `src/game/saveLoad.ts` (`restoreWorldMapFromSave`)
- **Cadence:** once per load

## Status history

- 2026-09-16 — open (reported from play; the player-facing message only guessed at the cause)
- 2026-09-16 — investigating (the save parsed fine — `_version 0.6.4`, `_ticksPerDay 72`, 1 202 entities / 290 humans / 102 buildings / tick 13 542 — so the failure was downstream of the version gate. Ran the file through the real load path outside the browser: it *returned a world*, which pointed at silent corruption rather than a refusal)
- 2026-09-16 — resolved (the tile/pixel mismatch fixed in the owner; the attached save now loads at full scale with 0 entities outside the map; regression test added; suite, build and browser tier green)

## Observed behavior

Loading the reported save produced a broken valley: terrain, entities and buildings no longer agreed with each other, and the game presented it as a failed load. Measured on the attached file before the fix:

```text
_version=0.6.4 · _ticksPerDay=72
worldMap: size=large 160x120 seed=407992 compact=true
RESULT: loaded · tick=13542 entities=1202 buildings=102 humans=283
world state 1600x1200 px · worldMap 16x12 tiles (12 rows, first row 16 tiles) · tile = 100 px
expected 160x120 tiles for that world size — MISMATCH
entities outside the restored map: 1197/1202
```

## Expected behavior

A compact save restores the valley it was written from: the same world size in pixels, the same tile grid, the same seed/preset/size, the terrain regenerated tile for tile, and every entity inside the map.

## Reproduction steps

1. Start a colony on any map (the report used `size: large`), play to day 188 and save to file.
2. Load that file (Load from file, or the browser slot).
3. Before the fix: the valley reloads at 1/100 area and nearly every entity is off-map.

Deterministic reproduction is now `tests/saveWorldMap.compact.test.ts` (preset Large, default Medium, and a custom 640×480 map).

## Evidence

- `terrainGen.ts:606` — `generateWorldMap` returns `{ tiles, width: tileW, height: tileH, … }`, i.e. `WorldMap.width/height` are the **tile** grid.
- `terrainGen.ts:344-345` — the pixel overload divides its arguments by `TERRAIN_TILE_SIZE`: `tileW = ceil(width / TERRAIN_TILE_SIZE)`. Its parameters are **pixels**.
- `worldGen.ts:84-85` — `tileSize = state.width / state.worldMap.width`, confirming the split: `WorldState.width/height` are pixels (1600/1200), `WorldMap.width/height` are tiles (160/120).
- `saveLoad.ts` `compactWorldMapForSave` wrote `width: worldMap.width, height: worldMap.height` (tiles) and `restoreWorldMapFromSave` passed them straight into `generateWorldMap(wm.width, wm.height, …)` (pixels) — 160 tiles became 160 px.
- Inspector output on the attached save after the fix: `worldMap 160x120 tiles (120 rows, first row 160 tiles) · tile = 10 px`, `MATCHES`, `entities outside the restored map: 0/1202`.
- The key check that hid this: `worldMap` is **not** in `WORLD_STATE_SAVE_KEYS` (it is stored compactly and regenerated), so the save/load key loop in `tests/workerBoundary.closure.test.ts` never compared it. That test now asserts the map dimensions explicitly.

## Root cause

`WorldMap.width/height` are tile counts while `generateWorldMap(width, height, …)` takes pixels. Restoring a compact save passed tiles where pixels were expected, so the valley was regenerated at 1/100th of its area — a 16×12 tile map inside a 1600×1200 px world, with `tileSize` reading 100 px instead of 10 and almost every entity outside the bounds. Nothing threw, so the load *looked* like a refusal while the save itself was complete.

## Regression test

`tests/saveWorldMap.compact.test.ts` (3) — for a preset Large map, the default Medium map and a custom 640×480 map, saves and reloads through the real path and asserts: world size in pixels, tile grid dimensions (the exact assertion the bug broke), seed/preset/size, the terrain regenerated tile for tile, and **no entity outside the map**. `tests/workerBoundary.closure.test.ts` gained a `worldMap` assertion so the compact map can never again be invisible to the transport/round-trip check.

## Invariants checked

- Every entity inside the restored map (the player-visible symptom).
- The regenerated terrain is identical to the original, tile by tile, for a fresh world (the compact form is deterministic from seed + size + preset).
- `WORLD_STATE_SAVE_KEYS` fields still round-trip (unchanged by this fix).

## Save/migration impact

No format change and no migration: every save written by this build (and any earlier build that wrote the compact form) restores correctly now, including the attached year-0-day-188 colony. **Known pre-existing limitation, not addressed here:** a compact save does not carry in-play terrain edits (the map is regenerated from seed/size/preset), which is already recorded as a deferred item alongside the terrain-generator replacement.

## Verification result

- `npx tsx scripts/inspect-save.mts <attached save>` — before: 16×12 tiles, 1197/1202 entities off-map; after: 160×120 tiles, tile = 10 px, 0/1202 off-map.
- `npx vitest run tests/saveWorldMap.compact.test.ts tests/workerBoundary.closure.test.ts` — passed (8 tests).
- `npm test` — passed: **150 files / 827 tests**, 0 failures.
- `npm run build`, `npx tsc` (app + vitest), `npm run lint` — passed (0 warnings / 0 errors on 321 files).
- `npm run test:browser` — passed (verdict pass, 0 console errors, 0 page exceptions, 0 bad responses).

## Related commits or files

- `src/game/saveLoad.ts` — `restoreWorldMapFromSave` multiplies the stored tile counts by `TERRAIN_TILE_SIZE`
- `tests/saveWorldMap.compact.test.ts` — new
- `tests/workerBoundary.closure.test.ts` — explicit `worldMap` assertion
- `scripts/inspect-save.mts` — new save inspector used to diagnose this

## Fix

`restoreWorldMapFromSave` now converts the compact form's tile counts to pixels before calling the generator:

```ts
generateWorldMap(
  wm.width * TERRAIN_TILE_SIZE,
  wm.height * TERRAIN_TILE_SIZE,
  wm.seed,
  wm.size ?? 'medium',
  wm.preset ?? 'verdant',
)
```

A second, smaller fix came out of the same report: save refusals now name their real cause (`empty` / `unreadable` / `malformed` / `version-mismatch`, with both versions) through `describeSaveReadFailure`, instead of the two guessed messages the UI showed before — which is why this file had to be diagnosed outside the browser.

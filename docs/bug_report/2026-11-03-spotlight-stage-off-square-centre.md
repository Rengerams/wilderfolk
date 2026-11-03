# Spotlight stage lands off the middle of the Village Square

- Bug: the stage point added half the square's footprint to a value that already was the centre, and the square's painted middle sits 34 px above its footprint centre, so the girl performed on the square's south edge, in front of the fountain and by the silos.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-03
- Version/build: 0.6.5.2 working tree (0.6.5.1 base)
- Reporter: owner gameplay screenshot, "ze moet op het midden van het plein zijn"
- Area: Spotlight Lore stage selection
- Owner module: `src/game/spotlightLore.ts` — `squareStagePoint`, `maybeStartSpotlightLore`, `startSpotlightLoreDebug`, `buildSpotlightLoreScene`
- Related: [Spotlight stage obscures village cast](2026-11-02-spotlight-stage-visibility.md), [Spotlight chorus slots stacked](2026-11-03-spotlight-chorus-slots-stacked.md)

## Status history
- 2026-11-03 — open: the owner's screenshot shows the ring and the heroine at the plaza's south-east rim by a silo; source trace found `square.x + square.width / 2` in both staging paths.
- 2026-11-03 — resolved: both paths read the centre from `getBuildingCenter`, and the stage is lifted to the square's painted middle; targeted tests, TypeScript, lint and build pass.

## Observed behavior

The owner's screenshot of a running scene (caption `4 / 44`) showed the heroine and her ring outside the paved Village Square, overlapping the storage silo south-east of it.

Two independent offsets stacked up:

1. The Village Square is an 80×70 building, and `building.x/y` is already its footprint centre (`buildingGeometry.getBuildingCenter`; the pad is drawn from `x - w/2`, `y - h/2`, and `pathfinding.stampBuildingFootprint` stamps `x ± w/2`). Adding `width / 2` and `height / 2` moved the stage +40/+35 world units to the south-east rim.
2. Copying `x/y` alone still left the girl standing in front of the fountain. `drawBuildingSprite` anchors a sprite at 92% of its drawn height, so the painted middle of the 80×70 square (drawn 80.5 px tall at the 1.15 display scale) sits `(0.92 − 0.50) × 80.5 ≈ 34` world px above `square.y`. A flat plaza anchored like a house hangs above its footprint.

## Expected behavior

The performance stands in the painted middle of the square: the dais between the throne and the fountain. The ring of performers follows that same point.

## Reproduction steps

1. A colony with a completed `BuildingType.Square` at `(520, 360)` and a valid eligible cast.
2. `maybeStartSpotlightLore(world)` (or the debug preview command) starts the scene.
3. Before the fix, `scene.gatherX` was `560` and `scene.gatherY` was `395`, and `tests/spotlightLore.test.ts:213` failed with `expected 560 to be 520`. After the first correction the girl stood in front of the fountain at `y = 360`; the painted middle is `y = 326`.

## Evidence

- Owner gameplay screenshots dated 2026-11-03: first the ring by the silo, then the girl "standing in front of the fountain".
- `npx vitest run tests/spotlightLore.test.ts` before the fix: 2 failed — `expected 560 to be 520` (square staging) and `expected 55 to be less than or equal to 50` (stale ring bound; see below).
- `src/game/buildingGeometry.ts` documents the centre convention and the historical 86 sites that added a half footprint; `src/game/pathfinding.ts` stamps the same centred rectangle.
- `src/game/renderer/spriteDrawing.ts`: `dy = cy - dh * anchorY` with `anchorY = 0.92`, and `src/game/renderer/buildings.ts` draws the square at `h * 1.15`.

## Root cause

The stage logic treated `square.x/y` as a top-left corner (adding half the footprint), and the square sprite is bottom-anchored, so even the true footprint centre maps to the plaza's southern paving rather than the painted middle.

## Fix / proposed fix

`squareStagePoint` reads the centre from `buildingGeometry.getBuildingCenter` and lifts it by `SPOTLIGHT_SQUARE_ART_LIFT_PX` (34), the sprite-anchor offset documented on the constant. Both staging paths use it, and the dev-preview candidate list reuses the same point. The separately widened chorus ring (55 px) is the owner's deliberate change, so the test's upper bound moved from 50 to 60 with a note; the staging assertion now pins the lifted point instead of the footprint centre.

## Save/migration impact

None. Only newly created scenes get the corrected origin; a ready scene saved earlier keeps its stored `gatherX/gatherY` and is still validated by `normalizeSpotlightLoreOnLoad`.

## Verification result

- `npx vitest run tests/spotlightLore.test.ts tests/spotlightChoreography.test.ts` — PASS (37 tests).
- `npm run test:types` — PASS.
- `npm run lint` — PASS (0 warnings, 0 errors).
- `npm run build` — PASS, including the duplicate-code and semantic-overlap gates.
- Browser capture — NOT RUN in this session (no running dev server or staged save); the staging position is covered by the unit test and the owner's visual check.

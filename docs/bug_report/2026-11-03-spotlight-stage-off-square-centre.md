# Spotlight stage lands half a footprint off the Village Square centre

- Bug: the stage point was built as `square.x + square.width / 2`, but a building's `x/y` already is the footprint centre, so the girl was staged on the square's south-east rim instead of its middle.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-03
- Version/build: 0.6.5.2 working tree (0.6.5.1 base)
- Reporter: owner gameplay screenshot, "ze moet op het midden van het plein zijn"
- Area: Spotlight Lore stage selection
- Owner module: `src/game/spotlightLore.ts` — `maybeStartSpotlightLore`, `startSpotlightLoreDebug`, `buildSpotlightLoreScene`
- Related: [Spotlight stage obscures village cast](2026-11-02-spotlight-stage-visibility.md), [Spotlight chorus slots stacked](2026-11-03-spotlight-chorus-slots-stacked.md)

## Status history
- 2026-11-03 — open: the owner's screenshot shows the gold ring and the heroine at the plaza's south-east rim, in front of a silo, while the square stood empty; source trace found the half-footprint offset in both staging paths.
- 2026-11-03 — resolved: both paths read the centre from `getBuildingCenter`; targeted tests, TypeScript, lint and build pass.

## Observed behavior

The owner's screenshot of a running scene (caption `4 / 44`) shows the heroine and her ring just outside the paved Village Square, overlapping the storage silo south-east of it. The chorus ring, title banner and caption were otherwise correct.

The Village Square is an 80×70 building. `building.x/y` is the footprint centre (`buildingGeometry.getBuildingCenter`; the pad, sprite and placement ghost are drawn from `x - w/2`, `y - h/2`, and `pathfinding.stampBuildingFootprint` stamps `x ± w/2`). Adding `width / 2` and `height / 2` therefore moved the stage +40/+35 world units south-east — onto the square's rim, where the silos stand.

## Expected behavior

A completed Village Square is the stage and its centre is the gathering point. The existing unit test already encoded that contract: `expect(scene.gatherX).toBe(square.x)`.

## Reproduction steps

1. A colony with a completed `BuildingType.Square` at `(520, 360)` and a valid eligible cast.
2. `maybeStartSpotlightLore(world)` (or the debug preview command) starts the scene.
3. Before the fix, `scene.gatherX` was `560` and `scene.gatherY` was `395`, and `tests/spotlightLore.test.ts:213` failed with `expected 560 to be 520`.

## Evidence

- Owner screenshot dated 2026-11-03: ring and heroine at the square's south-east rim by the silo.
- `npx vitest run tests/spotlightLore.test.ts` before the fix: 2 failed — `expected 560 to be 520` (square staging) and `expected 55 to be less than or equal to 50` (stale ring bound; see below).
- `src/game/buildingGeometry.ts` documents the centre convention and the historical 86 sites that added a half footprint; `src/game/pathfinding.ts` stamps the same centred rectangle.

## Root cause

Two new locals in `maybeStartSpotlightLore` and `startSpotlightLoreDebug` treated `square.x/y` as a top-left corner and added half the footprint. The committed staging code used `square.x/y` directly, which was already the centre.

## Fix / proposed fix

Read the point from the canonical owner, `buildingGeometry.getBuildingCenter(square)`, in both staging paths; the dev-preview candidate list reuses the same value. The separately widened chorus ring (55 px) is the owner's deliberate change, so the test's upper bound moved from 50 to 60 with a note; the staging assertion is untouched.

## Save/migration impact

None. Only newly created scenes get the corrected origin; a ready scene saved earlier keeps its stored `gatherX/gatherY` and is still validated by `normalizeSpotlightLoreOnLoad`.

## Verification result

- `npx vitest run tests/spotlightLore.test.ts tests/spotlightChoreography.test.ts` — PASS (37 tests).
- `npm run test:types` — PASS.
- `npm run lint` — PASS (0 warnings, 0 errors).
- `npm run build` — PASS, including the duplicate-code and semantic-overlap gates.
- Browser capture — NOT RUN in this session (no loaded colony/save available); the centring is covered by the staging unit test that failed before the fix.

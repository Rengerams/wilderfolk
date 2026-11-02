# Spotlight chorus slots stacked the men on each other in front of the heroine

- Bug: the stage builder placed all chorus slots on one shallow arc south of the girl, 27–36 px away and 9–14 px apart, so their sprites overlapped and none of them left her standing clear in the middle.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-03
- Version/build: 0.6.5.1 working tree (0.6.5.2 development)
- Reporter: owner gameplay screenshot ("she should stand in the middle, the guys enough space around her, not standing on each other")
- Area: Spotlight Lore stage layout (simulation slots) and canvas presentation
- Owner module: `src/game/spotlightLore.ts` — `buildSpotlightLoreScene`
- Related PR/commit: none yet (uncommitted change in the working tree)

## Status history
- 2026-11-03 — resolved: slots now form one evenly spaced ring around the heroine, measured and captured in the browser; TypeScript, lint and build pass.

## Observed behavior

The owner's screenshot of a live scene shows the girl (a child, name plate at the top of the clump) with eight to ten men packed into a band below her: sprites overlap each other and every name plate lands on the one beneath it.

Measured on the real code path (`startSpotlightLoreDebug` on a completed Village Square, 960×720 medium map, nine-man chorus):

- every slot 27–36 px from the heroine,
- closest pair of slots **12.92 px** apart,
- a settler sprite is ~14 px wide (10 × 1.35) and ~20 px tall in world units at the 1.75 stage zoom, so neighbouring men overlap; a screenshot at that zoom shows two men drawn as one figure.

The whole chorus stood south of her because the arc was authored from `0.12π` to `0.88π` in screen coordinates.

## Expected behavior

The girl is the stage: she keeps the middle, the chorus surrounds her with enough ground that no two performers cover each other, and the camera side stays open so her own sprite is not hidden behind the front row.

## Reproduction steps

1. Build a colony with a completed Village Square, a 12–17-year-old girl and at least six adult men (or use the `?debug=1` Guide card's "Run Spotlight Event" preview).
2. Start the scene and let it reach `ready`, then read `world.spotlightLore.slots`.
3. Observe the slots clustered on a 27–36 px arc south of `gatherX/gatherY`, with the closest pair 12.92 px apart — below one sprite width.

## Evidence

- Slot dump before the fix: `pairMin 12.92`, `girlMin 27`, `girlMax 36` for a nine-man chorus (seed 12345, square at 510,340).
- Browser capture before the fix: the cast reads as one clump with the heroine at its top edge.
- Regression test `tests/spotlightLore.test.ts` → "rings the chorus around the heroine instead of stacking the men in front of her" fails on the arc and passes on the ring.

## Root cause

`buildSpotlightLoreScene` distributed the chorus over a 0.76π arc at radius 27 + (i % 2) × 9 px. At six to ten men the chord between neighbours is 9–14 px, which is narrower than a settler sprite, and the alternating radius only staggered the overlap. Because the arc was placed entirely south of the heroine, the whole cast also crowded the camera side of her instead of surrounding her.

## Fix / proposed fix

One ring at `SPOTLIGHT_RING_RADIUS_PX = 40` around the heroine, starting half a step past south so the front stays open; the stage centre is clamped inward so the ring always fits on the map instead of collapsing slots at a map edge. A slot closer than `SPOTLIGHT_MIN_SLOT_GAP_PX = 16` to another (only possible after walkability snapping) refuses the ground rather than staging a stacked cast. Walkability snapping, arrival tolerance and the single movement owner are unchanged.

## Save/migration impact

None. Scene slots are transient presentation data; an already-saved ready scene keeps its stored slot coordinates and still validates exactly as before. No schema or field changes.

## Verification result

- `npx vitest run tests/spotlightLore.test.ts` — PASS, 27 tests, including the new ring regression.
- Related suites (`spotlightChoreography`, `spotlightApplause`, `spotlightReturnState`, `spotlightAudioRace`, `spotlightMusic`) — PASS, 19 tests.
- `npm run test:types` — PASS.
- `npm run lint` — PASS.
- `npm run build` — PASS (includes call-graph, overlap, duplicate and comment gates).
- `npm run check:source` — PASS (docs and comment checks).
- Browser acceptance via `scripts/autoplay_playwright_probe.py --spotlight-save … --spotlight-screenshot …` — PASS: overlay visible, blackout cleared, banner "Edda has the look!", caption `1 / 44`, no page errors; captured before/after shows the cast ringed around her with separated sprites.

# Bug: Building sprites use a generic footprint layout

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: User-requested live rendering audit
- Area: Play | UI
- Owner module: `src/game/renderer/buildings.ts` and `src/game/renderer/spriteDrawing.ts`
- Cadence: Canvas 2D render frame; presentation-only

## Status history

- 2026-08-21 — open (user reported that buildings looked visually off)
- 2026-08-21 — investigating (reproduced in the local Verdant live scene and traced to generic sprite geometry)
- 2026-08-21 — resolved (catalog-scale and anchor layout implemented; automated and live Canvas checks passed)

## Observed behavior

Buildings with substantially different source-art framing and perspective are rendered through the same centered, generic footprint geometry. The unfinished and completed Leader’s House therefore reads as a compressed, poorly grounded small object despite its large official-residence source art and 12-bed role. Its base competes with foliage, labels, and the generic pad rather than reading as a large building on the terrain.

## Expected behavior

Every building sprite should have a readable, intentionally grounded visual footprint. Oversized or atypically framed art must be able to declare a display scale and vertical anchor that align its visible base with its terrain pad without changing authoritative placement, collision, or simulation state.

## Reproduction steps

1. Start a small Verdant settlement.
2. Observe the automatically placed Leader’s House at 145% zoom while it is under construction and after it completes.
3. Compare its visual size and bottom edge with its foundation, surrounding trees, and the tightly framed standard House sprite.

## Evidence

The live scene confirmed the Leader’s House transitions normally from construction to two resident slots, so this is not a state or lifecycle issue. `house.png` is tightly framed at 108×112; `house_leader.png` is a 1148×912 compound with a much larger visual mass. Both use `drawBuildingSprite()` with the same generic `getBuildingSpriteDrawBounds()` behavior and default anchor. The building configuration supplies a display-scale escape hatch but no vertical sprite anchor.

## Root cause

The building renderer derives every non-panel sprite’s draw size and anchor from only world-footprint width, height, and a generic 0.92 anchor. It has no per-building visual anchor or default scale policy, so art with different framing cannot align cleanly with the pad.

## Fix

Resolved. `BuildingConfig` now supports optional presentation-only `spriteDisplayScale` and `spriteAnchorY` metadata. Both unfinished, completed, and placement-preview sprite paths consume these values. The Leader’s House uses a 1.32 display scale and a 0.97 bottom-grounded anchor; world footprint, placement, and simulation state remain unchanged.

## Regression test

Implemented in `tests/renderer.presentationLayout.test.ts`. It proves the Leader’s House catalog values produce larger-than-generic draw bounds and retain the 0.97 visual anchor.

## Invariants checked

- Rendering remains presentation-only and does not write `WorldState`.
- Building collision, placement, construction, residency, and worker ownership are unchanged.
- The worker-authoritative simulation snapshot remains the only source of building state.

## Save/migration impact

None. The new catalog values are render-only defaults; existing building saves use their same type, position, dimensions, and state.

## Verification result

Resolved — focused geometry tests, TypeScript, scoped ESLint, production build, and the full suite (**59 files / 358 tests**) passed. In the running local game, a standard House was placed successfully and construction/state progression remained normal.

## Related commits or files

- `src/game/buildings.ts`
- `src/game/renderer/buildings.ts`
- `src/game/renderer/spriteDrawing.ts`
- `src/game/renderer/buildPreview.ts`
- `tests/renderer.presentationLayout.test.ts`
- `BUG REPORTS/2026-08-21-building-sprites-use-generic-footprint-layout.md`

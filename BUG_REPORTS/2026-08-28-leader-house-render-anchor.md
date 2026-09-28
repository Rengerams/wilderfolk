# Bug: Leader’s House sprite, shadow, and placement footprint do not share an anchor

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer-provided gameplay screenshot
- Area: Play | UI
- Owner module: building rendering and building configuration
- Cadence: Render/placement presentation; must not mutate simulation state

## Status history

- 2026-08-28 — investigating: gameplay screenshot showed the Leader’s House art far above the selected placement footprint and shadow.
- 2026-09-09 — still investigating: re-verified against HEAD — leader-house config, renderer anchor path, and the sprite asset are unchanged since before the report; the art carries ~8% bottom padding above the anchor baseline. Visual confirmation still required.
- 2026-09-10 — resolved: `house_leader.png` has an ~86px transparent band under the painted base (base ≈ 91.6% of the 1024px frame), so anchoring by the image bottom (0.97) floated the visible house. `spriteAnchorY` tuned to 0.836 so the painted base meets the same ground line as edge-to-edge buildings (base ~1.0 at default anchor 0.92). `tests/renderer.presentationLayout.test.ts` now asserts the tuned anchor sits below the generic 0.92.

## Observed behavior

The Leader’s House is drawn visibly above its cyan placement bounds and dark ground shadow. Nearby rendering, including the Lumber Mill, reinforces the incorrect vertical relationship.

## Expected behavior

The visual sprite, shadow, interaction/placement bounds, and configured building footprint share the same ground anchor. Tall art may extend upward from that anchor, but the building must not appear to float above its footprint.

## Reproduction steps

1. Build or select a Leader’s House.
2. Observe its sprite base, ground shadow, selection/placement bounds, and surrounding grid.
3. Compare the sprite anchor with the bounds and shadow.

## Evidence

Developer-provided local gameplay screenshot on 2026-08-28.

## Root cause

Pending investigation of Leader’s House building config, sprite metadata, renderer anchor, shadow, and selection bounds.

## Fix

Pending investigation. Rendering-only correction must retain the authoritative building position, dimensions, collision, placement validation, and save data.

## Regression test

Pending: rendering/config assertion or deterministic screenshot/manual visual check for base alignment.

## Invariants checked

Not applicable — render/placement presentation must not mutate authoritative building state.

## Save/migration impact

Not applicable — visual configuration only unless evidence establishes an incorrect authoritative footprint.

## Verification result

Pending.

## Related files

- `src/game/buildingConfig.ts`
- `src/game/renderer*.ts`
- Leader’s House sprite metadata/assets

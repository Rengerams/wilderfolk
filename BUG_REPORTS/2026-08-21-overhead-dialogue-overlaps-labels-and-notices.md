# Bug: Overhead dialogue overlaps labels and construction notices

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: User-reported live rendering defect
- Area: Play | UI
- Owner module: `src/game/renderer/humans.ts` and `src/game/renderer/markers.ts`
- Cadence: Canvas 2D render frame; presentation-only

## Status history

- 2026-08-21 — open (user reported that dialogue above settlers is not readable)
- 2026-08-21 — investigating (live scene and render-order inspection confirmed independent overhead systems collide)
- 2026-08-21 — resolved (speech priority, collision spacing, and text-layer order implemented; automated and live checks passed)

## Observed behavior

Conversation bubbles and identity labels can collide with other overhead notices, making the visible text difficult to read. In the live scene, the selected leader’s large name plate and the building-completion notice appeared in the same central overhead region; the current renderer has no shared layout reservation between speech, name labels, status markers, and floating texts.

## Expected behavior

Active dialogue must remain readable above the speaker. Name labels should not compete with active dialogue, and unrelated floating notifications should not render directly through people’s speech/name area.

## Reproduction steps

1. Start or load a settlement with a leader and active construction.
2. Wait for a conversation and/or building completion near the same settlers.
3. Observe the name plate, speech bubble, and floating completion message above the character.

## Evidence

`drawHumans()` creates speech bubbles and name labels independently. `drawFloatingTexts()` uses a separate fixed 60px grid and does not reserve human overlay rectangles. `paintWorldEntityLayer()` draws floating text after humans, so a construction notification may overpaint speech/name overlays. The human label position uses a fixed talking offset and does not reserve the real bubble height.

## Root cause

The Canvas renderer has no shared per-frame overhead-label layout. Speech bubbles, name plates, crown/status marks, and floating texts calculate positions independently and are composited in conflicting order.

## Fix

Resolved. Active dialogue retains its directly-above-head position and becomes the sole human text label while visible; the name plate yields. The renderer reserves and vertically stacks overlapping active bubbles, adds crown clearance for leaders, and draws floating simulation notices before humans so speech/name text remains the final readable overhead layer.

## Regression test

Implemented in `tests/renderer.presentationLayout.test.ts`. The test proves active speech hides the competing name plate, leader clearance is larger, overlapping bubbles stack with a gap, and floating notices render before human overlays.

## Invariants checked

- Dialogue state, timing, and simulation cadence remain unchanged.
- The correction changes only Canvas placement and visibility of presentation text.
- Worker snapshots remain read-only inputs to the renderer.

## Save/migration impact

None. No saved game state changes.

## Verification result

Resolved — scoped lint, TypeScript, focused layout tests, production build, and the full suite (**59 files / 359 tests**) passed. In the running local game, the short “Wood pile low.” speech bubble stayed directly above the leader’s head and separate from the leader name plate.

## Related commits or files

- `src/game/renderer/humans.ts`
- `src/game/renderer/markers.ts`
- `src/game/renderer/entityComposite.ts`
- `src/game/renderer/overheadLayout.ts`
- `tests/renderer.presentationLayout.test.ts`
- `BUG REPORTS/2026-08-21-overhead-dialogue-overlaps-labels-and-notices.md`

# Spotlight opening camera and music cues lost when the tab is throttled

- Bug: the intro camera focus and soundtrack start were gated on the animation frame still being `intro`, so a backgrounded-then-resumed tab skipped both cues and played the scene from the old camera with no score.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1 code base, merged PR #91 (`2a9f1a72dce8e112c5e8e6adc53e7c0e62bf5397`)
- Reporter: PR #91 implementation review
- Area: Spotlight presentation — cinematic opening
- Owner module: `src/components/SpotlightLoreOverlay.tsx` (`paint`); the cue predicate now lives in `src/components/spotlightChoreography.ts`
- Related PR/commit: [#91](https://github.com/Rengerams/wilderfolk/pull/91)

## Status history

- 2026-11-02 — open: review found both cues inside the `intro` frame branch.
- 2026-11-02 — resolved: cues are elapsed-time driven, fire once after a skipped frame, and stay silent in the applause.

## Observed behavior

`paint` ran `spotlightFrameAt(elapsed)` and `spotlightOpeningFrame(elapsed)`, then executed the camera-focus and `playSpotlightMusic()` calls only inside `if (step.kind === 'intro')`. RequestAnimationFrame stops while the tab is hidden. If the tab was hidden after a first frame and shown again after the 4.8-second intro, the next frame's `step.kind` is `caption`, so:

- `onCameraTarget` is never called and the performance plays at the pre-scene camera, with captions clamped to the viewport edge;
- `playSpotlightMusic()` is never called, so the supplied instrumental is silent for the whole scene;
- the blackout still clears correctly because its opacity comes from `spotlightOpeningFrame`, which is why the failure looks like "the scene starts in the wrong place" rather than a stuck black screen.

## Expected behavior

The opening cues belong to wall-clock thresholds (500 ms focus, 1650 ms score), not to the transient frame kind. A skipped frame must not drop them, and they must still fire at most once. Starting the score after the intro is acceptable; starting it at the applause would not be.

## Reproduction steps

1. Deterministic trace: take the choreography of the current scene and evaluate the cue decision at `SPOTLIGHT_INTRO_MS + 200` with `stepKind = 'caption'` and no cue started yet.
2. Before the fix the only call site required `stepKind === 'intro'`, so both actions were false at that elapsed time.
3. After the fix `spotlightOpeningCues(SPOTLIGHT_INTRO_MS + 200, 'caption', { camera: false, music: false })` returns `{ focusCamera: true, startMusic: true }`, and returns both false at `SPOTLIGHT_APPLAUSE_START` with `stepKind = 'applause'`.

## Evidence

- `src/components/SpotlightLoreOverlay.tsx` before the fix: `if (step.kind === 'intro') { if (opening.cameraShouldFocus) ...; if (opening.musicShouldStart && !soundtrackStarted) ... }`.
- `src/components/spotlightChoreography.ts` now exports `spotlightOpeningCues`, a pure predicate over elapsed time, frame kind and the two once-only flags.
- `tests/spotlightChoreography.test.ts` regression `keeps the opening cues outside the intro frame after a throttled tab` covers the normal intro, the skipped-intro resume, the already-started case and the applause guard.

## Root cause

Orchestration coupled an elapsed-time cue to the current animation step. The step changes when throttling skips frames, but the cue should remain due until it has been consumed.

## Fix / proposed fix

Added `spotlightOpeningCues(elapsedMs, stepKind, started)` in the presentation cue owner and call it from `paint`; the overlay tracks `cameraFocused` and `soundtrackStarted` so each cue runs once, and both are suppressed during the applause/finale. No simulation state, timing constant or audio routing changed.

## Save/migration impact

None.

## Verification result

- `npm test -- unit spotlight` — PASS, 41 tests / 6 files (`tests/spotlightChoreography.test.ts` now 9 tests).
- `npx tsc -p tsconfig.app.json --noEmit` — PASS.
- `node scripts/test.mjs lint` — PASS, 0 errors.
- `node scripts/check-function-overlap.mjs` — PASS, 0 unresolved matches.
- `npm run build` — PASS.
- Real browser throttling, audio playback and CI — NOT RUN; this is a wall-clock orchestration regression covered at the pure-cue level.

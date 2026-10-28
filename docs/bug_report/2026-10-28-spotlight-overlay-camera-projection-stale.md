# Spotlight halo and speech bubbles drift from characters during camera easing

- Bug: spotlight and speaker captions were projected from a React camera snapshot that stops refreshing after simulation pauses, while GameLoop continues easing and drawing its camera every animation frame.
- Status: resolved in code on PR #91, CI and browser verification pending
- Severity: medium (P2)
- Discovered: 2026-10-28
- Reporter: Codex review thread on PR #91
- Owner: `src/components/SpotlightLoreOverlay.tsx`; `src/App.tsx` passes the current render-camera accessor
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Observed behavior and cause
At high simulation speed, all speakers can reach their places before the camera has fully eased. App's React `view.camera` prop stops updating when paused because the game loop skips UI React notifications without a simulation change. The canvas camera does continue smoothing through `updateView`, so the spotlight halo and caption locations stay stuck at stale screen coordinates.

## Fix
Instead of relying on React's stale view snapshot, the stage reads `GameLoop.getView().camera` every presentation animation frame, transforms the already-resolved actual character coordinates using the canonical `worldToScreen`, and updates only the three overlay DOM presentation styles. No game entities, pause state or camera controller are mutated by the stage. No population-wide search or React component render is scheduled by this animation loop. The RAF is cleaned up on scene change/unmount.

## Reproduction and verification
1. Start a spotlight at fast simulation speed and let real villagers gather.
2. Watch the camera still easing after the simulation pauses and the first speaker lines begin.
3. Halo tracks the juvenile and caption tracks the real speaker rather than drifting away.
4. Skip or complete the scene, verify presentation RAF is removed and pre-scene view restored.

**Verification:** source implementation complete on PR #91. Live browser visual verification and latest CI result remain pending. No claim of verified screenshot or FPS measurement.

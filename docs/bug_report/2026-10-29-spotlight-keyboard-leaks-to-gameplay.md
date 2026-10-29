# Spotlight overlay lets gameplay keyboard shortcuts pass through

- Bug: During the Spotlight performance, map hotkeys remain active and Escape does not skip the scene.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: PR #91 current branch
- Reporter: [Codex review #4406318586](https://github.com/Rengerams/wilderfolk/pull/91#discussion_r4406318586)
- Area: presentation overlay and keyboard ownership
- Owner module: `src/components/SpotlightLoreOverlay.tsx` (scene/presentation), `src/hooks/useOverlayKeyboard.ts` (existing shared keyboard contract)
- Related PR: #91

## Status history
- 2026-10-29 — investigating: source review confirmed the overlay had pointer blocking and a Skip button but no keyboard claim; shared hook integrated and source regression committed, CI/browser verification pending.

## Observed behavior
While an active Spotlight scene pauses simulation, the normal gameplay hotkey handler remains reachable. Movement/zoom/selection shortcuts can move the camera away from the performance; Escape acts on the map rather than the scene.

## Expected behavior
The overlay claims keyboard ownership for its entire visible lifetime, suppressing gameplay shortcuts and routing Escape to exactly the same idempotent `skip` callback as the visible Skip button.

## Reproduction steps
1. Begin a scene with valid Spotlight gathering and wait until paused presentation.
2. Send keyboard movement/zoom keys and then Escape while the overlay is mounted.
3. Previously no keyboard claim was held and game hotkeys handled the input. With the shared hook installed, `useKeyboardControls` yields and Escape invokes `skip`.

## Evidence
- `SpotlightLoreOverlay.tsx` previously imported no `useOverlayKeyboard` and did not claim `keyboardOwnership`.
- `tests/keyboardGuards.contract.test.ts` now includes Spotlight among overlays required to delegate to the hook and checks the common Escape/Skip path.
- [Review finding](https://github.com/Rengerams/wilderfolk/pull/91#discussion_r4406318586).

## Root cause
Spotlight's custom full-screen presentation overlay bypassed the existing two-part keyboard contract, unlike the other modal overlays.

## Fix
Use `useOverlayKeyboard('spotlight-lore', skip)` unconditionally while the Spotlight overlay is mounted, reusing existing ownership and Escape behavior. Do not duplicate the keyboard listener, alter simulation state, or add aliases.

## Save / migration impact
None.

## Verification result
- Code trace: PASS.
- Added contract regression: NOT YET RUN.
- Latest-head CI and browser acceptance: NOT YET RUN.

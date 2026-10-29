# Spotlight cinematic zoom skipped at an already-centered camera

- Status: fixed in PR #91 source; live browser verification pending
- Severity: medium
- Detected: 2026-10-28
- Area: Spotlight camera and cinematic opening
- Owner: `src/App.tsx`
- Related: https://github.com/Rengerams/wilderfolk/pull/91

## Observed defect

The `aimSpotlightCamera` callback returned immediately if the existing camera target was within 0.2 world units of the girl. That condition ignored the camera's target zoom. A player already looking at her at a different zoom would never get the intended 1.75× cinematic zoom, even though the new blackout and spotlight cue ran.

## Expected

Both position and zoom must match before the camera callback becomes an O(1) no-op. The camera remains App-owned; the worker and world coordinates are untouched.

## Correction

Check the position tolerance **and** `Math.abs(current.camera.targetZoom - 1.75) < 0.005` before returning; otherwise use existing `focusCameraOn` and `clampCameraTarget`. No new camera controller or save fields.

## Verification

Source-level conditional audit confirmed the original bug and the correction. The previous PR-head Node.js CI and 120-day simulation passed before this fix. Browser cinematic zoom verification on this change remains pending.

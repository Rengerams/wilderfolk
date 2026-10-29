# Pending gameplay background music could restart during Spotlight soundtrack

- Status: fixed in PR #91 source; live browser verification pending
- Severity: medium
- Detected: 2026-10-28
- Area: audio lifecycle / async music loading
- Owners: `src/audio/backgroundMusic.ts`, `src/audio/trackPlayer.ts`
- Related: https://github.com/Rengerams/wilderfolk/pull/91

## Observed defect

`BackgroundMusicPlayer.start()` awaited an HTML media play promise, a context unlock, or `TrackPlayer.playLoop()`. Meanwhile `suspendForSpotlight()` paused the gameplay bed, but an unresolved async start could subsequently complete and reattach the regular music track **on top of** the Spotlight instrumental.

## Expected

Only the active audio session may connect a decoded music source. Ending Spotlight must restore the previous gameplay bed exactly once, including when a previous startup is still settling.

## Correction

A per-player `playbackRevision` invalidates pending operations when `stop()` suspends playback. Each async checkpoint checks the revision. `TrackPlayer.playLoop()` now has a backward-compatible optional `shouldStart` predicate evaluated after sample decoding and before creating its sound nodes. Session restoration waits for pending startup to settle before ensuring regular music again.

## Verification

Added `tests/spotlightAudioRace.test.ts` to prove a pending decode cannot connect to the music bus after cancellation and invalidated requests do not fetch samples. Node.js CI for the new head and actual browser audio switching are not yet confirmed.

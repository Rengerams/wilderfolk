# Bug: Intro screen blocks starting a new game
- Status: investigating
- Date discovered: 2026-08-25
- Version/build: current working tree
- Reporter: User report
- Area: Play | UI
- Owner module: `src/game/IntroScreen.tsx`
- Cadence: Presentation-only intro reveal

## Status history
- 2026-08-25 — open (user reported an oversized logo and inability to start a game)
- 2026-08-25 — investigating (intro CTA was delayed until the 19.8-second ready beat)

## Observed behavior
The intro logo occupies a large portion of the central screen, and the visible start CTA does not appear until the long intro timeline reaches its ready phase. This makes starting a new game appear unavailable or broken.

## Expected behavior
The logo should provide branding without dominating the screen, and the player should reach the map setup screen promptly after the short reveal.

## Reproduction steps
1. Open the Wilderfolk app.
2. Wait through the intro reveal or try to start before the ready phase.
3. Observe the 160px desktop logo and the delayed `Choose your land` action.

## Evidence
`IntroScreen.tsx` used `sm:h-40 sm:w-40` for the logo and scheduled the ready state at `19800` milliseconds. The continuation callback correctly transitions from intro to map setup in `App.tsx`.

## Root cause
The presentation timeline was tuned as an unhurried 20-second intro, while the player-facing CTA and keyboard/click continuation were gated on the final ready phase.

## Fix
Reduced the logo to `h-20 w-20 sm:h-28 sm:w-28` and moved the ready beat to 6000 milliseconds. Simulation state and the map setup transition are unchanged.

## Regression test
Validate the production build and manually confirm that the intro reaches `Choose your land` promptly and that the action opens map setup.

## Invariants checked
- No simulation or worker state is mutated by the intro change.
- `App.tsx` remains the sole owner of the intro-to-map-setup transition.
- The map setup start command remains unchanged.

## Save/migration impact
None. This is presentation-only.

## Verification result
Pending focused build and live UI verification.

## Related files
- `src/game/IntroScreen.tsx`
- `src/App.tsx`

## Follow-up evidence
- 2026-08-25 — screenshot showed the map-setup header logo rendering at approximately 700px despite `h-10 w-10`, indicating a styling/build override beyond the JSX utility class.
- 2026-08-25 — added explicit 40px by 40px inline dimensions and `flexShrink: 0` to the map-setup logo.


## Root cause correction
- 2026-08-25 — comparison with Git commit `a20bc85` (2026-08-22) showed the project moved from Tailwind `3.4.19` to `4.3.3` in `package.json` without updating `src/index.css`.
- Tailwind v4 did not emit the utility classes used by the JSX, including `h-10`, `w-10`, `h-20`, and `w-20`; the 1024px native logo asset therefore rendered at its intrinsic size.
- 2026-08-25 — replaced the Tailwind v3 directives with the Tailwind v4 `@import "tailwindcss"` entrypoint.


## Related runtime asset failure
- 2026-08-25 — `App.tsx` reported `Failed to load sprite: /sprites/taming_post.png`; the referenced file was absent from `public/sprites`.
- 2026-08-25 — restored the 61,558-byte asset from historical commit `d6a0ed3` where it was present.
- 2026-08-25 — production build now copies `dist/sprites/taming_post.png`; worker-stall diagnosis remains separate and requires runtime worker evidence.

## Related runtime failures
- 2026-08-25 — the preload set also referenced four child sprites under `public/sprites/new_child_set/new/`; they were absent from the current working tree and restored from historical commit `d6a0ed3`.
- 2026-08-25 — `GameWorkerHost` documented a 15-second startup wait but enforced a 3-second timeout, causing slow development bundles to fall back before the worker ready handshake.
- 2026-08-25 — increased the worker initialization timeout to 15 seconds. This changes no simulation cadence or ownership; it only allows the existing ready handshake more time to complete.


## Worker watchdog root cause
- 2026-08-25 — the worker became active without initializing `lastWorkerActivity`; it remained `0` until the first result arrived.
- The watchdog then compared `performance.now() - 0` while the first tick was in flight and immediately classified the healthy first tick as stalled.
- 2026-08-25 — initialized `lastWorkerActivity` when worker activation completes. Worker mode remains enabled when `VITE_USE_GAME_WORKER=1`.

## Follow-up: genuine post-start stall
- 2026-08-25 — worker initialization succeeded, but a later tick still exceeded the 2-second watchdog threshold.
- 2026-08-25 — increased the safety timeout to 10 seconds and added a diagnostic line recording in-flight depth and observed latency before fallback. Worker authority and cadence remain unchanged.

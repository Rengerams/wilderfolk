# Audio lifecycle and mix defects — audit remediation (2026-11-11)

- Bug: the intro theme rewound to 0:00 on any click/key, the HTML fallback path played ~13 dB hotter than the Web Audio path, and the only storm-FX tests were permanently skipped.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §4.5 (audio)
- Area: audio (intro, mix graph, weather feedback tests)
- Owner module: `src/audio/*` (`introMusic.ts`, `graph.ts`, `htmlAudioSync.ts`, `director.ts`, `backgroundMusic.ts`)

## Status history
- 2026-11-11 — resolved: resume-without-rewind, one music-path gain owner, storm gate asserted instead of skipped.

## Observed behavior

- **W-48** Every pointer/key gesture on the intro called `restartPadIfNeeded` → `playLoop`, which stopped the live loop and started a new source at offset 0; the procedural branch also replayed the fanfare and overwrote its fallback timer.
- **W-49** Music on the HTML path used `element.volume = 0.46` while the Web Audio chain multiplies track × music × master ≈ 0.107, so the same track was ~4.3× (≈12.7 dB) louder through one path.
- **W-52** The storm notification and FX tests were `skipIf(!HOSTILE_WEATHER_ENABLED)`, and the flag is a module constant, so they could never run.

## Expected behavior

An interaction during the cinematic must not restart the theme. Both playback paths must mix at the same level. A disabled feature's gate must be asserted, not silently skipped.

## Reproduction steps

1. Open the intro screen and click twice: pre-fix the pad restarted each time (test observed `playLoop` called three times for one start plus two gestures).
2. Play the same track through the HTML and Web Audio paths: pre-fix the element path was ~13 dB louder.
3. `npx vitest run tests/weatherConsequences.test.ts`: two tests permanently skipped.

## Evidence

Audit traces (`introMusic.ts:133-144`, `director.ts:38-40`, `htmlAudioSync.ts:21-23`, `graph.ts:179-205`, `worldEvents.ts:32`, `weatherConsequences.test.ts:100/121`); mutation proof in the new regression (forcing the old rewind branch made `audio.introResume` fail).

## Root cause

The restart helper was named and used as if it were a resume; the HTML path duplicated the level formula instead of asking the mix owner; a module constant made the gate untestable through mocking.

## Fix / proposed fix

- `restartPadIfNeeded` → `resumeIfNeeded`: resume only a paused element, no-op when the same loop is live, restart only a genuinely stopped loop, and never re-arm an existing procedural timer. `start()` now clears only its own attempt so a stop/start race cannot null the replacement.
- `AudioGraph.musicPathGain()` is the single path-gain owner; `htmlAudioVolumeForPath(track, gain)` applies it to both HTML players; `getLevels` removed.
- The two skipped storm tests became one gate test: the flag is false and a storm day produces no notification, float text, particles, storm log line or HP loss. Production flag untouched.

## Save/migration impact

None.

## Verification result

- `npx vitest run` over 8 audio/weather files: **38 passed** (plus one focused intro-resume regression that fails if the rewind is restored).
- `npx tsc -p tsconfig.app.json --noEmit` / vitest project: **PASS**; oxlint: **0**; cycle gate: **PASS**.
- Full `standard` suite: run after integration (see remediation log).

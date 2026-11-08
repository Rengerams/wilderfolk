# Worker roster removal silences settler death audio

- Bug: Worker roster removal silences settler death audio.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: PR #134, a3349fac
- Reporter: Codex review / verification
- Area: src/audio/interactionDetect.ts; src/hooks/useGameAudio.ts
- Owner module: src/audio/interactionDetect.ts; src/hooks/useGameAudio.ts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/134

## Status history
- 2026-11-08 — resolved: traced the production path and verified the targeted regression.

## Observed behavior
gameTick removes dead entities and the worker transports the living roster. The interaction detector skips missing entities, so the removed population cue leaves no sound.

## Expected behavior
Consume actual player death tally increments carried by the worker, including cursed settlers; seed on audio enable and session replacement and include completed-year tallies at rollover. Retained-corpse fallback applies only without an authoritative tally.

## Reproduction steps
1. Inspect PR head a3349fac.
2. Exercise the condition described above using `tests/audio.interactionDetect.test.ts`.
3. Observe the mismatch described in Observed behavior.

## Evidence
gameTick removes dead entities and the worker transports the living roster. The interaction detector skips missing entities, so the removed population cue leaves no sound. The focused tests cover the named regression through the actual owners.

## Root cause
The remaining audio path required a retained corpse.

## Fix / proposed fix
Consume actual player death tally increments carried by the worker, including cursed settlers; seed on audio enable and session replacement and include completed-year tallies at rollover. Retained-corpse fallback applies only without an authoritative tally.

## Save/migration impact
None. Existing world and worker fields are reused.

## Verification result
PASS: npx vitest run tests/audio.interactionDetect.test.ts.

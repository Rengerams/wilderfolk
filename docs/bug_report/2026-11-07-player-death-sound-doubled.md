# A settler death played two cues, and foreign deaths played one

- Bug: A player settler's death played the settler death cue from the interaction pass and again from the population-drop effect; visitor and rival deaths also played the settler cue.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V0.6.5.1 audit (COV-A-02)
- Reporter: full-audit audio/UI coverage pass
- Area: audio / interaction detection
- Owner module: `src/audio/interactionDetect.ts` (`detectInteractionSounds`)
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: audit found two death sinks and an unguarded `Human` type test.
- 2026-11-07 — resolved: one owner emits the cue, gated on settler ownership.

## Observed behavior
`detectInteractionSounds` played `playSettlerDeathSfx` for every dead `Human`, including visitors and caravan carriers. `useGameAudio` separately played `playDeathSound` whenever the living player-settler count dropped, so a settler death was audible twice.

## Expected behavior
One death cue per player settler death; a visitor or rival death is silent unless a future feature says otherwise.

## Reproduction steps
1. Run `detectInteractionSounds` with a living visitor that is dead in the next frame — the settler cue plays.
2. Kill one player settler and let the audio hook run — both cues play.

## Evidence
- `tests/audio.interactionDetect.test.ts` — "stays silent for a visitor or rival death" and "cues one death for a cursed settler dying in wolf form".

## Root cause
Two owners for one sound, with ownership decided by the entity type instead of the faction predicate.

## Fix / proposed fix
The interaction pass is the single death-cue owner and asks `isPlayerHumanShiftOwner`, so a cursed settler dying in wolf form still counts. The duplicate population-drop cue and its ref were removed from the audio hook.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/audio.interactionDetect.test.ts` — PASS (6/6).
- `npm run test:types`, `npm run lint`, `npm run build` — PASS.
- Live audio playback — NOT RUN (no audio capture in this environment).

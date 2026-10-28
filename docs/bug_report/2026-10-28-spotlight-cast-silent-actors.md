# Spotlight presentation accepted gathered cast members who never spoke

- Bug: the 6–10 performer binder permitted eight real gathered adults with only six JSON speaker roles, silently excluding two from all captions.
- Status: investigating — fix and regression committed; CI pending
- Severity: medium (presentation/casting correctness)
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2, PR #93
- Reporter: cross-PR Spotlight integration audit
- Area: presentation-only dialogue
- Owner module: `src/game/dialogueTrees.ts`
- Related PRs: [#93](https://github.com/Rengerams/wilderfolk/pull/93), [#91](https://github.com/Rengerams/wilderfolk/pull/91)

## Status history

- 2026-10-28 — confirmed: PR #93's own schema regression expected eight gathered performers but only six different speakers.
- 2026-10-28 — binder and synthetic 31-caption tests corrected; final CI and PR #91 overlay integration pending.

## Reproduction and observed behavior

Pass a valid six-role group presentation and eight distinct real performer IDs to `bindNumberedPresentationSpeakers`. Before the correction it returned a caption list containing only the first six actor IDs, with the remaining two actors unable to speak.

## Expected behavior

For a Spotlight scene with six through ten gathered adults, **each gathered adult speaks at least once**. Ten authored `speaker_1..speaker_10` roles can reuse actors deterministically in a smaller cast. Never fabricate characters, modify simulation speech fields, shift caption text order or consume RNG.

## Correction

After role binding, compare the set of spoken actor IDs with the actual cast size. Fail closed if any real actor is silent. PR #91 currently owns a ten-role, 31-caption JSON source; actual overlay integration remains on that separate PR.

## Regression and verification

`tests/dialogue.schema13.test.ts` now covers casts of six through ten, 31 preserved lines, and rejection of under-specified scripts. Local test execution and cross-PR UI validation are pending.

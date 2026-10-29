# PR #91 blocked by two unresolved Spotlight function-overlap matches

- Bug: the new strict semantic overlap gate rejects PR #91 at step 3/8, before build and typechecks.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2, PR #91 commit `54e9c15f`, Node.js CI run 40812305398
- Reporter: GitHub Actions
- Area: Spotlight presentation state and cue timing; duplicate-function quality gate
- Owner module: `src/components/spotlightChoreography.ts`, `src/components/spotlightReturnState.ts`, `docs/tools/semantic-overlap-reviewed.json`
- Related PR: #91

## Status history
- 2026-10-29 — investigating: gate reported 2 matches; duplicated caption boundary lookup consolidated and one genuinely distinct snapshot lifecycle pair approved with exact fingerprints and an existing test. Fresh CI verification pending.

## Observed behavior
`npm run test:standard` exits 1 after the call-graph ownership verification passes: two unresolved semantic overlap matches (0.887 for discard/take, 0.845 for captionStart/captionEnd).

## Expected behavior
No unreviewed duplicate functionality or ambiguous aliases are admitted; shared caption lookup has one implementation and genuinely distinct discard/consume session contracts are test-backed, digest-pinned and explained.

## Reproduction steps
1. Check out PR #91 commit `54e9c15f`.
2. Run `npm run test:standard`.
3. Observe the two fingerprints printed by `scripts/check-function-overlap.mjs` at step 3/8.

## Evidence
[CI run 40812305398](https://github.com/Rengerams/wilderfolk/actions/runs/40812305398) and the documented checker output. Existing `tests/spotlightReturnState.test.ts` differentiates discarding an old save's controls from consuming ordinary completion state. `tests/spotlightChoreography.test.ts` pins first-chorus and bridge timing boundaries.

## Root cause
Two privately duplicated cue lookups were nearly identical; independently, session invalidation and one-shot consumption share a mutation but intentionally have distinct return/timing contracts. The newly activated gate treats both as overlap until code is consolidated or one pair is explicitly reviewed.

## Fix
Replace `captionStart`/`captionEnd` with one `captionBoundary(cue, edge)` lookup without altering authored cues or timeline constants. Preserve the two separately meaningful return-state operations and record an exact digest-pinned approval with justification and existing tests in the repository's canonical reviewed-overlaps list; do not weaken the checker.

## Save / migration impact
None. Both operations act on presentation-local transient state.

## Verification result
- CI before correction: FAIL (two unresolved matches).
- Source refactor and test-backed review: COMMITTED.
- Fresh CI after correction: PENDING.

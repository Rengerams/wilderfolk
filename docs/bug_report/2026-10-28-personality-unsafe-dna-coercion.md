# Malformed DNA element coerced during trait lookup

- Bug: a non-string value in a legacy or corrupted trait array could invoke user-provided coercion while evaluating a read-only influence.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1, unmerged Phase A commit `b5942e9`
- Reporter: Phase A review iteration 2, source inspection and focused regression fixture
- Area: personality evaluation / defensive saved-trait handling
- Owner module: `src/game/personality/traitEvaluation.ts`
- Related PR/commit: PR #85; correction commit `873ca47`

## Status history
- 2026-10-28 — investigating: defensive guard and regression committed; final CI verification pending.
- 2026-10-28 — resolved: the string guard and the malformed-element regression pass at the current head.

## Observed behavior
The original `hasOwnProperty` check received unvalidated array elements. A non-string value with an unsafe conversion method can throw instead of being ignored. This is a code-trace finding in a new, unmerged implementation, not an observed live-save failure.

## Expected behavior
Unknown or malformed trait elements are neutral and cannot throw, mutate the entity or advance RNG streams during a pure projection.

## Reproduction steps
1. At commit `b5942e9`, call `evaluateTraitInfluence` with a `traits` array containing an object whose `toString` throws, followed by `'fierce'`.
2. The old lookup calls `hasOwnProperty` on that object, triggering the conversion.
3. After the fix the invalid entry is ignored and the valid `'fierce'` influence is retained.

## Evidence
`src/game/personality/traitEvaluation.ts`, trait loop; new malformed-element regression in `tests/personality.traitEvaluation.test.ts`.

## Root cause
`Array.isArray` checks the container, not the types of its elements. Property-key coercion was reachable without a per-element type check.

## Fix / proposed fix
Reject any non-string element before checking the exhaustive catalog's own properties. Retain the canonical three-slot bound and duplicate skip.

## Save/migration impact
None: PR A does not hydrate or change saved DNA. Deterministic missing-DNA backfill remains scoped to PR B.

## Verification result
- PASS: `npx vitest run tests/personality.traitEvaluation.test.ts` on branch `codebot-tasks`, including the throwing `toString` fixture.

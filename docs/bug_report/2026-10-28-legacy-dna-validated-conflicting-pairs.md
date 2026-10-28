# Saved DNA kept mutually exclusive trait pairs

- Bug: The saved-DNA validator kept both halves of a mutually exclusive pair, so a malformed or hand-edited save could hand a settler Brave and Timid at once.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2 branch `codebot-tasks`, commit `c5c81c5e`
- Reporter: owner code review on PR #90
- Area: save load / settler DNA
- Owner module: `src/game/settlerTraits.ts` (`validSettlerTraits`)
- Related PR/commit: PR #90

## Status history
- 2026-10-28 — open: reported by review as a P2 validation gap for malformed saves.
- 2026-10-28 — resolved: the canonical conflict rule now filters loaded traits; exact regressions pass.

## Observed behavior
`validSettlerTraits` dropped unknown ids, duplicates and anything past three slots, but never consulted `TRAIT_OPPOSITES`, so `['brave', 'timid']` and `['gregarious', 'timid']` were accepted whole while the allocation and inheritance paths refuse to produce them.

## Expected behavior
A loaded set follows the same rules as a rolled one: the canonical conflict check applies, the first of a conflicting pair is kept in written order, and every genuine one-to-three-trait set stays untouched.

## Reproduction steps
1. Call `validSettlerTraits(['brave', 'timid'])`.
2. Before the fix it returned both traits instead of `['brave']`.

## Evidence
`TRAIT_OPPOSITES` in `src/game/settlerTraits.ts` already defines `['brave','timid']` and `['gregarious','timid']`, and `conflictsWith` is the shared check used by `pickTrait` and `inheritSettlerTraits`; the validator was the only DNA path not using it.

## Root cause
The validator re-implemented a partial subset of the allocation rules instead of reusing the existing conflict check.

## Fix / proposed fix
`validSettlerTraits` now skips a value when `conflictsWith(trait, kept)` is true, reusing the existing rule table rather than duplicating it.

## Save/migration impact
None. Valid saved sets are unchanged; only conflicting pairs are trimmed, keeping the trait the save wrote first.

## Verification result
`tests/personality.legacyDNA.test.ts` — PASS: Brave/Timid and Gregarious/Timid keep only their first trait, and the existing valid-set and canonical-derivation cases still pass. A legacy payload written with a conflicting pair loads without it: `['brave', 'timid']` becomes `['brave']` and `['gregarious', 'timid', 'hardy']` becomes `['gregarious', 'hardy']`.

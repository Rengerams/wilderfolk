# Bug: Split dialogue bank has duplicate IDs and mismatched festival categories

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: Integration audit of user-created dialogue category files
- Area: Play | Content pipeline | Worker dialogue loading
- Owner module: `src/game/dialogueTrees.ts`

## Observed behavior

The new split dialogue files contain 108 declared dialogue trees across seven category files, but the initial validation found five festival-file category mismatches and five IDs duplicated across the split files. A direct merge would silently shadow duplicate IDs and leave the `festival` category unavailable to the current typed selector.

## Expected behavior

Every tree ID must be unique across the canonical split bank. Each tree must use its source file's category, and every declared category must be supported by `DialogueCategory` and selected from the appropriate simulation context.

## Root cause

Festival-themed lines were included in multiple category files while the new `festival.json` file still declared several of them as `needs`, `work`, or `social`. The prior monolithic schema did not have a typed `festival` category.

## Fix

Resolved. The five festival trees now use the `festival` category and unique IDs. `dialogueTrees.ts` statically merges the seven category files in a deterministic order, validates source category and duplicate IDs, exposes `festival` as a first-class typed category, and installs the same canonical payload in both the main-thread runtime and worker. The retired `sim_dialogue_trees.json` file has been removed.

## Regression test

Implemented in `tests/dialogueTrees.splitBank.test.ts`. It validates all seven categories, the 108-tree aggregate, unique IDs, supported category typing, and festival-context selection from the canonical split bank.

## Invariants checked

- Dialogue content remains loaded identically in worker and main-thread runtime.
- `humanChat.ts` remains the owner of chat session lifecycle.
- The dialogue loader does not write `WorldState`.
- No silent duplicate-ID override is allowed.

## Save/migration impact

None. Dialogue tree IDs are transient session references; sessions gracefully clear if a tree cannot be resolved.

## Verification result

Resolved. Split-schema validation reported 108 trees with no malformed records, category mismatches, or duplicate IDs. Focused regressions, TypeScript, scoped ESLint, production build, and the complete suite (**62 files / 365 tests**) passed.

## Related files

- `src/game/data/chaos.json`
- `src/game/data/environment.json`
- `src/game/data/existential.json`
- `src/game/data/festival.json`
- `src/game/data/needs.json`
- `src/game/data/social.json`
- `src/game/data/work.json`
- `src/game/dialogueTrees.ts`
- `src/game/simWorker/gameWorker.ts`

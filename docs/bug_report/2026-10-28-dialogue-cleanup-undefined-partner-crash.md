# Missing dialogue partner crashes session cleanup during simulation

- Bug: a paired dialogue whose partner disappeared caused a TypeError in the session cleanup path.
- Status: investigating — patch and regression committed, CI verification pending
- Severity: high
- Date discovered: 2026-10-28
- Version/build: PR #93 at commit `7dac7d4e`
- Reporter: full GitHub Actions standard and Node.js CI
- Area: human chat session lifecycle
- Owner module: `src/game/humanChat.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/93

## Status history

- 2026-10-28 — reproduced in two full-standard CI tests in `tests/residency.dayBoundary.budget.test.ts` on `7dac7d4e`.
- 2026-10-28 — patch and missing-partner unit regression committed to PR #93; final-head CI pending.

## Observed behavior

Both CI workflows reported `TypeError: Cannot set properties of undefined (setting 'chatDialogueSessionKey')` in `clearDialogueSession`. The crash happened while advancing `gameTick` in a large colony, before residency assertions ran. The full standard gate had 2 failed, 2 skipped and 2743 passing tests; the focused dialogue gate passed.

## Expected behavior

If one participant disappears, a paired dialogue is ended without dereferencing missing actors, both reachable participants are released and simulation ticks continue. No change in game outcomes, dialogue selection, speaker duration, save format or RNG.

## Reproduction

1. Start `neighbor.greeting` with two real actors and a four-tick first speech line.
2. Advance the first actor with a resolver returning `undefined` for the second actor, reproducing disappearance during the session.
3. Before the fix, `advanceDialogue` clears the session and its key; `tickHumanChat` then attempts to clear that already-removed key. `participant?.chatDialogueSessionKey !== key` is false when both values are undefined, allowing a write to an undefined participant.
4. Run `tests/dialogue.sessionModes.test.ts` for the narrow regression and `tests/residency.dayBoundary.budget.test.ts` for the original full-tick callers.

## Root cause

Optional chaining on the left side of an inequality was not a presence test. After session release `key` could be `undefined`, matching an absent participant's optional property, which then entered the mutation body. The second cleanup was unnecessary when the key had already been cleared.

## Fix

- Explicitly check `!participant` before reading or mutating its session fields in `clearDialogueSession`.
- Enter the follow-up cleanup branch only if `goneKey` is still nonempty and has no active session.
- Add an exact missing-partner regression that checks no throw, both session locks released and subsequent dialogue eligibility.

## Save/migration impact

None. This only protects an existing in-memory session cleanup path; no stored fields, dialogue trees, worker messages or simulation rules were changed.

## Verification

- Prior-head focused dialogue suite: PASS (90 tests in 16 files), prior to the new regression.
- Prior-head standard and Node.js CI: FAIL with the TypeError above.
- New regression and full CI: pending at report creation.

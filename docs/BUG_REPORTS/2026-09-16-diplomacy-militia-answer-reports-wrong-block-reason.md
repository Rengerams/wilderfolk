# The diplomacy militia answer reports "Need weapons" instead of the owner's "Need spears"

- **Bug:** `getDiplomacyChoiceEligibility(state, event, 'militia')` returned `blockReason: 'Need weapons'` where the L33 contract pins `'Need spears'`, so the refusal float told the player a different requirement than the owner's gate
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous build-repair pass (surfaced by `npm test` after the build was repaired)
- **Area:** Truth
- **Owner module:** `src/game/groupEvents.ts` (diplomacy eligibility owner); pinned by `tests/low-2-events-defense.test.ts`

## Status history

- 2026-09-16 — open (found by the standard suite: 1 failing test in `tests/low-2-events-defense.test.ts`)
- 2026-09-16 — resolved (block reason restored at the owning gate; the file and the full standard suite pass)

## Observed behavior

```text
FAIL tests/low-2-events-defense.test.ts > L33 — the diplomacy resolver answers through the eligibility owner
     > applies the owner gate to the non-resource militia answer too
AssertionError: expected { ok: false, …(1) } to match object { ok: false, …(1) }
-   "blockReason": "Need spears",
+   "blockReason": "Need weapons",
```

Because `respondToDiplomacyEvent` routes every answer through `getDiplomacyChoiceEligibility` (`groupEvents.ts:994`), the same wrong string also reached the player-facing refusal float (`pushFloat`), which is why the test pins both the returned reason and the floating text.

## Expected behavior

The `border_dispute` → `militia` answer refuses with `blockReason: 'Need spears'` from `getDiplomacyChoiceEligibility`, and `respondToDiplomacyEvent` floats exactly `'Need spears'` while leaving the event pending.

## Reproduction steps

1. `npx vitest run tests/low-2-events-defense.test.ts`
2. The case `applies the owner gate to the non-resource militia answer too` fails with `blockReason: 'Need weapons'`.
3. Or statically: call `getDiplomacyChoiceEligibility(state, event, 'militia')` on a `border_dispute` world with no spears/swords and read `blockReason`.

## Evidence

- `tests/low-2-events-defense.test.ts:240-252` (L33) asserts both `blockReason: 'Need spears'` (line 245) and the floated `'Need spears'` (line 251).
- `src/game/groupEvents.ts:943-947` is the only gate for that answer, and it returned `'Need weapons'`.
- The test file is untouched by the 2026-09-16 working-tree revision, so it is the authority; `getDiplomacyChoiceEligibility`'s siblings (`tribute`, `alliance`, `peace_treaty`) all report their exact shortfall (`'Need 30🍖'`, `'Need 25🍖 + 15💰'`, …), and their cases pass.

## Root cause

The 2026-09-16 damaged revision of `src/game/groupEvents.ts` changed the `border_dispute` militia gate's message to the generic `'Need weapons'` string. Nothing else in the file or the resolver changed, so only the player-visible reason and the pinned contract diverged.

## Regression test

`tests/low-2-events-defense.test.ts` — `L33 — the diplomacy resolver answers through the eligibility owner > applies the owner gate to the non-resource militia answer too` (pre-existing; it failed before the fix and passes after it). No new test was added, because the pinned case already asserts both the owner's reason and the float it drives.

## Invariants checked

`respondToDiplomacyEvent` still validates through the eligibility owner before mutating anything (no duplicate payment, no consumed card), and the `tribute` / `alliance` / `peace_treaty` cases in the same file remain green.

## Save/migration impact

None. The reason string is transient UI text; no save field, key or migration is involved.

## Verification result

- `npx vitest run tests/low-2-events-defense.test.ts` — passed (11 tests).
- `npm test` — passed: **143 files / 796 tests, 0 failures**.
- `npm run test:full-year` — passed (exit 0, 360 days / 25,920 ticks).

## Related commits or files

- `src/game/groupEvents.ts:945` — `'Need weapons'` → `'Need spears'`
- `tests/low-2-events-defense.test.ts:240-252` — the pinning case (unchanged)

## Fix

The `border_dispute`/`militia` gate in `getDiplomacyChoiceEligibility` returns `'Need spears'` again. `getShowStrengthEligibility` (`groupEvents.ts:722-732`) keeps its own `'Need weapons'` message: it is a different answer owned by a different rule, and no test or documented contract pins it to the militia wording, so it was deliberately left alone rather than changed without evidence.

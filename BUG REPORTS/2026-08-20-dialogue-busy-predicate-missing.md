# Bug: Connected humanChat lacks the dialogue-busy predicate required by social selection

- **Status:** fixed pending live verification
- **Date discovered:** 2026-08-20
- **Version/build:** Wilderfolk 0.6.1.1
- **Reporter:** Full movement and lifecycle audit
- **Area:** Play | Truth | performance
- **Owner module:** `src/game/humanChat.ts`
- **Cadence:** staggered-social

## Status history

- 2026-08-20 — open (full-suite runtime failure exposed a missing exported predicate)
- 2026-08-20 — investigating (confirmed connected humanChat snapshot lacked the API)
- 2026-08-20 — fixed (authoritative read-only predicate added and full suite passed)

## Observed behavior

The connected project’s `humanSocial.ts` now imports `isDialogueBusy` to prevent ambient social selection from choosing participants in an active dialogue session. The runtime `humanChat.ts` does not export that predicate, so Vitest reports `TypeError: isDialogueBusy is not a function` during `gameTick`.

This failure affects any tick that reaches ambient chat and caused six full-suite test failures after the social-selection repair.

## Expected behavior

The dialogue owner must expose one authoritative busy predicate that treats either active `chatTicks` or an active `chatDialogueSessionKey` as busy. Social selectors and dialogue writers must use the same predicate.

## Root cause

The connected project contains the newer social selector but an older humanChat owner. The two files drifted during the simulation split, creating an API mismatch and no shared dialogue-session availability contract.

## Fix

Add and export `isDialogueBusy` in `src/game/humanChat.ts` and use it from ambient/social helpers. Keep the predicate read-only and do not change dialogue cadence or session transitions.

## Regression test

The existing social dialogue-session tests must cover workplace, neighbor, and ambient selection with `chatTicks = 0` and an active session key. The full suite must pass.

## Invariants checked

- One paired dialogue session remains authoritative.
- Static and ambient social writers cannot clear active session state.
- No movement, lifecycle, pregnancy, or save-state behavior changes.

## Save/migration impact

None. This is a transient dialogue API repair.

## Verification result

- Focused social/dialogue validation passed.
- Full suite after repair: 51 files / 334 tests passed.
- TypeScript validation: passed.
- ESLint: passed.
- Live dialogue verification: pending.

## Related files

- `src/game/humanChat.ts`
- `src/game/simulation/humanSocial.ts`
- `tests/socialLife.dialogueBusy.test.ts`

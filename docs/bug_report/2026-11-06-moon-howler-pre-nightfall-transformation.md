# Full-moon predicate activates the Moon Howler before nightfall

- Bug: `isFullMoonNight` returns true during 00:00–05:59 *before* 22:00 nightfall on a full-moon day.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-06
- Version/build: main `6e9dd6bfcd525cb1df3d8960a636069f5aa240c7` (original); PR #126 documentation branch (correction)
- Reporter: static code audit; no observed save provided
- Area: day cycle / Moon Howler
- Owner module: `src/game/daycycleconstants.ts` (`isFullMoonNight`), consumed by `src/game/moonHowler.ts`
- Related PR: #126

## Status history
- 2026-11-06 — investigating: confirmed unintended boolean branch by static trace; corrected the branch on PR #126; not runtime-verified.

## Observed behavior
With an absolute full-moon day `D` divisible by 14, the old `isFullMoonNight(D, 0..5)` returns true, so the sync function transforms an already-cursed adult at midnight *before* the intended 22:00 start. It reverts them at 06:00 and transforms again at 22:00. The following morning at `D+1` is correctly treated as a continuation.

## Expected behavior
Full-moon form is active exactly from **22:00 on full-moon day D** until (but excluding) **06:00 on D+1**. On `D` between 00:00 and 05:59 it is not yet full-moon night unless the preceding day was itself a full-moon day (which the 14-day cycle excludes).

## Reproduction steps
1. Inspect `isFullMoonNight` in `src/game/daycycleconstants.ts` at the original main commit.
2. For any full-moon day D, read the return value at hours 0, 5, 6, 21, 22 and 23; compare with D+1 at 0, 5 and 6.
3. Trace `moonHowler.syncMoonHowlerForms` which transforms when `shouldMoonHowlerTransform` returns true. No tests or game simulations were executed.

## Evidence
Original branch: `if (isFullMoonDay(colonyDay)) return true;` executes during hours 0–5 despite the intended 22:00 nightfall. `syncMoonHowlerForms` uses this predicate for transformation and reversion.

## Root cause
Verified full-moon-day predicate precedes the hour-specific early-morning previous-day check.

## Fix / proposed fix
PR #126 changes the predicate to return `isFullMoonDay(colonyDay)` only for `hourOfDay >= MOON_HOWLER_NIGHT_START`, and to check `isFullMoonDay(colonyDay - 1)` only for `hourOfDay < NIGHT_END`. Reuse the existing day-cycle owner; no new form-state flag.

## Save/migration impact
None to save schema. Existing saves loading in the now-corrected 00:00–05:59 window may immediately restore a cursed werewolf to human form. Existing cursed status is preserved.

## Verification result
- Direct static source comparison — completed.
- Runtime checks, tests, typecheck, lint, build and CI — NOT RUN by owner request.

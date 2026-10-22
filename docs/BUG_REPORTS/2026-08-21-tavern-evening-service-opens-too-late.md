# Bug: Tavern evening service opens too late

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: v0.6.2.1
- Reporter: Automated release validation
- Area: Play
- Owner module: `src/game/dayCycle.ts`
- Cadence: Pure clock-hour query used by innkeeper and tavern presentation

## Status history

- 2026-08-21 — open (the full v0.6.2.1 suite failed `tests/dayCycle.tavern.test.ts`: `isTavernOpen(18)` returned false).
- 2026-08-21 — investigating (the declared evening service contract is 17:00–22:59, but `TAVERN_SHIFT_START` was 19).
- 2026-08-21 — resolved (`TAVERN_SHIFT_START` restored to 17; focused contract and complete v0.6.2.1 validation passed).

## Observed behavior

At 18:00, `isTavernOpen(18)` returns false. The innkeeper therefore cannot begin the stated evening tavern service until 19:00.

## Expected behavior

The tavern should be open from 17:00 through 22:59, matching its documented evening-service window and existing test expectation. Festival mode remains an all-day override.

## Reproduction steps

1. Run `npm test -- --run tests/dayCycle.tavern.test.ts`.
2. Observe the assertion that `isTavernOpen(18)` is false.
3. Inspect `TAVERN_SHIFT_START` in `src/game/dayCycle.ts`.

## Evidence

Focused validation output reported: `expected false to be true` at `tests/dayCycle.tavern.test.ts:10`, for `isTavernOpen(18)`.

## Root cause

`TAVERN_SHIFT_START` was set to `19` while `isTavernServiceHour()` is the sole predicate for normal tavern opening. This conflicts with the documented 17:00–22:59 service window.

## Fix

Restore `TAVERN_SHIFT_START` to `17`. No new condition, owner, or cadence is introduced.

## Regression test

`tests/dayCycle.tavern.test.ts` verifies that 18:00 and 22:00 are open, 09:00 is closed, and active festivals override the usual hours.

## Invariants checked

- `isTavernOpen()` remains the only normal/festival tavern-open predicate.
- `isOnInnkeeperShift()` continues to delegate to that predicate.
- Festival override behavior remains unchanged.

## Save/migration impact

None.

## Verification result

Resolved. `npm test -- --run tests/dayCycle.tavern.test.ts` passed all 4 tests. The final single-worker suite passed **68 files / 394 tests**, and the production build completed successfully. Existing bundle circular-chunk and large-chunk warnings remain unchanged.

## Related commits or files

- `src/game/dayCycle.ts`
- `tests/dayCycle.tavern.test.ts`
- `CHANGELOG.md`

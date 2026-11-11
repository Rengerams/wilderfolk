# Worker/main parity test claims five days but simulates only 20 hours

- Bug: Worker/main parity test claims five days but simulates only 20 hours.
- Status: resolved — two-day worker/main parity and full CI passed
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: V.0.6.5.2 development, main 926eb5f
- Reporter: supplemental simulation audit
- Area: simulation integration tests and determinism
- Owner module: `tests/workerMainThread.parity.test.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/141

## Status history
- 2026-11-11 — investigating: source-level contract mismatch confirmed; minimal test/harness correction committed.
- 2026-11-11 — resolved: worker/main parity passed on the expanded 576-tick fixture in Node.js CI 43005608136.

## Observed behavior
The test declares `TICKS=240` with a comment claiming five colony days, but the canonical `TICKS_PER_DAY=288` (12 ticks/hour × 24h). Starting at 08:00, 240 ticks cover only 20 hours and a single midnight; several daily social/production cycles and repeated midnight transitions are untested by this parity fixture.

## Expected behavior
The worker parity coverage horizon must use the canonical clock and cover multiple real day boundaries.

## Reproduction steps
1. Read `tests/workerMainThread.parity.test.ts`: `const TICKS = 240; // 5 colony days`.
2. Read `dayCycleClock.TICKS_PER_DAY`: 24 × 12 = 288.
3. 240 / 288 = 0.833333... days. The test starts at 08:00 and ends at 04:00 the next day.

## Evidence
Inspected `main` at `926eb5f` and the source paths above. This is a deterministic source-level audit, not a claimed execution of the failing fixture.

## Root cause
The fixture's tick count and comment were left inconsistent with the 288-tick canonical day.

## Fix / proposed fix
Set `TICKS = TICKS_PER_DAY * 2`, import the canonical constant, and assert a two-day boundary transition before comparing worker/main RNG and save payloads. Keep the existing worker protocol and parity assertions.

## Save/migration impact
None. Only test/harness logic changes; no gameplay state, persisted schema, or user-facing balance changes.

## Verification result
PASS: Node.js CI [43005608136](https://github.com/Rengerams/wilderfolk/actions/runs/43005608136), `tests/workerMainThread.parity.test.ts` (1/1, 2.146 seconds), including the two-day boundary assertion and RNG/save comparisons. Full standard gate: 505 files passed, 3,276 tests passed, 2 skipped; production build passed.

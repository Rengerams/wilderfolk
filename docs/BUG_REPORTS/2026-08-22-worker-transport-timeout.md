# Bug: Shared worker transport test can time out during the full suite

- Status: resolved — repeated full-suite validation passed
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Area: tests | worker transport | validation

## Observed behavior

A full `vitest` run completed 80 of 81 test files and 445 of 446 tests, but `tests/gameWorker.transport.test.ts` timed out at its 10-second test timeout while waiting for the shared worker transport round trip. The same run reported one failure and exited non-zero.

## Context

The timeout appeared after the venue-shift changes. It is not a TypeScript error and does not occur in the focused venue, workforce, or security suites. The existing game-loop transport tests also emitted their normal fallback-related stderr messages.

## Expected behavior

The worker transport test should start the isolated worker, deliver a headless tick, accept a valid command, reject an invalid command, export the authoritative world, and complete within the configured test timeout during both focused and full-suite runs.

## Reproduction

From the project root:

```text
npx --no-install vitest run --reporter=dot
```

Observed in one full-suite run on 2026-08-22:

```text
Test Files  1 failed | 80 passed (81)
Tests       1 failed | 445 passed (446)
Timeout     tests/gameWorker.transport.test.ts:32:14
```

## Related validation

The venue schedule, security role, and workforce transition slice passed with 3 files / 26 tests. TypeScript checking passed before the full-suite run.

## Next investigation

Check worker teardown and startup contention under the full Vitest suite, then make the transport test deterministic without weakening its assertions or changing Simulation Authority behavior.

## Related files

- `tests/gameWorker.transport.test.ts`
- `src/game/simWorker/`
- `src/game/venueSchedule.ts`
- `src/game/workforce.ts`

## Verification result

Resolved — the redundant dialogue preload in `src/game/simWorker/gameWorker.node.ts` was removed. Two consecutive full-suite runs on 2026-08-24 passed with **89 files / 508 tests** each (including `tests/gameWorker.transport.test.ts`), plus TypeScript and source-integrity checks.

## Review update — 2026-08-22

The Node worker adapter was found to perform an unnecessary asynchronous dialogue disk preload before importing `gameWorker.ts`. The shared worker bootstrap already installs the canonical bundled dialogue bank synchronously. The adapter now skips that redundant preload to reduce startup I/O variance and worker readiness contention without changing authoritative simulation state.

Focused and full-suite runtime validation remains required after this change. The original timeout report stays open until repeated isolated and full-suite runs pass.

## Close — 2026-08-24

Two consecutive full-suite runs passed (89 files / 508 tests each); the transport test completed within the configured timeout in both. Closing as resolved.

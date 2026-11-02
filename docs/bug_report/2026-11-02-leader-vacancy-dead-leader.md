# A dead leader stays in office while an election is pending

- Bug: when the leader dies, the office can keep their id until the pending election resolves, so the simulation invariant "the leader references a living acting head" fails.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `acea0183`
- Reporter: housing audits (independent workers)
- Area: leadership
- Owner module: src/game/villageLeadership.ts (`tickLeaderVacancy`), src/game/humanLifecycleCleanup.ts (`killHuman`)
- Related PR/commit: second audit round

## Status history

- 2026-11-02 — open: recorded by the audit round.
- 2026-11-02 — resolved: death clears `villageLeaderId` (the vacancy tick repairs old saves); the manor phase keeps the family in place until the election.

## Observed behavior

Batch full-year run: `villageLeaderId 834 does not reference a living acting village head`; the leader dies at tick 12376 and the id survives to day 360. `tickLeaderVacancy` returns early while `pendingElectionYear != null`.

## Expected behavior

Death clears or replaces the office immediately (acting head), independent of the election calendar.

## Reproduction / evidence

1. Run the full-year integration test in a batch; the leader dies before the election.
2. The invariant check fails at the next day boundary.

## Root cause

`killHuman` does not clear `villageLeaderId`, and the vacancy tick is skipped while an election is pending.

## Proposed fix

Clear the office on death and let the vacancy/acting-head path run even with a pending election.

## Regression coverage

`tests/fullYear.integration.test.ts` fails in the batch; no focused regression yet.

## Save compatibility

Office id only; a save with a dead leader id is repaired on the next vacancy tick.

## Verification

Fixed: 35-file housing suite 171 tests pass, including the succession test that kills the leader and asserts the family stays in the manor. The full-year batch was not rerun.

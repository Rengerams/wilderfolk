# A cleared office arms the succession silently

- Bug: when the death handler has already cleared `villageLeaderId`, `tickLeaderVacancy` arms `pendingElectionYear` but returns no notice and logs no election event, so the daily news never tells the player a succession was scheduled.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree at `b29d2b48`
- Reporter: the pre-existing failing regression in `tests/villageLeadership.test.ts`
- Area: leadership
- Owner module: src/game/villageLeadership.ts (`tickLeaderVacancy`)
- Related PR/commit: fixed 2 November 2026

## Status history

- 2026-11-02 — open: the committed regression "a stale date blocks every future vacancy, and clearing it restores scheduling" failed at HEAD and already at `b2fe5dcf`.
- 2026-11-02 — resolved: the empty-office branch now logs the election event and returns the vacancy notice.

## Observed behavior

`makeWorld([deadLeader, settler], [], 2, { pendingElectionYear: null })`: `tickLeaderVacancy` sets `pendingElectionYear` to the due date but returns `null`. In the real flow `killHuman` clears the office on death, so every natural death reaches this branch.

## Expected behavior

The daily vacancy tick reports the vacancy it schedules; its caller in `dailyWorldEvents` turns that notice into big news and a notification.

## Reproduction / evidence

1. `npx vitest run tests/villageLeadership.test.ts`
2. `villageLeadership.vacancy.test.ts` → "a stale date blocks every future vacancy…"
3. `expect(tickLeaderVacancy(healed)).not.toBeNull()` failed with `expected null not to be null` at `b29d2b48`; the same failure reproduced in a clean worktree at `b2fe5dcf`.

## Root cause

The `villageLeaderId == null` branch scheduled the successor election and returned `null` without logging the election event.

## Fix (applied)

The branch shares the `electionYear` calculation, logs the election event and returns the vacancy notice; it still schedules nothing while a ceremony is running, since that ceremony fills the seat.

## Regression coverage

`tests/villageLeadership.test.ts` — the existing case now passes (it failed before the fix and at the base commit).

## Save compatibility

None: in-memory state only.

## Verification

`npx vitest run tests/villageLeadership.test.ts tests/vacancyElection.succession.test.ts tests/medium-B2-leadership.test.ts tests/leaderHouse.successionHousehold.test.ts` — 38 passed.

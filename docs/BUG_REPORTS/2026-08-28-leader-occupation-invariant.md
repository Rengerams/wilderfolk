# Bug: A living leader can lose the `leader` occupation during a full-year simulation

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Local full-year integration test
- Area: Truth | simulation | leadership | workforce
- Owner module: To be determined; likely leadership/residency/workforce reconciliation
- Cadence: Reproduced at day 90 in a daily simulation check

## Status history

- 2026-08-28 — investigating: restored local `fullYear.integration.test.ts` and reproduced the invariant failure at day 90 with deterministic seed `12345`.
- 2026-09-09 — resolved: full-year seed-12345 run passes day-90/180/270/360 leader-occupation invariants (`npx vitest run tests/fullYear.integration.test.ts`). `applyLeaderOccupation` (leaderHouse.ts:42-79) stamps the office at handover and load; workforce transitions preserve a living leader's occupation (`keepOffice` in workforce.ts). Verified against HEAD 2026-09-09.
- 2026-09-10 — **regressed, then re-resolved with a real root cause.** The same invariant failed at day 60 on a different seeded trajectory (leader 657, the founding leader, never re-elected, never transformed), because the actual leak was never closed: a scandal arrest stamped `occupation = 'settler'` with no office guard and prisoners were released without restoring it. Stamping at handover and load only hid it on trajectories where nobody was jailed. See `2026-09-10-leader-office-lost-on-scandal-arrest.md`, which fixes the two transitions and also hardens the Moon Howler revert path that had the same shape. The root cause section below is therefore superseded.

## Observed behavior

The local annual test fails at day 90 because a living leader (entity ID 654 in the reproduced run) does not hold the `leader` occupation.

## Expected behavior

A living colony leader retains the `leader` occupation while retaining any valid normal workplace and manor residency, as required by the project authority.

## Reproduction steps

1. Run `npm run test:full-year:test`.
2. Simulate the deterministic 360-day scenario with seed `12345`.
3. Observe the day-90 invariant failure: `leader 654 does not hold the "leader" occupation`.

## Evidence

The restored local annual test completed simulation ticks until day 90 and reported the failure from `collectSimulationInvariantErrors(world)`.

## Root cause

Pending code trace.

## Fix

Pending code trace. The fix must preserve single-owner workforce and leadership reconciliation rules.

## Regression test

The restored ignored local `tests/fullYear.integration.test.ts` must pass through day 360. Add or retain a focused leadership/workforce regression test for the identified transition.

## Invariants checked

- A living leader retains leader status and the `leader` occupation.
- Valid normal work must survive leadership/residency reconciliation.
- No duplicate workforce assignment or unowned state mutation is introduced.

## Save/migration impact

Pending root-cause analysis; no schema change is expected.

## Verification result

Pending investigation and a complete deterministic annual run.

## Related files

- `tests/fullYear.integration.test.ts`
- `src/game/leaderHouse.ts`
- `src/game/villageLeadership.ts`
- `src/game/workforce.ts`
- `src/game/tickLayerDaily.ts`

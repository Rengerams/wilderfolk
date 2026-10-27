# Bug: Leader’s new spouse is not moved into the Leader’s House after remarriage

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer, from local game event log
- Area: Play | Truth
- Owner module: `leaderHouse.ts` with marriage transitions in `humanRelationships.ts`
- Cadence: Daily/idempotent leadership-residency reconciliation after daily relationship decisions

## Status history

- 2026-08-28 — investigating: local game log recorded a leader divorce followed by a new marriage; the new spouse was not assigned to the Leader’s House.
- 2026-09-09 — still investigating: re-verified against HEAD — remarriage/divorce never triggers `syncLeaderHouseResidency`; `syncPartnerResidence` and divorce re-homing exclude the Leader’s House, so the new spouse does not join manor residency.
- 2026-09-10 — resolved: `tickLayerDaily` now calls the idempotent `syncLeaderHouseResidency` every colony day after relationship reconciliation (matching the schedule already documented in `decisionRegistry`). After a divorce/remarriage the current spouse and children join the manor and former household members are evicted to general housing. Regression tests in `tests/leaderRemarriage.residency.test.ts` (new-spouse move-in + idempotence).

## Observed behavior

Seymour Shively led the colony and his household moved into the Leader’s House on Year 0 Day 5. He divorced Aisha Shively on Day 9 and married Maude Shively on Day 10. The new spouse did not join the leader household residence.

## Expected behavior

A living leader retains Leader’s House residency. Once a new marriage is established, the current spouse joins the leader household and is assigned to the Leader’s House when it is completed, has capacity, and no higher-priority valid constraint prevents the move. A former spouse must not remain joined merely because of the old relationship.

## Reproduction steps

1. Start a settlement with a completed Leader’s House and an elected/founding leader assigned there.
2. Establish a marriage for the leader.
3. Resolve a divorce and then establish a second marriage for the same leader.
4. Advance the daily relationship and leader-residency reconciliation.
5. Inspect the leader, new spouse, and Leader’s House occupants.

## Evidence

Developer-provided local event log: the leader-house move occurred on Year 0 Day 5, divorce on Day 9, and remarriage on Day 10; the new spouse was absent from the Leader’s House.

## Root cause

Pending investigation of the ordered divorce, marriage, household-composition, and leader-house reconciliation paths.

## Fix

Pending investigation. Any fix must be idempotent, keep the Leader’s House owner in `leaderHouse.ts`, preserve valid work assignments, and avoid direct UI mutation.

## Regression test

Pending: cover divorce plus remarriage followed by daily leader-house reconciliation.

## Invariants checked

Leader retains valid leadership status and Leader’s House residency; the new spouse has at most one residence; building occupant and human residence references match; valid work assignment remains intact.

## Save/migration impact

Expected none — correct existing relationship/residence reconciliation using current state fields.

## Verification result

Pending.

## Related files

- `src/game/leaderHouse.ts`
- `src/game/humanRelationships.ts`
- `src/game/residency.ts` and focused residency successors
- `src/game/tickLayerDaily.ts`

# 2026-10-20 — Existing leader removed from Leader's House by rehousing

## Report
Repeated dev invariant on v0.6.5.1 settlement: `leader 1158 not residing in the Leader's House (#0)`; traceback `gameTick.ts:367` / `gameWorker.ts:350`. The same leader was already elected in the earlier save. Leadership itself remains recognized.

## Confirmed source defect
`syncLeaderHouseResidency` sets `residenceBuildingId` for the leader/spouse/dependent children, evicts no-longer-entitled manor residents, and, **when anyone moves/gets evicted**, immediately invokes general `assignMissingResidences` on **all villagers**. General family-unit reconciliation is allowed to reassign that protected leader household, thereby undoing the mansion assignment within the same method. Periodic calls to this method can repeat the error.

## Fix
- Commit `04a36af`: the generic rehousing pass receives only villagers **not** belonging to the protected leader household, while retaining the complete genealogy pool for family links. This prevents the inner rehousing pass from rewriting the leader's residence.
- Commit `11153b3`: regression with leader ID 1158 / manor ID 0, spouse, displaced resident and repeated reconciliation. Preserves leadership and no reset of Chronicle.

## Verification
Static fix committed, tests not executed by GitHub connector. Run `npx vitest run tests/leaderRemarriage.residency.test.ts`, `npm run build`, and observe daily invariant after reloading the affected colony. If warning persists, log original/updated residence ID at each mutation owner and inspect independent family/household actions; do not suppress the invariant.
